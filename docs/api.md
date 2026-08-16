# Jarvis V1 API Documentation

All Jarvis Brain backend APIs are versioned under `/api/v1` and return a standardized JSON response format.

## Response Wrapper Contract

```typescript
{
  "success": true,
  "data": { ... },
  "error": null,
  "requestId": "req_xyz123_1723812000"
}
```

Error format:

```typescript
{
  "success": false,
  "data": null,
  "error": {
    "code": "VOICE_PROCESSING_FAILED",
    "message": "Unable to process audio"
  },
  "requestId": "req_xyz123_1723812000"
}
```

---

## Endpoints

### 1. Health Check
`GET /api/v1/health`

Returns overall system and dependency operational status.

**Response**:
```json
{
  "success": true,
  "data": {
    "status": "operational",
    "timestamp": "2026-08-16T12:00:00.000Z",
    "services": {
      "database": true,
      "aiProvider": true,
      "sttProvider": true,
      "ttsProvider": true
    },
    "version": "1.0.0"
  }
}
```

---

### 2. Voice Pipeline
`POST /api/v1/voice`

Accepts recorded voice audio, transcribes it via STT, processes it through the Jarvis brain and tools, synthesizes a TTS spoken audio response, and returns full metadata.

**Request**:
```json
{
  "audioBase64": "m4a_or_mp3_base64_string",
  "mimeType": "audio/m4a",
  "conversationId": "optional-uuid",
  "userId": "default-user",
  "timezone": "Asia/Kolkata"
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "transcript": "What is 15 percent of 2000?",
    "response": "300.",
    "audioBase64": "mp3_base64_response",
    "conversationId": "uuid-1234",
    "requestId": "req_abc123",
    "shouldSpeak": true
  }
}
```

---

### 3. Text Chat
`POST /api/v1/chat`

Processes text messages through Jarvis brain & tools.

**Request**:
```json
{
  "message": "What's the weather in Tokyo?",
  "conversationId": "optional-uuid",
  "speakResponse": true
}
```

---

### 4. Conversations Management
- `GET /api/v1/conversations`: List user conversations.
- `POST /api/v1/conversations`: Create new conversation.
- `GET /api/v1/conversations/[id]`: Retrieve full message history.
- `DELETE /api/v1/conversations/[id]`: Delete conversation.

---

### 5. Memory Management
- `GET /api/v1/memory`: List stored long-term memories.
- `POST /api/v1/memory`: Create custom memory item.
- `DELETE /api/v1/memory?id=[id]`: Delete memory item or clear all.
