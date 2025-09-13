const config = require('../config/env');

// Use OpenAI Audio Transcriptions (Whisper)
// Docs: POST https://api.openai.com/v1/audio/transcriptions
// Multipart form fields: model, file, [language]

function guessExtension(mime) {
  if (!mime) return 'mp3';
  const m = mime.toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg') || m.includes('oga')) return 'ogg';
  if (m.includes('m4a') || m.includes('x-m4a')) return 'm4a';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('mpga')) return 'mpga';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  return 'mp3';
}

async function speechToText(audioBuffer, { mimeType, model, language, prompt, temperature, responseFormat } = {}) {
  if (!config.openai.apiKey) {
    const err = new Error('Missing OPENAI_API_KEY');
    err.status = 500;
    throw err;
  }
  if (!audioBuffer || !(audioBuffer instanceof Buffer) || audioBuffer.length === 0) {
    const err = new Error('audio buffer is required');
    err.status = 400;
    throw err;
  }

  const usedModel = model || config.openai.sttModel || 'whisper-1';
  const type = mimeType || 'audio/mpeg';
  const ext = guessExtension(type);

  // Build multipart form
  const form = new FormData();
  form.append('model', usedModel);
  // Default to Korean unless overridden
  form.append('language', String(language || 'ko'));
  // Encourage verbatim (no summarization): temperature=0 and optional prompt
  form.append('temperature', String(Number.isFinite(temperature) ? temperature : 0));
  if (responseFormat) form.append('response_format', String(responseFormat));
  if (prompt) form.append('prompt', String(prompt));

  // Create a File for the audio and append as 'file' with a supported extension
  const file = new File([audioBuffer], `audio.${ext}`, { type });
  form.append('file', file);

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: form,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`OpenAI STT error: ${resp.status} ${text}`);
    err.status = 502;
    throw err;
  }

  const data = await resp.json();
  // API typically returns { text }
  const text = data.text || '';
  return text;
}

module.exports = { speechToText };
