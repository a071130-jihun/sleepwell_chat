const config = require('../config/env');

async function getChatCompletion(messages, { model, systemPrompt, temperature } = {}) {
  if (!config.openai.apiKey) {
    const err = new Error('Missing OPENAI_API_KEY');
    err.status = 500;
    throw err;
  }

  const usedModel = model || config.openai.model;

  // If no system message is present, prepend one from param or env
  const hasSystem = Array.isArray(messages) && messages.some((m) => m?.role === 'system');
  const sys = systemPrompt || config.openai.systemPrompt;
  const finalMessages = hasSystem || !sys
    ? messages
    : [{ role: 'system', content: sys }, ...messages];

  // Prefer OpenAI Chat Completions for compatibility
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = { model: usedModel, messages: finalMessages };
  // Some models do not accept explicit temperature; include only if provided
  if (Number.isFinite(temperature)) payload.temperature = temperature;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openai.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    const err = new Error(`OpenAI error: ${resp.status} ${text}`);
    err.status = 502;
    throw err;
  }

  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  return content;
}

module.exports = { getChatCompletion };
