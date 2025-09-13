# Sleepwell 백엔드 API 가이드 (한국어)

이 문서는 Sleepwell 백엔드(Express)가 제공하는 대화/음성 API의 동작 구조와 호출 규약을 한국어로 정리한 가이드입니다.

---

## 아키텍처 개요

- 서버: Node.js / Express (`src/` 하위에 라우트·서비스 구성)
- 언어 모델: OpenAI Chat Completions (기본 `gpt-4o-mini`)
- TTS: OpenAI Audio API (기본 `gpt-4o-mini-tts`, 보이스 `alloy`, 포맷 `mp3`)
- STT: OpenAI Audio Transcriptions (Whisper, 기본 `whisper-1`)
- 시스템 프롬프트: 파일(`prompts/cbti_system_prompt_all_in_one.md`) 로딩
- 타이밍/모니터링: 주요 엔드포인트에서 `Server-Timing` 헤더로 단계별 소요시간 표기

---

## 환경 변수

- 서버/CORS
  - `PORT` (기본 `3000`)
  - `CORS_ORIGIN` (쉼표 구분, 기본 `*`)
- OpenAI (필수)
  - `OPENAI_API_KEY` (필수)
  - `GPT_MODEL` (기본 `gpt-4o-mini`)
  - `GPT_SYSTEM_PROMPT_FILE` (기본 `prompts/cbti_system_prompt_all_in_one.md`)
  - `OPENAI_TTS_MODEL` (기본 `gpt-4o-mini-tts`)
  - `OPENAI_TTS_VOICE` (기본 `alloy`)
  - `OPENAI_TTS_FORMAT` (기본 `mp3`)
  - `OPENAI_STT_MODEL` (기본 `whisper-1`)

주의: 실제 키는 저장소에 커밋하지 말고, `.env`/배포 환경변수로 주입하세요.

---

## 시스템 프롬프트 로딩 규칙

- 기본 프롬프트: `.env`의 `GPT_SYSTEM_PROMPT_FILE` 파일 내용을 시스템 메시지로 사용합니다.
- 우선순위 (상위일수록 우선 적용):
  - 요청 메시지 배열에 `role: "system"`이 이미 포함되어 있으면 그대로 사용(추가 주입 없음)
  - 요청 바디의 `systemPrompt`가 있으면 해당 문자열을 시스템 프롬프트로 prepend
  - 그 외에는 `GPT_SYSTEM_PROMPT_FILE`의 내용을 prepend
- 에이전트 이름: `sleepwell` (내부 메타/로깅용. 사용자 응답에 접두사 미표기)
- 출력 규율: 프롬프트 정책상 “핵심 요약:”, “다음 단계 제안:” 같은 라벨은 사용자 응답에 절대 출력하지 않습니다(내부 정리에만 사용).

---

## 메시지 히스토리 규약

- 필드명: `messages`(권장) 또는 `history`(별칭) 사용 가능. 둘 다 있으면 `messages` 우선.
- 스키마: `{ role: 'user' | 'assistant' | 'system', content: string }[]`
- 순서: 오래된 → 최신 순으로 정렬하여 전송
- 윈도우: 앱에서 최근 N개(권장 20개)만 묶어 전송(서버는 강제 제한 없음)

예시(JSONC):
```jsonc
[
  { "role": "assistant", "content": "안녕하세요! 저는 SleepWell AI 수면 상담사입니다." },
  { "role": "user", "content": "요즘 잠이 잘 안 와요." }
]
```

---

## 엔드포인트 요약

- `GET /api/v1/health` → 상태 점검(JSON)
- `POST /api/v1/chat` → 텍스트 또는 텍스트+오디오(JSON·MP3)
- `POST /api/v1/chat-tts` → 대화 후 바로 오디오(MP3), 또는 전달받은 텍스트 그대로 TTS
- `POST /api/v1/tts` → 순수 TTS(MP3)
- `POST /api/v1/stt` → 음성(STT) → 텍스트(Whisper)

---

## /api/v1/chat

- 목적: 대화 응답 생성(텍스트). 필요 시 오디오 동시 반환
- 요청 바디
  - `messages? | history?`: 메시지 배열(필수, 둘 중 하나)
  - `gptModel?`: 모델 오버라이드(기본 `gpt-4o-mini`)
  - `systemPrompt?`: 시스템 프롬프트 오버라이드 문자열
  - `temperature?`: 일부 모델만 지원. 미지정 시 모델 기본값 사용
  - `format?`: `json`(기본) | `audio` | `both`
  - `voiceId?`, `ttsModelId?`, `outputFormat?`: TTS 옵션(기본: `alloy`, `gpt-4o-mini-tts`, `mp3`)
- 응답
  - `format=json`: `{ "reply": string }`
  - `format=audio` 또는 `Accept: audio/mpeg`: MP3 스트림
  - `format=both`: `{ "reply": string, "audioBase64": string, "audioMime": "audio/mpeg" }`
