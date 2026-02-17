#!/usr/bin/env node
/**
 * OpenClaw Voice Webhook Server
 * Twilio-compatible conversational voice assistant
 * 
 * Supports both AWS Polly (default) and ElevenLabs (premium)
 * 
 * Environment Variables:
 * - PORT: Server port (default: 3030)
 * - VOICE: Twilio voice name (default: Polly.Nicole)
 * - LANGUAGE: Voice language (default: en-AU)
 * - ELEVENLABS_API_KEY: Optional - enables ElevenLabs voices
 * - ELEVENLABS_VOICE_ID: Voice ID from elevenlabs.io (default: pNInz6obpgDQGcFmaJgB)
 */

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Configuration
const PORT = process.env.PORT || 3030;
const VOICE = process.env.VOICE || 'Polly.Nicole';
const LANGUAGE = process.env.LANGUAGE || 'en-AU';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB';
const USE_ELEVENLABS = !!ELEVENLABS_API_KEY;

// Audio cache directory (for ElevenLabs)
const AUDIO_DIR = path.join(__dirname, 'audio_cache');
if (USE_ELEVENLABS && !fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

// Serve audio files
app.use('/audio', express.static(AUDIO_DIR));

// Generate speech with ElevenLabs
async function generateSpeechElevenLabs(text) {
  return new Promise((resolve, reject) => {
    const audioId = crypto.randomBytes(16).toString('hex');
    const audioPath = path.join(AUDIO_DIR, `${audioId}.mp3`);
    const audioUrl = `/audio/${audioId}.mp3`;
    
    const postData = JSON.stringify({
      text: text,
      model_id: 'eleven_monolingual_v1',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });
    
    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        console.error(`ElevenLabs API error: ${res.statusCode}`);
        reject(new Error(`ElevenLabs API returned ${res.statusCode}`));
        return;
      }
      
      const writeStream = fs.createWriteStream(audioPath);
      res.pipe(writeStream);
      
      writeStream.on('finish', () => {
        console.log(`✓ Generated ElevenLabs audio: ${audioUrl}`);
        resolve(audioUrl);
      });
      
      writeStream.on('error', reject);
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Generate TwiML for Polly voice
function generatePollyTwiML(text) {
  return `<Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(text)}</Say>`;
}

// Generate TwiML for ElevenLabs voice
async function generateElevenLabsTwiML(text, baseUrl) {
  try {
    const audioUrl = await generateSpeechElevenLabs(text);
    return `<Play>${baseUrl}${audioUrl}</Play>`;
  } catch (error) {
    console.error('ElevenLabs error, falling back to Polly:', error);
    return generatePollyTwiML(text);
  }
}

// Main voice endpoint
app.post('/voice', async (req, res) => {
  const from = req.body.From || 'unknown';
  console.log(`📞 Incoming call from ${from}`);
  
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  try {
    let greetingTwiML, listeningTwiML, timeoutTwiML;
    
    if (USE_ELEVENLABS) {
      greetingTwiML = await generateElevenLabsTwiML("Hi! This is OpenClaw. I can help you with information, reminders, or answer questions. What would you like to know?", baseUrl);
      listeningTwiML = await generateElevenLabsTwiML("I'm listening.", baseUrl);
      timeoutTwiML = await generateElevenLabsTwiML("Sorry, I didn't catch that. Please call back!", baseUrl);
    } else {
      greetingTwiML = generatePollyTwiML("Hi! This is OpenClaw. I can help you with information, reminders, or answer questions. What would you like to know?");
      listeningTwiML = generatePollyTwiML("I'm listening.");
      timeoutTwiML = generatePollyTwiML("Sorry, I didn't catch that. Please call back!");
    }
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingTwiML}
  <Gather input="speech" action="/voice/respond" timeout="5" speechTimeout="auto" language="${LANGUAGE}">
    ${listeningTwiML}
  </Gather>
  ${timeoutTwiML}
</Response>`;
    
    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    console.error('Error in /voice:', error);
    // Ultimate fallback
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANGUAGE}">Hi! This is OpenClaw. What would you like to know?</Say>
  <Gather input="speech" action="/voice/respond" timeout="5" speechTimeout="auto" language="${LANGUAGE}">
    <Say voice="${VOICE}" language="${LANGUAGE}">I'm listening.</Say>
  </Gather>
</Response>`;
    res.type('text/xml');
    res.send(twiml);
  }
});

// Handle speech responses
app.post('/voice/respond', async (req, res) => {
  const speech = req.body.SpeechResult || '';
  const confidence = req.body.Confidence || 0;
  
  console.log(`🎤 User said: "${speech}" (confidence: ${confidence})`);
  
  const responseText = generateResponse(speech.toLowerCase());
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  try {
    let responseTwiML, anythingElseTwiML, goodbyeTwiML;
    
    if (USE_ELEVENLABS) {
      responseTwiML = await generateElevenLabsTwiML(responseText, baseUrl);
      anythingElseTwiML = await generateElevenLabsTwiML("Anything else?", baseUrl);
      goodbyeTwiML = await generateElevenLabsTwiML("Thanks for calling. Goodbye!", baseUrl);
    } else {
      responseTwiML = generatePollyTwiML(responseText);
      anythingElseTwiML = generatePollyTwiML("Anything else?");
      goodbyeTwiML = generatePollyTwiML("Thanks for calling. Goodbye!");
    }
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${responseTwiML}
  <Gather input="speech" action="/voice/respond" timeout="5" speechTimeout="auto" language="${LANGUAGE}">
    ${anythingElseTwiML}
  </Gather>
  ${goodbyeTwiML}
</Response>`;
    
    res.type('text/xml');
    res.send(twiml);
  } catch (error) {
    console.error('Error in /voice/respond:', error);
    // Fallback
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(responseText)}</Say>
  <Gather input="speech" action="/voice/respond" timeout="5" speechTimeout="auto" language="${LANGUAGE}">
    <Say voice="${VOICE}" language="${LANGUAGE}">Anything else?</Say>
  </Gather>
</Response>`;
    res.type('text/xml');
    res.send(twiml);
  }
});

// Response generator - customize this for your use case
function generateResponse(input) {
  // Example responses - customize these!
  if (input.includes('hello') || input.includes('hi')) {
    return "Hello! How can I help you today?";
  }
  
  if (input.includes('weather')) {
    return "I can help with weather information. Which city would you like to know about?";
  }
  
  if (input.includes('time')) {
    const now = new Date();
    return `The current time is ${now.toLocaleTimeString()}.`;
  }
  
  if (input.includes('help')) {
    return "I can answer questions, provide information, or help with tasks. Just ask!";
  }
  
  if (input.includes('bye') || input.includes('goodbye')) {
    return "Goodbye! Have a great day!";
  }
  
  // Default response
  return `I heard you say: ${input}. I'm still learning. Try asking about the weather, time, or say help for more options.`;
}

// XML escape utility
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c]));
}

