const config = require('../config/env');

// Use OpenAI Audio API for text-to-speech
// Docs: POST https://api.openai.com/v1/audio/speech
// Body: { model: 'gpt-4o-mini-tts', input: string, voice: 'alloy', format: 'mp3' }

async function textToSpeech(text, { voiceId, modelId, outputFormat } = {}) {
  if (!config.openai.apiKey) {
    const err = new Error('Missing OPENAI_API_KEY');
    err.status = 500;
    throw err;
  }

  const model = modelId || config.openai.ttsModel || 'gpt-4o-mini-tts';
  const voice = voiceId || config.openai.ttsVoice || 'alloy';
  const format = outputFormat || config.openai.ttsFormat || 'mp3';

  const url = 'https://api.openai.com/v1/audio/speech';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify({ model, input: text, voice, format }),
  });

  if (!resp.ok) {
    const textErr = await resp.text().catch(() => '');
    const err = new Error(`OpenAI TTS error: ${resp.status} ${textErr}`);
    err.status = 502;
    throw err;
  }

  const arrayBuffer = await resp.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = { textToSpeech };
