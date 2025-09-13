# Chat API Integration (App Side)

This document describes how the Flutter app talks to both the local Node chat server and the existing backend (Spring) for chat features, including sending the current conversation history and receiving audio responses.

## Base URLs

- Node (local): `http://localhost:3000/api/v1` (configurable via `CHAT_API_BASE_URL`)
- Backend (Spring): `API_BASE_URL` from `lib/config/api_config.dart`

Provider selection:
- `CHAT_PROVIDER=node` → use local Node chat server
- `CHAT_PROVIDER=backend` → use existing backend endpoints

## Message Format & History

The app builds an OpenAI-like message array from the current session (this array is the conversation history sent to the server):

```jsonc
[
  { "role": "assistant", "content": "안녕하세요! 저는 SleepWell AI 수면 상담사입니다." },
  { "role": "user", "content": "잠들기가 어려워요" },
  { "role": "assistant", "content": "수면 루틴을 정리해보세요..." },
  { "role": "user", "content": "어떤 루틴이 좋을까요?" }
]
```

Rules for history:
- Order: oldest → newest (append the new user message at the end before sending).
- Window: send up to the last 20 messages (truncate older ones in the app).
- Roles: `user` | `assistant` | `system`.
- System message: optional in requests. If omitted, the Node server prepends its default system prompt (see “System Prompt Handling”).
 - Field name: Node accepts history in either `messages` (preferred) or `history`.

## Node Chat Server Endpoints

### 0) Speech-to-Text (STT)

- `POST /stt`
- Accepts either:
  - multipart/form-data with file field: `audio` (preferred) or `file` and optional `model`, `language` (default `ko`), `prompt`, `temperature` (default `0`), `responseFormat` (default `text`)
  - JSON: `{ "audioBase64": "<base64>", "mimeType?": "audio/wav", "model?": "whisper-1", "language?": "ko", "prompt?": "...", "temperature?": 0, "responseFormat?": "text" }`
- Returns: `{ "text": "..." }`
- Engine: OpenAI Audio Transcriptions (Whisper, default `whisper-1`). The server defaults language to `ko` and temperature to `0` to encourage verbatim transcription.

### 1) Text reply (or both text+audio)

- `POST /chat`
- Body (history + optional overrides):

```json
{
  "messages": [ {"role":"user"|"assistant"|"system", "content":"..."}, ... ],
  "gptModel": "gpt-4o-mini",          // optional, overrides server default
  "systemPrompt": "...",               // optional, overrides server default file
  "temperature": 0.2                    // optional, include only if your model supports it
}
```

Note: You may send the history array as `history` instead of `messages` with the same shape. If both are present, the server uses `messages`.

- Response (typical):

```json
{ "reply": "텍스트 응답" }
```

Optional combined output to prevent mismatch:

- Use `format=both` (query or body). The server will return JSON:

```json
{ "reply": "텍스트 응답", "audioBase64": "...", "audioMime": "audio/mpeg" }
```

Response parsing: prefer `{ "reply": string }`. As a fallback, try `text`, `content`, `message`, or OpenAI-like `choices[0].message.content`.

### 2) Audio reply (audio-only)

- `POST /chat?format=audio`
- Headers: `Accept: audio/mpeg`
- Body (same as text, includes history):

```json
{
  "messages": [ {"role":"user"|"assistant"|"system", "content":"..."}, ... ]
}
```

- Response: `audio/mpeg` bytes (mp3). The app attaches these bytes to the same chat message (`metadata.audioBytes`) and auto-plays.

Avoid mismatch: Do not call `/chat` twice (JSON then audio). Prefer `format=both`, or call `/tts` with the text you already received.

Avoid mismatch: Do not call `/chat` twice (JSON then audio). Prefer `format=both`, or call `/tts` with the text you already received. Alternatively, use `/chat-tts` with a `text` field to TTS exactly that text.

Fallback: if `format=audio` is unavailable, the app tries `POST /chat-tts` with the same body.

TTS engine: The server uses OpenAI Audio API with model `gpt-4o-mini-tts` by default. You may set `voiceId` to an OpenAI voice (e.g., `alloy`) and `ttsModelId` to override the model.

## Backend (Spring) Endpoints

### 1) Start consultation

- `POST /consultation/sessions`
- Body: `{ "topic": "GENERAL", "consultationType": "GENERAL", "initialMessage?": "..." }`
- Response: `{ "sessionId": "...", ... }`

### 2) Send message with context (history)

- `POST /consultation/sessions/{sessionId}/messages`
- Body:

```jsonc
{
  "content": "현재 전송하는 사용자 메시지",
  "messageType": "USER",
  // The backend may ignore this if unsupported, but the app includes it when available
  "contextMessages": [
    { "role": "assistant", "content": "안녕하세요! 저는 SleepWell AI 수면 상담사입니다." },
    { "role": "user", "content": "잠들기가 어려워요" }
  ]
}
```

- Response example (simplified):

```json
{
  "messageId": "...",
  "aiResponse": "텍스트 응답"
}
```

Notes:
- The app still works if the backend ignores `contextMessages`.
- Keep the same ordering and 20-message window as the Node provider.

## System Prompt Handling (sleepwell)

- The Node server loads a unified 5-stage CBT-I system prompt for the sleepwell agent from `.env`:
  - `GPT_SYSTEM_PROMPT_FILE=prompts/cbti_system_prompt_all_in_one.md`
- Behavior:
  - If the request already includes a `system` role message in `messages`, the server does NOT prepend its default system prompt.
  - Else if the request body contains `systemPrompt`, the server prepends that.
  - Else the server prepends the default file prompt.
- Agent name: `sleepwell` (used internally; user-facing replies do not include a name prefix).

## Client Behavior

- On send:
  - Adds the user's message locally
  - Builds the history array (oldest → newest), sending the last 20 messages
  - Node provider: requests both text and audio; shows text and auto-plays audio
  - Backend provider: sends `contextMessages` along with `content`

- On receive:
  - Auto-scrolls to bottom
  - Auto-plays audio if available

## Examples

Text (Node):

```bash
curl -s -X POST 'http://localhost:3000/api/v1/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "messages": [
      {"role":"assistant","content":"안녕하세요! 저는 SleepWell AI 수면 상담사입니다."},
      {"role":"user","content":"요즘 잠이 잘 안 와요."}
    ]
  }'
```

Audio (Node):

```bash
curl -s -X POST 'http://localhost:3000/api/v1/chat?format=audio' \
  -H 'Content-Type: application/json' \
  -H 'Accept: audio/mpeg' \
  -d '{
    "messages": [
      {"role":"assistant","content":"안녕하세요! 저는 SleepWell AI 수면 상담사입니다."},
      {"role":"user","content":"요즘 잠이 잘 안 와요."}
    ],
    "temperature": 0.2
  }' --output reply.mp3
```

Chat-to-speech with exact text (no GPT call):

```bash
curl -s -X POST 'http://localhost:3000/api/v1/chat-tts' \
  -H 'Content-Type: application/json' \
  -d '{
    "text": "아까 받은 텍스트 답변을 그대로 읽어주세요.",
    "voiceId": "alloy"
  }' --output reply.mp3
```

## Configuration

- `lib/config/chat_config.dart`:
  - `CHAT_PROVIDER`: `node` (default) or `backend`
  - `CHAT_API_BASE_URL`: override Node base URL if needed (default `http://localhost:3000/api/v1`)
