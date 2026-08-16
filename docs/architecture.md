# Jarvis V1 Architecture Documentation

## Overview

Jarvis V1 is an end-to-end voice-first personal AI assistant built as a monorepo consisting of:

1. **Jarvis Mobile (`apps/mobile`)**: Expo React Native mobile client running on Android/iOS/Web, connecting seamlessly with standard Bluetooth earbuds for voice input and audio response playback.
2. **Jarvis Brain (`apps/brain`)**: Next.js App Router backend powered by the `@google/genai` Gemini SDK with native function calling, structured prompt architecture, Prisma ORM database, memory extraction system, and versioned `/api/v1` REST APIs.
3. **Shared Contracts (`packages/shared`)**: Shared TypeScript interfaces, Zod schemas, and standard API response wrappers.

---

## Architectural Flow

```text
                  ┌───────────────────┐
                  │   Normal Earbuds  │
                  │ Mic + Speaker     │
                  └─────────┬─────────┘
                            │ Bluetooth
                  ┌─────────▼─────────┐
                  │   React Native    │
                  │   Mobile (Expo)   │
                  │                   │
                  │ Voice Recording   │
                  │ UI (Orb / History)│
                  │ Audio Playback    │
                  └─────────┬─────────┘
                            │ HTTPS / Base64 Audio
                  ┌─────────▼─────────┐
                  │   Next.js API     │
                  │  /api/v1/voice    │
                  │  /api/v1/chat     │
                  └─────────┬─────────┘
                            │
                  ┌─────────▼─────────┐
                  │   Jarvis Brain    │
                  │                   │
                  │ System Prompts    │
                  │ Memory Retrieval  │
                  │ Tool Selection    │
                  │ Gemini Function   │
                  │ Response Synth    │
                  └──────┬───────┬────┘
                         │       │
               ┌─────────▼─┐   ┌─▼──────────┐
               │ Gemini AI │   │ Tool Layer │
               └───────────┘   └─────┬──────┘
                                     │
                        ┌────────────┼────────────┐
                        │            │            │
                   Calculator     Weather       Search
                        │            │            │
                        └────────────┼────────────┘
                                     │
                               ┌─────▼──────┐
                               │ Prisma DB  │
                               │ User/Conv  │
                               │ Memories   │
                               └────────────┘
```

---

## Key Modules

### Brain Orchestrator (`apps/brain/src/modules/brain/orchestrator.ts`)
- Manages user context and persistent conversation history.
- Performs memory retrieval (ranking long-term facts/preferences by relevance and importance).
- Composes modular system prompts (`identity.ts`, `personality.ts`, `behavior.ts`, `safety.ts`, `tool-rules.ts`, `memory.ts`).
- Executes multi-turn tool loops with Gemini function declarations.
- Enforces concise response formatting for voice interaction.
- Triggers background memory extraction.

### Tool Registry (`apps/brain/src/modules/tools/`)
- Abstracted tool architecture with Zod validation.
- V1 registered tools: `calculator`, `current_time`, `date_time`, `weather`, `web_search`.
- Records tool execution metadata in the database for debugging and observability.

### Voice Pipeline (`apps/brain/src/modules/voice/`)
- `STTProvider`: Multimodal audio transcription using Gemini or fallback.
- `TTSProvider`: Audio synthesis for earbud playback.
