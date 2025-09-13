const { Router } = require('express');
const { getChatCompletion } = require('../services/gpt');
const { textToSpeech } = require('../services/tts');
const { speechToText } = require('../services/stt');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { createTimer } = require('../utils/timing');

const router = Router();

// Health check – good for uptime probes and Flutter boot-time checks
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;

// Helper: select conversation array from body (prefer messages over history)
function pickMessages(body) {
  if (Array.isArray(body?.messages)) return body.messages;
  if (Array.isArray(body?.history)) return body.history;
  return [];
}

// POST /api/v1/chat-tts
// Body: {
//   messages?: [{role, content}],
//   history?: [{role, content}],
//   text?: string,              // if provided, skip GPT and TTS this text (alias: reply)
//   reply?: string,             // alias of text
//   voiceId?, gptModel?, ttsModelId?, outputFormat?, systemPrompt?, temperature?
// }
router.post('/chat-tts', async (req, res, next) => {
  try {
    const timer = createTimer();
    const { voiceId, gptModel, systemPrompt, temperature, ttsModelId, outputFormat } = req.body || {};

    const directText = typeof req.body?.text === 'string' && req.body.text.trim().length > 0
      ? req.body.text
      : (typeof req.body?.reply === 'string' && req.body.reply.trim().length > 0
        ? req.body.reply
        : null);

    let reply;
    if (directText) {
      reply = directText;
    } else {
      const messages = pickMessages(req.body);
      if (!Array.isArray(messages) || messages.length === 0) {
        const err = new Error('messages or text is required');
        err.status = 400;
        throw err;
      }
      reply = await getChatCompletion(messages, { model: gptModel, systemPrompt, temperature });
    }
    timer.mark('gpt');

    const audio = await textToSpeech(reply, {
      voiceId,
      modelId: ttsModelId,
      outputFormat,
    });
    timer.mark('tts');

    res.setHeader('Server-Timing', timer.header());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="reply.mp3"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/stt
// Accepts: multipart/form-data with file field (audio|file), or JSON { audioBase64, mimeType, model?, language? }
// Returns: { text }
router.post('/stt', upload.any(), async (req, res, next) => {
  try {
    const timer = createTimer();
    let audioBuf = null;
    let mimeType = null;
    let model = null;
    let language = null;
    let prompt = null;
    let temperature = null;
    let responseFormat = null;

    // Multipart: pick first file, prefer fieldname 'audio' then 'file'
    if (Array.isArray(req.files) && req.files.length > 0) {
      let f = req.files.find((x) => x.fieldname === 'audio') || req.files.find((x) => x.fieldname === 'file') || req.files[0];
      if (f && f.buffer && f.buffer.length > 0) {
        audioBuf = f.buffer;
        mimeType = f.mimetype || null;
      }
    }

    // JSON fallback: { audioBase64, mimeType, model, language }
    if (!audioBuf && req.is('application/json')) {
      const { audioBase64, mimeType: mm, model: m, language: lang, prompt: p, temperature: t, responseFormat: rf } = req.body || {};
      if (typeof audioBase64 === 'string' && audioBase64.trim().length > 0) {
        const b64 = audioBase64.replace(/^data:[^;]+;base64,/, '');
        audioBuf = Buffer.from(b64, 'base64');
        mimeType = mm || null;
        model = m || null;
        language = lang || null;
        prompt = p || null;
        temperature = t;
        responseFormat = rf || null;
      }
    } else {
      // Also capture model/language when multipart with fields
      model = req.body?.model || null;
      language = req.body?.language || null;
      prompt = req.body?.prompt || null;
      temperature = req.body?.temperature;
      responseFormat = req.body?.responseFormat || null;
    }

    if (!audioBuf || !audioBuf.length) {
      const err = new Error('audio is required (multipart file field "audio" or "file", or JSON audioBase64)');
      err.status = 400;
      throw err;
    }

    const text = await speechToText(audioBuf, { mimeType, model, language, prompt, temperature, responseFormat });
    timer.mark('stt');
    res.setHeader('Server-Timing', timer.header());
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ text });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/tts
// Body: { text: string, voiceId?, ttsModelId?, outputFormat? }
router.post('/tts', async (req, res, next) => {
  try {
    const timer = createTimer();
    const { text, voiceId, ttsModelId, outputFormat } = req.body || {};
    if (!text || typeof text !== 'string') {
      const err = new Error('text is required');
      err.status = 400;
      throw err;
    }
    const audio = await textToSpeech(text, { voiceId, modelId: ttsModelId, outputFormat });
    timer.mark('tts');
    res.setHeader('Server-Timing', timer.header());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="speech.mp3"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/chat
// Body: { messages?: [{role, content}], history?: [{role, content}], gptModel?, systemPrompt?, temperature?, format?, voiceId?, ttsModelId?, outputFormat? }
router.post('/chat', async (req, res, next) => {
  try {
    const timer = createTimer();
    const { gptModel, systemPrompt, temperature, format, voiceId, ttsModelId, outputFormat } = req.body || {};
    const messages = pickMessages(req.body);
    if (!Array.isArray(messages) || messages.length === 0) {
      const err = new Error('messages array is required');
      err.status = 400;
      throw err;
    }
    const reply = await getChatCompletion(messages, { model: gptModel, systemPrompt, temperature });
    timer.mark('gpt');

    // Decide response type: JSON (default) or audio
    const queryFormat = (req.query.format || '').toString().toLowerCase();
    const bodyFormat = (format || '').toString().toLowerCase();
    const accept = (req.headers['accept'] || '').toString().toLowerCase();
    const wantsAudio = bodyFormat === 'audio' || queryFormat === 'audio' || accept.includes('audio/mpeg');
    const wantsBoth = bodyFormat === 'both' || queryFormat === 'both';

    if (!wantsAudio && !wantsBoth) {
      const debug = String(req.query.debug || '').toLowerCase() === '1';
      if (debug) {
        res.setHeader('Server-Timing', timer.header());
        return res.json({ reply, timings: timer.summary() });
      }
      res.setHeader('Server-Timing', timer.header());
      return res.json({ reply });
    }

    const audio = await textToSpeech(reply, { voiceId, modelId: ttsModelId, outputFormat });
    timer.mark('tts');

    if (wantsBoth) {
      const b64 = audio.toString('base64');
      res.setHeader('Server-Timing', timer.header());
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ reply, audioBase64: b64, audioMime: 'audio/mpeg' });
    }

    res.setHeader('Server-Timing', timer.header());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'inline; filename="reply.mp3"');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(audio);
  } catch (err) {
    next(err);
  }
});
