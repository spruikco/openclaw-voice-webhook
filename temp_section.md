
## Environment Variables

### Required
- `PORT` - Server port (default: 3030)

### Voice Configuration

**Default Voice (AWS Polly - Free):**
- `VOICE` - Polly voice name (default: `Polly.Nicole`)
  - Australian: `Polly.Nicole` (female), `Polly.Russell` (male)
  - American: `Polly.Joanna` (female), `Polly.Matthew` (male)
  - British: `Polly.Amy` (female), `Polly.Brian` (male)
  - Full list: https://docs.aws.amazon.com/polly/latest/dg/voicelist.html
- `LANGUAGE` - Language code (default: `en-AU`)
  - `en-AU` (Australian), `en-US` (American), `en-GB` (British)

**Premium Voice (ElevenLabs - Optional):**
- `ELEVENLABS_API_KEY` - Your API key from elevenlabs.io **(required to enable ElevenLabs)**
- `ELEVENLABS_VOICE_ID` - Voice ID **(required to select which voice)**
  - Default: `pNInz6obpgDQGcFmaJgB` (Adam - clear neutral male)
  - Browse & preview: https://elevenlabs.io/voice-library

### How It Works

1. **No ElevenLabs key** → Uses AWS Polly (free, instant)
2. **ElevenLabs key set** → Uses ElevenLabs voices (premium, natural)
3. **ElevenLabs fails** → Automatic fallback to Polly

