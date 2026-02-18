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
console.log('ElevenLabs:', elevenLabsEnabled ? 'Enabled' : 'Disabled');
console.log('Gateway:', GATEWAY_URL || 'Not configured');

// Fallback response generator
function generateFallbackResponse(input) {
  const text = input.toLowerCase();
  
  if (text.includes('time')) {
    const now = new Date();
    return `The current time is ${now.toLocaleTimeString('en-AU', { timeZone: 'Australia/Melbourne', hour: 'numeric', minute: '2-digit', hour12: true })}.`;
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
        },
        timeout: 25000
      }
    );

    return response.data.message || response.data.response || 'I didn\'t catch that.';
  } catch (error) {
    console.error('OpenClaw API error:', error.message);
    return generateFallbackResponse(message);
  }
}

// Voice webhook - initial call
app.post('/voice', (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = req.body.From;

  console.log(`Incoming call from ${from}`);

  // Use Twilio's built-in voice (fast, reliable)
  twiml.say({ 
    voice: 'Polly.Nicole', 
    language: 'en-AU' 
  }, "Hello! I'm your OpenClaw assistant. How can I help you today?");
  
  // Gather speech
  const gather = twiml.gather({
    input: 'speech',
    action: '/voice/respond',
    timeout: 5,
    speechTimeout: 'auto',
    language: 'en-AU'
  });

  // Fallback
  twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
    "Sorry, I didn't hear anything. Goodbye!");

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
      
      twiml.gather({
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

    // Get response (with timeout to prevent hanging)
    const response = await Promise.race([
      sendToOpenClaw(speechResult, from),
      new Promise((resolve) => setTimeout(() => resolve('Sorry, that took too long. Please try again.'), 20000))
    ]);
    
    // Speak response
    twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, response);

    // Ask for more
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/respond',
      timeout: 5,
      speechTimeout: 'auto',
      language: 'en-AU'
    });

    gather.say({ voice: 'Polly.Nicole', language: 'en-AU' }, "Anything else?");

    twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, "Goodbye!");

  } catch (error) {
    console.error('Response error:', error);
    twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
      'Sorry, I encountered an error.');
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
    version: '3.4.0',
    voiceEngine: 'Twilio Polly',
    elevenLabsConfigured: elevenLabsEnabled,
    gatewayConnected: !!GATEWAY_TOKEN,
    uptime: process.uptime()
  });
});

app.listen(port, () => {
  console.log(`OpenClaw Voice v3.4 listening on port ${port}`);
  console.log(`Using: Twilio Polly.Nicole (Australian voice)`);
});