// Health check endpoint
app.get('/status', (req, res) => {
  res.json({
    status: 'ok',
    service: 'openclaw-voice',
    version: '2.0.0',
    voiceEngine: USE_ELEVENLABS ? 'ElevenLabs' : 'AWS Polly',
    voice: USE_ELEVENLABS ? ELEVENLABS_VOICE_ID : VOICE,
    language: LANGUAGE,
    uptime: process.uptime()
  });
});

// Cleanup old audio files (runs every hour, only if using ElevenLabs)
if (USE_ELEVENLABS) {
  setInterval(() => {
    try {
      const files = fs.readdirSync(AUDIO_DIR);
      const now = Date.now();
      let cleaned = 0;
      
      files.forEach(file => {
        const filePath = path.join(AUDIO_DIR, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        
        // Delete files older than 1 hour
        if (age > 3600000) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      });
      
      if (cleaned > 0) {
        console.log(`🧹 Cleaned up ${cleaned} old audio files`);
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }, 3600000);
}

// Start server
app.listen(PORT, () => {
  console.log(`✓ OpenClaw Voice webhook server running on port ${PORT}`);
  console.log(`  POST /voice - Main webhook endpoint`);
  console.log(`  POST /voice/respond - Speech response handler`);
  console.log(`  GET  /status - Health check`);
  if (USE_ELEVENLABS) {
    console.log(`  GET  /audio/:id - Serve audio files`);
  }
  console.log(`\nVoice Engine: ${USE_ELEVENLABS ? '🎙️  ElevenLabs (Premium)' : '🔊 AWS Polly (Free)'}`);
  console.log(`Voice: ${USE_ELEVENLABS ? ELEVENLABS_VOICE_ID : VOICE}`);
  console.log(`Language: ${LANGUAGE}`);
});
