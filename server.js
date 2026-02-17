const express = require('express');
const axios = require('axios');
const twilio = require('twilio');
const crypto = require('crypto');
const AWS = require('aws-sdk');
let ElevenLabs;
try {
  ElevenLabs = require('elevenlabs-node');
} catch (e) {
  console.log('ElevenLabs module not found - will use Polly only');
}

const app = express();
const port = process.env.PORT || 3000;

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://gateway.openclaw.ai';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB'; // Adam

// AWS Polly setup (fallback)
const polly = new AWS.Polly({
  region: 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'placeholder',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'placeholder'
});

// ElevenLabs setup (primary)
let voice = null;
if (ELEVENLABS_API_KEY && ElevenLabs) {
  try {
    voice = new ElevenLabs({
      apiKey: ELEVENLABS_API_KEY,
      voiceId: ELEVENLABS_VOICE_ID
    });
    console.log('ElevenLabs voice enabled');
  } catch (e) {
    console.log('ElevenLabs initialization failed:', e.message);
  }
}

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Audio cache
const audioCache = new Map();
const AUDIO_DIR = '/tmp/audio';
const fs = require('fs');
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Generate audio from text
async function generateAudio(text) {
  const hash = crypto.createHash('md5').update(text).digest('hex');
  const filename = `${hash}.mp3`;
  const filepath = `${AUDIO_DIR}/${filename}`;

  // Check cache
  if (fs.existsSync(filepath)) {
    return `${filename}`;
  }

  // Try ElevenLabs first
  if (voice) {
    try {
      const audio = await voice.textToSpeech({
        text: text,
        voice_id: ELEVENLABS_VOICE_ID,
        model_id: 'eleven_turbo_v2'
      });
      
      fs.writeFileSync(filepath, audio);
      return filename;
    } catch (err) {
      console.error('ElevenLabs failed, falling back to Polly:', err.message);
    }
  }

  // Fallback to Polly
  const params = {
    Text: text,
    OutputFormat: 'mp3',
    VoiceId: 'Matthew', // US male voice
    Engine: 'neural'
  };

  const data = await polly.synthesizeSpeech(params).promise();
  fs.writeFileSync(filepath, data.AudioStream);
  return filename;
}

// Fallback response generator (when OpenClaw not configured)
function generateFallbackResponse(input) {
  const text = input.toLowerCase();
  
  if (text.includes('time')) {
    const now = new Date();
    return `The current time is ${now.toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit' })}.`;
  }
  
  if (text.includes('weather')) {
    return 'I can help with weather information. OpenClaw integration is not configured yet.';
  }
  
  if (text.includes('hello') || text.includes('hi ')) {
    return 'Hello! I\'m your OpenClaw voice assistant. How can I help you?';
  }
  
  if (text.includes('help')) {
    return 'I can answer questions and help with various tasks. Ask me about the time, weather, or anything else!';
  }
  
  return 'I heard you say: ' + input + '. OpenClaw integration is not configured yet, but I\'m ready when you are!';
}

// Send message to OpenClaw session
async function sendToOpenClaw(message, phoneNumber) {
  // If no gateway token, use fallback
  if (!GATEWAY_TOKEN) {
    console.log('No GATEWAY_TOKEN set, using fallback responses');
    return generateFallbackResponse(message);
  }
  
  try {
    const response = await axios.post(
      `${GATEWAY_URL}/api/sessions/send`,
      {
        message: message,
        // Create or use existing session for this phone number
        label: `voice-${phoneNumber}`,
        agentId: 'main',
        timeoutSeconds: 30
      },
      {
        headers: {
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.message || response.data.response || 'I didn\'t catch that.';
  } catch (error) {
    console.error('OpenClaw API error:', error.response?.data || error.message);
    return 'Sorry, I\'m having trouble connecting to OpenClaw. Using fallback: ' + generateFallbackResponse(message);
  }
}

// Voice webhook - initial call
app.post('/voice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = req.body.From;

  console.log(`Incoming call from ${from}`);

  try {
    // Generate greeting
    const greeting = await generateAudio("Hello! I'm your OpenClaw assistant. How can I help you today?");
    
    twiml.play(`${req.protocol}://${req.get('host')}/audio/${greeting}`);
    
    // Gather speech input
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/respond',
      timeout: 5,
      speechTimeout: 'auto',
      language: 'en-AU'
    });

    const prompt = await generateAudio("I'm listening...");
    gather.play(`${req.protocol}://${req.get('host')}/audio/${prompt}`);

    // Fallback if no input
    const fallback = await generateAudio("Sorry, I didn't hear anything. Please call back when you're ready.");
    twiml.play(`${req.protocol}://${req.get('host')}/audio/${fallback}`);

  } catch (error) {
    console.error('Voice error:', error);
    twiml.say('Sorry, I encountered an error. Please try again later.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Voice response - handle speech input
app.post('/voice/respond', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const from = req.body.From;

  console.log(`Speech from ${from}: "${speechResult}"`);

  try {
    if (!speechResult) {
      const noSpeech = await generateAudio("I didn't catch that. Could you repeat that?");
      twiml.play(`${req.protocol}://${req.get('host')}/audio/${noSpeech}`);
      
      const gather = twiml.gather({
        input: 'speech',
        action: '/voice/respond',
        timeout: 5,
        speechTimeout: 'auto',
        language: 'en-AU'
      });
      
      res.type('text/xml');
      res.send(twiml.toString());
      return;
    }

    // Send to OpenClaw and get response
    const response = await sendToOpenClaw(speechResult, from);
    
    // Generate audio response
    const audioFile = await generateAudio(response);
    twiml.play(`${req.protocol}://${req.get('host')}/audio/${audioFile}`);

    // Ask if they need anything else
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/respond',
      timeout: 5,
      speechTimeout: 'auto',
      language: 'en-AU'
    });

    const followup = await generateAudio("Is there anything else?");
    gather.play(`${req.protocol}://${req.get('host')}/audio/${followup}`);

    // Goodbye if no response
    const goodbye = await generateAudio("Alright, goodbye!");
    twiml.play(`${req.protocol}://${req.get('host')}/audio/${goodbye}`);

  } catch (error) {
    console.error('Response error:', error);
    twiml.say('Sorry, I encountered an error processing your request.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// SMS webhook
app.post('/sms', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const body = req.body.Body || '';
  const from = req.body.From;

  console.log(`SMS from ${from}: "${body}"`);

  try {
    // Send to OpenClaw
    const response = await sendToOpenClaw(body, from);
    twiml.message(response);
  } catch (error) {
    console.error('SMS error:', error);
    twiml.message('Sorry, I encountered an error. Please try again.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Serve audio files
app.use('/audio', express.static(AUDIO_DIR));

// Health check
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openclaw-voice-integrated',
    version: '3.0.0',
    elevenlabs: !!ELEVENLABS_API_KEY,
    voiceId: ELEVENLABS_VOICE_ID,
    gatewayConnected: !!GATEWAY_TOKEN,
    uptime: process.uptime()
  });
});

app.listen(port, () => {
  console.log(`OpenClaw Voice (Integrated) listening on port ${port}`);
  console.log(`ElevenLabs: ${ELEVENLABS_API_KEY ? 'Enabled' : 'Disabled'}`);
  console.log(`Gateway: ${GATEWAY_URL}`);
});
