const express = require('express');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Check if ElevenLabs is configured
const elevenLabsEnabled = !!ELEVENLABS_API_KEY;
if (elevenLabsEnabled) {
  console.log('ElevenLabs enabled with voice:', ELEVENLABS_VOICE_ID);
} else {
  console.log('ElevenLabs not configured, will use Twilio Polly voices');
}

// Audio storage for ElevenLabs
const audioCache = new Map();
const audioUrls = new Map();

// Generate unique URL for audio
function getAudioUrl(req, hash) {
  return `${req.protocol}://${req.get('host')}/audio/${hash}.mp3`;
}

// Generate audio with ElevenLabs (using REST API directly)
async function generateElevenLabsAudio(text) {
  if (!ELEVENLABS_API_KEY) return null;
  
  try {
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        text: text,
        model_id: 'eleven_turbo_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': ELEVENLABS_API_KEY,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );
    
    return Buffer.from(response.data);
  } catch (err) {
    console.error('ElevenLabs TTS error:', err.response?.data || err.message);
    return null;
  }
}

// Fallback response generator
function generateFallbackResponse(input) {
  const text = input.toLowerCase();
  
  if (text.includes('time')) {
    const now = new Date();
    return `The current time is ${now.toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit' })}.`;
  }
  
  if (text.includes('weather')) {
    return 'I can help with weather information. Ask me about Melbourne or Adelaide weather.';
  }
  
  if (text.includes('hello') || text.includes('hi ')) {
    return 'Hello! I\'m your OpenClaw voice assistant. How can I help you?';
  }
  
  if (text.includes('help')) {
    return 'I can answer questions and help with various tasks. Ask me about the time, weather, or anything else!';
  }
  
  return 'I heard you say: ' + input + '. How can I help you with that?';
}

// Send message to OpenClaw
async function sendToOpenClaw(message, phoneNumber) {
  if (!GATEWAY_TOKEN) {
    console.log('No GATEWAY_TOKEN, using fallback');
    return generateFallbackResponse(message);
  }
  
  try {
    const response = await axios.post(
      `${GATEWAY_URL}/api/sessions/send`,
      {
        message: message,
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
    return generateFallbackResponse(message);
  }
}

// Voice webhook - initial call
app.post('/voice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = req.body.From;

  console.log(`Incoming call from ${from}`);

  try {
    const greeting = "Hello! I'm your OpenClaw assistant. How can I help you today?";
    
    // Try ElevenLabs first
    if (ELEVENLABS_API_KEY) {
      const audio = await generateElevenLabsAudio(greeting);
      if (audio) {
        const hash = require('crypto').createHash('md5').update(greeting).digest('hex');
        audioCache.set(hash, audio);
        const audioUrl = getAudioUrl(req, hash);
        twiml.play(audioUrl);
      } else {
        // Fallback to Twilio Polly
        twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, greeting);
      }
    } else {
      // No ElevenLabs, use Twilio Polly
      twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, greeting);
    }
    
    // Gather speech
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/respond',
      timeout: 5,
      speechTimeout: 'auto',
      language: 'en-AU'
    });

    const prompt = "I'm listening...";
    if (ELEVENLABS_API_KEY) {
      const audio = await generateElevenLabsAudio(prompt);
      if (audio) {
        const hash = require('crypto').createHash('md5').update(prompt).digest('hex');
        audioCache.set(hash, audio);
        gather.play(getAudioUrl(req, hash));
      } else {
        gather.say({ voice: 'Polly.Nicole', language: 'en-AU' }, prompt);
      }
    } else {
      gather.say({ voice: 'Polly.Nicole', language: 'en-AU' }, prompt);
    }

    // Fallback
    twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
      "Sorry, I didn't hear anything. Please call back when you're ready.");

  } catch (error) {
    console.error('Voice error:', error);
    twiml.say('Sorry, I encountered an error. Please try again later.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Voice response
app.post('/voice/respond', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const from = req.body.From;

  console.log(`Speech from ${from}: "${speechResult}"`);

  try {
    if (!speechResult) {
      twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
        "I didn't catch that. Could you repeat that?");
      
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

    // Get response
    const response = await sendToOpenClaw(speechResult, from);
    
    // Generate audio
    if (ELEVENLABS_API_KEY) {
      const audio = await generateElevenLabsAudio(response);
      if (audio) {
        const hash = require('crypto').createHash('md5').update(response).digest('hex');
        audioCache.set(hash, audio);
        twiml.play(getAudioUrl(req, hash));
      } else {
        twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, response);
      }
    } else {
      twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, response);
    }

    // Ask for more
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/respond',
      timeout: 5,
      speechTimeout: 'auto',
      language: 'en-AU'
    });

    const followup = "Is there anything else?";
    if (ELEVENLABS_API_KEY) {
      const audio = await generateElevenLabsAudio(followup);
      if (audio) {
        const hash = require('crypto').createHash('md5').update(followup).digest('hex');
        audioCache.set(hash, audio);
        gather.play(getAudioUrl(req, hash));
      } else {
        gather.say({ voice: 'Polly.Nicole', language: 'en-AU' }, followup);
      }
    } else {
      gather.say({ voice: 'Polly.Nicole', language: 'en-AU' }, followup);
    }

    twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, "Alright, goodbye!");

  } catch (error) {
    console.error('Response error:', error);
    twiml.say('Sorry, I encountered an error processing your request.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Serve audio files from memory
app.get('/audio/:hash.mp3', (req, res) => {
  const hash = req.params.hash;
  const audio = audioCache.get(hash);
  
  if (audio) {
    res.type('audio/mpeg');
    res.send(audio);
  } else {
    res.status(404).send('Audio not found');
  }
});

// SMS webhook
app.post('/sms', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const body = req.body.Body || '';
  const from = req.body.From;

  console.log(`SMS from ${from}: "${body}"`);

  try {
    const response = await sendToOpenClaw(body, from);
    twiml.message(response);
  } catch (error) {
    console.error('SMS error:', error);
    twiml.message('Sorry, I encountered an error. Please try again.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Health check
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openclaw-voice',
    version: '3.2.0',
    elevenLabsEnabled: !!ELEVENLABS_API_KEY,
    voiceId: ELEVENLABS_VOICE_ID,
    gatewayConnected: !!GATEWAY_TOKEN,
    uptime: process.uptime()
  });
});

app.listen(port, () => {
  console.log(`OpenClaw Voice listening on port ${port}`);
  console.log(`ElevenLabs: ${ELEVENLABS_API_KEY ? 'Enabled' : 'Disabled (using Twilio Polly)'}`);
  console.log(`Gateway: ${GATEWAY_URL || 'Not configured'}`);
});
