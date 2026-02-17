# OpenClaw Voice Webhook

A conversational voice webhook server for Twilio that enables back-and-forth speech interactions with your phone system.

## Features

- 🎤 **Speech recognition** - Listens to what callers say
- 🗣️ **Natural voice responses** - Uses Twilio's high-quality voices (including Australian English)
- 🔄 **Conversational flow** - Keeps the conversation going until the caller hangs up
- 🌍 **Customizable** - Easy to modify responses for your use case
- 🚀 **One-click deploy** - Works on Railway, Render, Fly.io, and more

## Quick Deploy

### Railway (Recommended - Free Tier)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

### Render
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

### Manual Deploy
```bash
git clone https://github.com/spruikco/openclaw-voice-webhook.git
cd openclaw-voice-webhook
npm install
npm start
```

## Setup

### 1. Deploy the Server

Deploy using one of the methods above. You'll get a public URL like:
- `https://your-app.railway.app`
- `https://your-app.onrender.com`
- `https://your-app.fly.dev`

### 2. Configure Twilio

1. Log into [Twilio Console](https://console.twilio.com)
2. Go to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your phone number
4. Under **Voice Configuration**:
   - **A CALL COMES IN**: `POST` to `https://your-deployed-url/voice`
5. Click **Save**

### 3. Test It!

Call your Twilio number and start talking! The system will:
1. Greet you
2. Listen to what you say
3. Respond based on your input
4. Keep the conversation going

## Customization

### Change the Voice

Edit `server.js` or set environment variables:

```bash
# Use American English female voice
VOICE=Polly.Joanna LANGUAGE=en-US npm start

# Use British English male voice
VOICE=Polly.Brian LANGUAGE=en-GB npm start
```

Available voices: [Twilio Voice List](https://www.twilio.com/docs/voice/twiml/say/text-speech#amazon-polly)

### Customize Responses

Edit the `generateResponse()` function in `server.js`:

```javascript
function generateResponse(input) {
  if (input.includes('your keyword')) {
    return "Your custom response here!";
  }
  // Add more conditions...
}
```

### Environment Variables

- `PORT` - Server port (default: 3030)
- `VOICE` - Twilio voice name (default: Polly.Nicole for Australian English)
- `LANGUAGE` - Voice language code (default: en-AU)

## API Endpoints

### `POST /voice`
Main webhook endpoint. Twilio calls this when someone dials your number.

### `POST /voice/respond`
Handles speech recognition results and generates responses.

### `GET /status`
Health check endpoint. Returns:
```json
{
  "status": "ok",
  "service": "openclaw-voice",
  "version": "1.0.0",
  "uptime": 1234.56
}
```

## Architecture

```
┌─────────────┐      ┌──────────────┐      ┌────────────────┐
│   Caller    │─────▶│   Twilio     │─────▶│  Your Server   │
│             │      │   (Voice)    │      │  /voice        │
└─────────────┘      └──────────────┘      └────────────────┘
                            │                       │
                            │  Speech Result        │
                            │◀──────────────────────┘
                            │
                            │  TwiML Response
                            │◀──────────────────────┐
                            ▼                       │
                     ┌──────────────┐      ┌────────────────┐
                     │  Speak to    │      │  Your Server   │
                     │  Caller      │      │  /voice/respond│
                     └──────────────┘      └────────────────┘
```

## Use Cases

- **Personal assistant** - Call to get information, set reminders
- **Business hotline** - Automated customer service
- **Home automation** - Control smart home via phone call
- **Information line** - Weather, time, news, etc.
- **Integration hub** - Connect phone calls to other services

## Advanced: Integrate with OpenClaw

To connect this with your full OpenClaw instance:

1. Add API calls in `generateResponse()` to query your OpenClaw backend
2. Use environment variables to pass OpenClaw API credentials
3. Return dynamic responses based on your data

Example:
```javascript
async function generateResponse(input) {
  const response = await fetch('https://your-openclaw-api/query', {
    method: 'POST',
    body: JSON.stringify({ text: input })
  });
  const data = await response.json();
  return data.answer;
}
```

## Troubleshooting

### "Application error" when calling
- Check your server logs to see if it's running
- Verify the webhook URL in Twilio is correct
- Ensure your server is publicly accessible (not localhost)

### No speech recognition
- Speak clearly after the prompt
- Check that `language` matches your accent (en-US, en-AU, en-GB, etc.)
- Ensure Twilio can reach your `/voice/respond` endpoint

### Server not starting
- Run `npm install` to ensure dependencies are installed
- Check that port 3030 is available or set a different `PORT` env var

## Contributing

Pull requests welcome! To contribute:

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Test with a Twilio number
5. Submit a PR

## License

MIT License - feel free to use this for personal or commercial projects.

## Support

- **Issues**: [GitHub Issues](https://github.com/spruikco/openclaw-voice-webhook/issues)
- **Docs**: [OpenClaw Documentation](https://docs.openclaw.ai)
- **Community**: [OpenClaw Discord](https://discord.com/invite/clawd)

---

Built with ❤️ by the OpenClaw community
