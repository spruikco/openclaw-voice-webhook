const express = require('express');
const axios = require('axios');
const twilio = require('twilio');

const app = express();
const port = process.env.PORT || 3000;

// Configuration
const GATEWAY_URL = process.env.GATEWAY_URL;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

console.log('ElevenLabs API Key:', ELEVENLABS_API_KEY ? 'Set' : 'Not set');
console.log('ElevenLabs Voice ID:', ELEVENLABS_VOICE_ID);

// Audio cache in memory
const audioCache = new Map();

// Twilio client for sending SMS
const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN 
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

// Contact name lookup
const CONTACTS = {
  '+61421242330': 'Rosie',
  '+61403149183': 'Mum',
  '+61434349454': 'Rye',
  '+61449991539': 'Ben Anderson',
};

function getContactName(phoneNumber) {
  return CONTACTS[phoneNumber] || phoneNumber;
}

// Generate ElevenLabs audio with timeout
async function generateElevenLabsAudio(text, timeoutMs = 8000) {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not set');
  }
  
  const cacheKey = `${ELEVENLABS_VOICE_ID}:${text}`;
  if (audioCache.has(cacheKey)) {
    console.log('Using cached audio');
    return audioCache.get(cacheKey);
  }
  
  console.log(`Generating ElevenLabs audio: "${text.substring(0, 50)}..."`);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
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
        responseType: 'arraybuffer',
        signal: controller.signal,
        timeout: timeoutMs
      }
    );
    
    clearTimeout(timeout);
    
    const buffer = Buffer.from(response.data);
    audioCache.set(cacheKey, buffer);
    console.log(`Generated ${buffer.length} bytes of audio`);
    
    // Limit cache size
    if (audioCache.size > 50) {
      const firstKey = audioCache.keys().next().value;
      audioCache.delete(firstKey);
    }
    
    return buffer;
  } catch (err) {
    console.error('ElevenLabs error:', err.message);
    throw err;
  }
}

// Fallback responses
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

