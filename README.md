# OpenClaw Voice & SMS Integration (v3.0)

**Fully integrated voice and SMS system that connects directly to your OpenClaw session.**

## What's New in v3.0

- ✅ **Real OpenClaw Integration**: Speech/SMS → OpenClaw session → Intelligent response
- ✅ **Full Context**: Access to weather, calendar, memory, skills, everything
- ✅ **Session Memory**: Maintains conversation context across calls
- ✅ **Dynamic Responses**: No hardcoded responses, real AI thinking
- ✅ **ElevenLabs Premium Voice**: Natural-sounding speech with Polly fallback

## How It Works

```
User calls/texts → Twilio → Webhook → OpenClaw API → Response → TTS → User
```

Every interaction goes through OpenClaw's full AI pipeline with access to:
- Weather service
- Calendar integrations
- Browser automation results
- Memory/context
- All installed skills

## Environment Variables

### Required
- `GATEWAY_URL` - Your OpenClaw Gateway URL (e.g., `https://gateway.openclaw.ai`)
- `GATEWAY_TOKEN` - OpenClaw API authentication token
- `TWILIO_ACCOUNT_SID` - Twilio Account SID
- `TWILIO_AUTH_TOKEN` - Twilio Auth Token

### Optional (for premium voice)
- `ELEVENLABS_API_KEY` - ElevenLabs API key
- `ELEVENLABS_VOICE_ID` - Voice ID (default: Adam)
- `AWS_ACCESS_KEY_ID` - AWS credentials for Polly fallback
- `AWS_SECRET_ACCESS_KEY` - AWS credentials for Polly fallback

## Deployment

### Render.com

1. **Create Web Service** from this repo
2. **Add Environment Variables** (see above)
3. **Set Start Command**: `npm start`
4. **Upgrade to Paid Tier** ($7/mo) - eliminates cold starts

### Railway / Fly.io

Similar process - add environment variables and deploy.

## Twilio Configuration

1. Go to Twilio Console → Phone Numbers
2. Set **Voice Webhook**: `https://your-service.onrender.com/voice`
3. Set **SMS Webhook**: `https://your-service.onrender.com/sms`
4. Save changes

## Testing

Call or text your Twilio number. The system will:
1. Receive your speech/text
2. Send it to OpenClaw for processing
3. Get intelligent response with full context
4. Convert to speech (for calls) or text (for SMS)
5. Play/send response back to you

## Local Development

```bash
npm install
export GATEWAY_URL=https://your-gateway.openclaw.ai
export GATEWAY_TOKEN=your_token_here
export TWILIO_ACCOUNT_SID=ACxxxxx
export TWILIO_AUTH_TOKEN=xxxxx
npm start
```

## OpenClaw Gateway Token

To get your Gateway token:
1. Log into OpenClaw web interface
2. Go to Settings → API
3. Generate a new token with `sessions.send` permission
4. Copy token and add to environment variables

## Architecture

- **Express.js** - Web server
- **Twilio SDK** - TwiML generation
- **Axios** - OpenClaw API calls
- **ElevenLabs** - Premium TTS (primary)
- **AWS Polly** - TTS fallback
- **Audio Caching** - Fast responses for repeated phrases

## Pricing Considerations

- **Render Free Tier**: Has cold starts (30s delay)
- **Render Paid ($7/mo)**: Always-on, instant response
- **ElevenLabs**: ~$0.30 per 1000 characters
- **AWS Polly**: ~$4 per 1 million characters
- **Twilio**: ~$0.01-0.02 per minute for calls

## Voice Quality

**ElevenLabs** (when configured):
- Natural, human-like speech
- Multiple voice options
- Emotional range
- Premium pricing

**AWS Polly** (fallback):
- Neural voices available
- Reliable, fast
- Lower cost
- Slightly robotic

## Session Management

Each phone number gets its own OpenClaw session with label `voice-{phone_number}`.

This means:
- Conversation context is maintained
- Memory persists across calls
- Can reference previous interactions
- "Remember when I asked about weather earlier?"

## Troubleshooting

**Application Error on call:**
- Service is sleeping (free tier) - call again or upgrade
- Check Render logs for errors

**"I'm having trouble connecting":**
- Check `GATEWAY_URL` and `GATEWAY_TOKEN` are correct
- Verify OpenClaw Gateway is running
- Check Render logs for API errors

**Robotic voice:**
- ElevenLabs not configured, using Polly fallback
- Add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`

**No response:**
- OpenClaw session timeout (increase `timeoutSeconds` in code)
- Check OpenClaw Gateway logs

## License

MIT
