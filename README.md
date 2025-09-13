# Sleepwell Backend (Node.js / Express)

Minimal Express backend scaffold for a Flutter app.

## Quick Start

- Copy `.env.example` to `.env` and adjust if needed.
- Install dependencies.
- Run in dev mode with auto-reload.

```
cp .env.example .env
npm install
npm run dev
```

The server listens on `http://localhost:3000` by default.

## API

- `GET /` → Basic service info
- `GET /api/v1/health` → Health probe

### Chat (Text)

- `POST /api/v1/chat`
  - Body: `{ "messages?": Message[], "history?": Message[], "gptModel?": string, "systemPrompt?": string, "temperature?": number, "format?": "json" | "audio" | "both", "voiceId?": string, "ttsModelId?": string, "outputFormat?": string }`
  - Response:
    - Default: `{ "reply": string }` (JSON)
    - If `format=audio` (query/body) or `Accept: audio/mpeg`: returns MP3 audio of the reply
    - If `format=both`: `{ "reply": string, "audioBase64": string, "audioMime": "audio/mpeg" }`
  - Notes:
    - Some models do not accept explicit `temperature`; omit to use model default.
    - When returning audio, you may also pass `voiceId`, `ttsModelId`, `outputFormat`.
    - Conversation history can be in `messages` (preferred) or `history` (alias). If both are present, `messages` takes precedence.
    - Performance: The server includes a `Server-Timing` header with step timings (e.g., `gpt`, `tts`, `total`). For JSON responses, add `?debug=1` to include `timings` in the body.

### Text-to-Speech and Chat-to-Speech

- `POST /api/v1/tts`
  - Body: `{ "text": "Hello world", "voiceId?": string, "ttsModelId?": string, "outputFormat?": string }`
  - Returns: `audio/mpeg` (MP3)
  - Implementation: Uses OpenAI Audio API with model `gpt-4o-mini-tts` by default. `voiceId` should be an OpenAI voice (e.g., `alloy`).

- `POST /api/v1/chat-tts`
  - Body: `{ "messages?": Message[], "history?": Message[], "text?": string, "reply?": string, "voiceId?": string, "gptModel?": string, "systemPrompt?": string, "temperature?": number, "ttsModelId?": string, "outputFormat?": string }`
  - If `text` (or alias `reply`) is provided, the server skips GPT and converts that exact text to speech.
  - Otherwise, it calls GPT with the provided history and returns the reply as `audio/mpeg` (MP3).
  - Implementation: TTS uses OpenAI Audio API with `ttsModelId` or the default `gpt-4o-mini-tts`.
  - Tip to avoid mismatch: If you need both text and audio, call `/api/v1/chat?format=both` once, or call `/api/v1/chat` to get text and then `/api/v1/tts` with that exact text. Avoid calling `/chat` twice (once JSON, once audio), which would generate two different replies.

#### Request/Response Details

- Common
  - Responses are `audio/mpeg` with `Content-Disposition: inline`.
  - Errors return JSON: `{ error: string, details?, stack? }` (stack only in non-production).

- `POST /api/v1/tts`
  - Required fields: `text` (string)
  - Optional fields: `voiceId`, `ttsModelId`, `outputFormat`
  - Status codes: `200` OK, `400` invalid body, `500/502` upstream errors

- `POST /api/v1/chat-tts`
  - Required fields: `messages` (Array of `{role, content}`)
  - Optional fields: `gptModel`, `systemPrompt`, `temperature`, `voiceId`, `ttsModelId`, `outputFormat`
  - System prompt behavior: If a `system` role message is not present, the server prepends
    - request.body.systemPrompt if provided, else the env `GPT_SYSTEM_PROMPT` if set.
  - Temperature: Only include when your chosen model supports it; otherwise omit to use the model default.
  - Status codes: `200` OK, `400` invalid body, `500/502` upstream errors

Types:

```
type Message = { role: 'user' | 'assistant' | 'system', content: string };
```

Example:

```
curl http://localhost:3000/api/v1/health
```

## Project Structure

```
.
├─ src/
│  ├─ app.js              # Express app and middlewares
│  ├─ server.js           # HTTP server & lifecycle
│  ├─ config/
│  │  └─ env.js           # Env & config loader
│  ├─ routes/
│  │  └─ index.js         # API routes (v1)
│  └─ middlewares/
│     └─ error.js         # Not-found & error handlers
├─ .env.example           # Sample env vars
├─ prompts/
│  ├─ agent-1-intake.md   # Stage 1: Intent & constraints intake
│  ├─ agent-2-plan.md     # Stage 2: Planner & outline
│  ├─ agent-3-compose.md  # Stage 3: Compose final answer
│  └─ agent-4-speech.md   # Stage 4: Speech-optimized rewrite
├─ nodemon.json           # Dev autoreload settings
├─ package.json           # Scripts & deps
└─ .gitignore
```

## Environment Variables

- `PORT` (default `3000`): HTTP port.
- `NODE_ENV` (`development` | `production`): Runtime mode.
- `CORS_ORIGIN` (e.g. `*` or `http://localhost:5173,http://localhost:8080`): Allowed origins.