// Send to OpenClaw
async function sendToOpenClaw(message, phoneNumber) {
  if (!GATEWAY_TOKEN) {
    return generateFallbackResponse(message);
  }
  
  try {
    const response = await axios.post(
      `${GATEWAY_URL}/api/sessions/send`,
      {
        message: message,
        label: `voice-${phoneNumber}`,
        agentId: 'main',
        timeoutSeconds: 25
      },
      {
        headers: {
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return response.data.message || response.data.response || 'I didn\'t catch that.';
  } catch (error) {
    console.error('OpenClaw error:', error.message);
    return generateFallbackResponse(message);
  }
}

// Forward SMS to main Telegram chat (no response expected)
async function forwardSMSToTelegram(message, from) {
  if (!GATEWAY_TOKEN) {
    console.log('No gateway token, cannot forward SMS');
    return;
  }
  
  try {
    const contactName = getContactName(from);
    const formattedMessage = `📱 SMS from ${contactName} (${from}):\n\n${message}`;
    
    await axios.post(
      `${GATEWAY_URL}/api/cron/wake`,
      {
        text: formattedMessage,
        mode: 'now'
      },
      {
        headers: {
          'Authorization': `Bearer ${GATEWAY_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    
    console.log(`Forwarded SMS from ${contactName} to Telegram`);
  } catch (error) {
    console.error('Failed to forward SMS to Telegram:', error.message);
  }
}

// Voice webhook
app.post('/voice', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const from = req.body.From;

  console.log(`Call from ${from}`);

  const greeting = "Hello! I'm your OpenClaw assistant. How can I help you today?";
  
  try {
    // Try ElevenLabs with 5s timeout
    const audio = await generateElevenLabsAudio(greeting, 5000);
    const hash = require('crypto').createHash('md5').update(greeting).digest('hex');
    audioCache.set(`audio:${hash}`, audio);
    
    twiml.play(`${req.protocol}://${req.get('host')}/audio/${hash}.mp3`);
  } catch (err) {
    console.log('ElevenLabs failed, using Polly:', err.message);
    twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, greeting);
  }
  
  const gather = twiml.gather({
    input: 'speech',
    action: '/voice/respond',
    timeout: 5,
    speechTimeout: 'auto',
    language: 'en-AU'
  });

  twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, "Goodbye!");

  res.type('text/xml');
  res.send(twiml.toString());
});

// Voice response
app.post('/voice/respond', async (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  const speechResult = req.body.SpeechResult || '';
  const from = req.body.From;

  console.log(`Speech: "${speechResult}"`);

  try {
    if (!speechResult) {
      twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
        "I didn't catch that. Could you repeat?");
      
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

    // Get response with timeout
    const response = await Promise.race([
      sendToOpenClaw(speechResult, from),
      new Promise((resolve) => setTimeout(() => resolve('That took too long. Try again?'), 18000))
    ]);
    
    // Try ElevenLabs for response
    try {
      const audio = await generateElevenLabsAudio(response, 5000);
      const hash = require('crypto').createHash('md5').update(response).digest('hex');
      audioCache.set(`audio:${hash}`, audio);
      
      twiml.play(`${req.protocol}://${req.get('host')}/audio/${hash}.mp3`);
    } catch (err) {
      console.log('ElevenLabs failed, using Polly');
      twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, response);
    }

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
    console.error('Error:', error);
    twiml.say({ voice: 'Polly.Nicole', language: 'en-AU' }, 
      'Sorry, I encountered an error.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

// Serve audio from memory
app.get('/audio/:hash.mp3', (req, res) => {
  const hash = req.params.hash;
  const audio = audioCache.get(`audio:${hash}`);
  
  if (audio) {
    res.type('audio/mpeg');
    res.send(audio);
  } else {
    res.status(404).send('Not found');
  }
});

// SMS webhook - forward to Telegram, no auto-reply
app.post('/sms', async (req, res) => {
  const body = req.body.Body || '';
  const from = req.body.From;

  console.log(`SMS from ${from}: "${body}"`);

  // Forward to Telegram (fire and forget)
  forwardSMSToTelegram(body, from).catch(err => {
    console.error('Forward failed:', err.message);
  });

  // NO auto-reply - just acknowledge receipt to Twilio
  res.type('text/xml');
  res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
});

// SMS reply API - for sending outbound SMS
app.post('/api/sms-reply', async (req, res) => {
  const authHeader = req.headers.authorization;
  const expectedToken = 'Bearer c3531ac0f6242bada467b242f1d37a71e2cbd510ec87d75adfad58fd508bd26a';
  
  if (authHeader !== expectedToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, message } = req.body;
  
  if (!to || !message) {
    return res.status(400).json({ error: 'Missing to or message' });
  }

  if (!twilioClient) {
    return res.status(500).json({ error: 'Twilio not configured' });
  }

  try {
    const result = await twilioClient.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: to
    });

    res.json({ success: true, sid: result.sid });
  } catch (error) {
    console.error('SMS send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Status
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openclaw-voice',
    version: '3.6.0',
    elevenLabs: !!ELEVENLABS_API_KEY,
    voiceId: ELEVENLABS_VOICE_ID,
    cachedAudio: audioCache.size,
    gateway: !!GATEWAY_TOKEN,
    twilioConfigured: !!twilioClient,
    uptime: process.uptime()
  });
});

app.listen(port, () => {
  console.log(`OpenClaw Voice v3.6 on port ${port}`);
  console.log(`ElevenLabs: ${ELEVENLABS_API_KEY ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Twilio: ${twilioClient ? 'ENABLED' : 'DISABLED'}`);
  console.log(`SMS forwarding to Telegram: ${GATEWAY_TOKEN ? 'ENABLED' : 'DISABLED'}`);
});
