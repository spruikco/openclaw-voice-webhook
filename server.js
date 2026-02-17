#!/usr/bin/env node
/**
 * OpenClaw Voice Webhook Server
 * Twilio-compatible conversational voice assistant
 * 
 * Environment Variables:
 * - PORT: Server port (default: 3030)
 * - VOICE: Twilio voice name (default: Polly.Nicole)
 * - LANGUAGE: Voice language (default: en-AU)
 */

const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3030;
const VOICE = process.env.VOICE || 'Polly.Nicole';
const LANGUAGE = process.env.LANGUAGE || 'en-AU';

// Main voice endpoint - handles incoming calls
app.post('/voice', (req, res) => {
  const from = req.body.From || 'unknown';
  console.log(`📞 Incoming call from ${from}`);
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANGUAGE}">Hi! This is OpenClaw. I can help you with information, reminders, or answer questions. What would you like to know?</Say>
  <Gather input="speech" action="/voice/respond" timeout="5" speechTimeout="auto" language="${LANGUAGE}">
    <Say voice="${VOICE}" language="${LANGUAGE}">I'm listening.</Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANGUAGE}">Sorry, I didn't catch that. Please call back!</Say>
</Response>`;
  
  res.type('text/xml');
  res.send(twiml);
});

// Handle speech responses
app.post('/voice/respond', (req, res) => {
  const speech = req.body.SpeechResult || '';
  const confidence = req.body.Confidence || 0;
  
  console.log(`🎤 User said: "${speech}" (confidence: ${confidence})`);
  
  let response = generateResponse(speech.toLowerCase());
  
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(response)}</Say>
  <Gather input="speech" action="/voice/respond" timeout="5" speechTimeout="auto" language="${LANGUAGE}">
    <Say voice="${VOICE}" language="${LANGUAGE}">Anything else?</Say>
  </Gather>
  <Say voice="${VOICE}" language="${LANGUAGE}">Thanks for calling. Goodbye!</Say>
</Response>`;
  
  res.type('text/xml');
  res.send(twiml);
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
    version: '1.0.0',
    uptime: process.uptime()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ OpenClaw Voice webhook server running on port ${PORT}`);
  console.log(`  POST /voice - Main webhook endpoint`);
  console.log(`  POST /voice/respond - Speech response handler`);
  console.log(`  GET  /status - Health check`);
  console.log(`\nVoice: ${VOICE}, Language: ${LANGUAGE}`);
});