OpenAI / GPT:
- `OPENAI_API_KEY` (required): API key for GPT.
- `GPT_MODEL` (default `gpt-4o-mini`): Chat model name.
- `GPT_SYSTEM_PROMPT` (optional): Default system prompt. Used if request doesn’t include a `system` message and `systemPrompt` isn’t provided. Supports `\n` escapes for multi-line.
- `GPT_SYSTEM_PROMPT_FILE` (optional): Path to a text/Markdown file with the system prompt. If set and readable, it overrides `GPT_SYSTEM_PROMPT`. Example file: `prompts/system-prompt.md`.

### Multi-line system prompt tips

- Recommended: put your prompt in a file and set `GPT_SYSTEM_PROMPT_FILE=prompts/cbti_system_prompt_all_in_one.md` in `.env`.
- Alternatively, keep it in `.env` using `\n` escapes.
- Per-request override: include `systemPrompt` (string) in `POST /api/v1/chat-tts` body. If a `system` role message is already in `messages`, it takes precedence and no prepend occurs.

### Sleepwell CBT‑I system prompt

This project includes a consolidated 5‑stage CBT‑I system prompt tailored for the “sleepwell” agent:

- File: `prompts/cbti_system_prompt_all_in_one.md`
- Set in `.env`:
  - `GPT_SYSTEM_PROMPT_FILE=prompts/cbti_system_prompt_all_in_one.md`

Notes:
- The assistant replies in Korean, one question per turn.
- The agent name is “sleepwell” (for internal naming/metadata; user‑facing messages need no prefix).
- You can still override per request using the `systemPrompt` field in the API body.

### Claude‑style multi‑agent prompts (from provided spec)

The following prompts mirror the Anthropic/Claude guidance you provided:
- `prompts/claude-agent-1-intake.md` — intake constraints with strong safety and product‑info rules.
- `prompts/claude-agent-2-plan.md` — planner/outline with inherited safety and product‑info rules.
- `prompts/claude-agent-3-compose.md` — final composer with tone/format constraints.
- `prompts/claude-agent-4-speech.md` — TTS‑optimized rewrite.

To use one as the default system prompt:
```
GPT_SYSTEM_PROMPT_FILE=prompts/claude-agent-3-compose.md
```

OpenAI TTS env (defaults shown in `.env.example`):
- `OPENAI_TTS_MODEL` (default `gpt-4o-mini-tts`)
- `OPENAI_TTS_VOICE` (default `alloy`)
- `OPENAI_TTS_FORMAT` (default `mp3`)

Legacy ElevenLabs variables remain but are no longer used by the server.

### Speech-to-Text (STT)

- `POST /api/v1/stt`
  - Accepts either multipart/form-data or JSON
  - Multipart (recommended):
    - file field: `audio` (preferred) or `file` — any common audio type (wav, mp3, webm, m4a, ogg)
    - optional fields: `model` (override), `language` (default `ko`), `prompt` (bias context), `temperature` (default `0`), `responseFormat` (default `text`)
  - JSON alternative:
    - Body: `{ "audioBase64": "<base64>", "mimeType?": "audio/wav", "model?": "whisper-1", "language?": "ko", "prompt?": "...", "temperature?": 0, "responseFormat?": "text" }`
  - Returns: `{ "text": string }`
  - Implementation: Uses OpenAI Audio Transcriptions API (Whisper). Default language is forced to `ko` unless overridden; temperature defaults to `0` to discourage paraphrasing.

OpenAI STT env:
- `OPENAI_STT_MODEL` (default `whisper-1`)

Mobile apps typically have no Origin header, which is allowed by default.

## Flutter Integration Tips

- Use `http` or `dio` packages in Flutter to call the API.
- For local Android emulator, your host machine is `localhost`.
  - Example: `http://localhost:3000/api/v1/health`
- For iOS simulator, `http://localhost:3000` works.
- If you need HTTPS for release builds, put a reverse proxy (e.g., Nginx) or use a hosted platform that provides TLS.

### Flutter usage example (Dio)

```dart
final dio = Dio(BaseOptions(baseUrl: 'http://localhost:3000/api/v1'));

// 1) Text reply
final textResp = await dio.post('/chat', data: {
  'messages': [
    {'role': 'user', 'content': '한 줄 자기소개 해줘'}
  ]
});
print(textResp.data['reply']);

// 2) Audio reply
final audioResp = await dio.post(
  '/chat?format=audio',
  options: Options(responseType: ResponseType.bytes, headers: {'Accept': 'audio/mpeg'}),
  data: {
    'messages': [
      {'role': 'user', 'content': '한 줄 자기소개 해줘'}
    ]
  },
);
final bytes = audioResp.data as List<int>;
// Play with just_audio or audio_players
```

## Next Steps (optional)

- Add auth routes (JWT/session) and user store (Postgres/MongoDB).
- Add request validation (e.g., Zod/Joi) and structured logging (winston/pino).
- Add Dockerfile and GitHub Actions for CI/CD.
- Add tests with Jest or Vitest.
Performance diagnostics
- All endpoints set `Server-Timing` headers with step durations.
- Example curl to see headers:
  - `curl -i -X POST 'http://localhost:3000/api/v1/chat' -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"ping"}]}'`
  - Look for `Server-Timing: gpt;dur=..., total;dur=...`
# sleepwell_chat
