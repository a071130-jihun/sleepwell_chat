const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const rawCorsOrigins = process.env.CORS_ORIGIN || '*';
const corsOrigins = rawCorsOrigins
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Resolve system prompt: support file and \n escapes
function resolveSystemPrompt() {
  const fromEnvFile = process.env.GPT_SYSTEM_PROMPT_FILE;
  if (fromEnvFile) {
    const abs = path.isAbsolute(fromEnvFile)
      ? fromEnvFile
      : path.resolve(process.cwd(), fromEnvFile);
    try {
      return fs.readFileSync(abs, 'utf8');
    } catch (e) {
      console.warn('[config] Failed to read GPT_SYSTEM_PROMPT_FILE:', e.message);
    }
  }

  // Fallback to GPT_SYSTEM_PROMPT with \n unescape
  const raw = process.env.GPT_SYSTEM_PROMPT || '';
  // Replace literal backslash-n with real newline
  return raw.replace(/\\n/g, '\n');
}

const config = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3000),
  corsOrigins,
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.GPT_MODEL || 'gpt-4o-mini',
    systemPrompt: resolveSystemPrompt(),
    ttsModel: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
    ttsVoice: process.env.OPENAI_TTS_VOICE || 'alloy',
    ttsFormat: process.env.OPENAI_TTS_FORMAT || 'mp3',
    sttModel: process.env.OPENAI_STT_MODEL || 'whisper-1',
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY || '',
    voiceId: process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    ttsModel: process.env.ELEVENLABS_TTS_MODEL || 'eleven_multilingual_v2',
    outputFormat: process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128',
  },
});

module.exports = config;