- 비고
  - `format=both`는 GPT 한 번 호출로 텍스트·오디오 동시 생성 → 불일치 방지
  - 디버그: `?debug=1` 쿼리로 `timings` 포함
  - 헤더: `Server-Timing: gpt;dur=..., tts;dur=..., total;dur=...`

예시(curl):
```bash
curl -s -X POST 'http://localhost:3000/api/v1/chat?format=both' \
  -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"요즘 잠이 잘 안 와요."}]}'
```

---

## /api/v1/chat-tts

- 목적: 대화 후 즉시 음성(MP3) 반환, 또는 주어진 텍스트를 그대로 음성 변환
- 요청 바디
  - `messages? | history?`: 히스토리(텍스트 직접 제공하지 않을 때 필수)
  - `text? | reply?`: 제공 시 GPT 호출 생략, 이 텍스트를 그대로 TTS
  - `gptModel?`, `systemPrompt?`, `temperature?`: 대화 생성 옵션
  - `voiceId?`, `ttsModelId?`, `outputFormat?`: TTS 옵션
- 응답: 오디오 스트림 `audio/mpeg` (MP3)
- 권장 패턴: 이미 `/chat`에서 `reply`를 받았다면 그 문자열을 `text`로 넘겨 동일한 음성을 생성(불일치 없음)

---

## /api/v1/tts

- 목적: 순수 텍스트 → 음성 변환
- 요청 바디
  - `text` (필수)
  - `voiceId?` (기본 `alloy`)
  - `ttsModelId?` (기본 `gpt-4o-mini-tts`)
  - `outputFormat?` (기본 `mp3`)
- 응답: 오디오 스트림 `audio/mpeg` (MP3)

---

## /api/v1/stt

- 목적: 음성(STT) → 텍스트 변환 (Whisper)
- 형식 (둘 중 하나)
  - `multipart/form-data` (권장)
    - 파일 필드: `audio`(권장) 또는 `file`
    - 옵션 필드: `model`(기본 `whisper-1`), `language`(예: `ko`, `en`)
  - `application/json`
    - 바디: `{ "audioBase64": "<base64>", "mimeType?": "audio/wav", "model?": "whisper-1", "language?": "ko" }`
    - 주의: 서버 JSON 바디 제한(`1mb`) → 큰 파일은 multipart 권장
- 응답: `{ "text": string }`
- 헤더: `Server-Timing: stt;dur=..., total;dur=...`

---

## 텍스트/오디오 불일치 방지 가이드

- 추천: `/api/v1/chat?format=both`로 한 번에 텍스트+오디오 요청
- 대안: `/api/v1/chat`에서 `reply` 수신 → `/api/v1/chat-tts`에 `text: reply`로 전달(또는 `/api/v1/tts` 사용)
- 피해야 할 패턴: 같은 히스토리로 `/chat`(JSON) 후 다시 `/chat?format=audio` 호출(두 번째 GPT 호출로 상이한 답 생성 가능)

---

## 오디오/보이스 옵션

- 모델: 기본 `gpt-4o-mini-tts` (요청 바디 `ttsModelId`로 오버라이드 가능)
- 보이스: 기본 `alloy` (요청 바디 `voiceId`로 오버라이드 가능)
- 포맷: 기본 `mp3` (요청 바디 `outputFormat`으로 오버라이드 가능)

---

## 오류 처리 공통 규칙

- 오류 시 JSON으로 응답: `{ error, details? }` (개발 모드에서 스택 포함 가능)
- 상태 코드
  - `400` 잘못된 요청(필수 필드 누락 등)
  - `500` 서버 내부 설정/키 누락
  - `502` 상위(OpenAI) 호출 실패

---

## 보안/성능 참고

- API 키는 서버 환경변수로 주입(저장소/클라이언트에 노출 금지)
- CORS는 `CORS_ORIGIN`으로 제어(모바일 앱은 Origin 없음 → 허용 처리)
- `express.json({ limit: '1mb' })`: 큰 오디오는 multipart 권장
- 로깅: `morgan` (개발: `dev`, 운영: `combined`)
- 타이밍: 모든 주요 엔드포인트에서 `Server-Timing` 헤더 제공

---

## 빠른 점검(개발용)

- 헬스체크
  - `curl -s http://localhost:3000/api/v1/health`
- 텍스트+오디오 동시
  - `curl -s -X POST 'http://localhost:3000/api/v1/chat?format=both' -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"안녕하세요."}]}'`
- STT (multipart)
  - `curl -s -X POST 'http://localhost:3000/api/v1/stt' -F 'audio=@sample.wav'`

---

## 구현 참고 파일

- 라우트: `src/routes/index.js`
- GPT: `src/services/gpt.js`
- TTS(OpenAI Audio API): `src/services/tts.js`
- STT(Whisper): `src/services/stt.js`
- 프롬프트/환경: `src/config/env.js`, `prompts/cbti_system_prompt_all_in_one.md`