# Jarvis V1 Architecture & Readiness Audit for V2 Upgrade

## 1. Executive Summary

This document establishes the baseline audit of the **Jarvis V1** personal assistant system across the mobile client, backend brain, database schema, AI orchestration, tools, and memory systems before beginning the **Jarvis V2 Agentic Personal Assistant Upgrade**.

---

## 2. Current Architecture

### System Topology
```
┌─────────────────────────────────────────────────────────┐
│                    Mobile Client (Expo 54)              │
│  - React Native 0.81.5 / React 19.1.0                   │
│  - Expo AV Audio Pipeline (Recorder + Player)           │
│  - Home Voice Orb, History Tabs, Settings Screen        │
└────────────────────────────┬────────────────────────────┘
                             │ HTTP / JSON (REST API)
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    Jarvis Brain (Next.js 15)            │
│  - API Versioning (/api/v1/*)                           │
│  - BrainOrchestrator (Single/Double Turn Tool Calling)  │
│  - GeminiSpeechToTextProvider & Google TTS Provider     │
│  - Tool Registry (Calculator, Time, Weather, Search)    │
│  - Memory Service & Background Memory Extractor         │
└────────────────────────────┬────────────────────────────┘
                             │ Prisma ORM
                             ▼
┌─────────────────────────────────────────────────────────┐
│                PostgreSQL (Neon Cloud DB)               │
│  - User, Conversation, Message, Memory, ToolExecution   │
│  - Device                                               │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Current Features (V1 Baseline)

| Component | Current Implementation | Status |
| :--- | :--- | :--- |
| **Voice Input** | Expo AV high-quality m4a recording -> Base64 payload | Operational |
| **Speech-to-Text** | Gemini multimodal audio transcription with fast fallback chain | Operational (~400ms) |
| **Text-to-Speech** | Google TTS audio synthesis -> Base64 MP3 stream | Operational |
| **Earbud Playback** | Native audio session routing via Android/iOS Bluetooth stack | Operational |
| **Brain Orchestration** | Prompt composition + Tool calling via `@google/genai` | Operational |
| **Deterministic Fast-Path** | Direct tool output formatting for zero 2nd-turn LLM latency | Operational |
| **Long-Term Memory** | Ranking retrieval + async LLM extraction (`FACT`, `PREFERENCE`, etc.) | Operational |
| **Tools** | `calculator`, `date_time`, `current_time`, `weather`, `web_search` | Operational |
| **Conversation History** | Multi-turn persistence with title generation and message lookup | Operational |
| **Settings & Health** | Service health probe (`/health`), memory management, server URL config | Operational |

---

## 4. Current Database Schema (Prisma)

* **`User`**: `id`, `name`, `preferences` (JSON string), timestamps.
* **`Conversation`**: `id`, `userId`, `title`, timestamps.
* **`Message`**: `id`, `conversationId`, `role` (`USER`, `ASSISTANT`, `SYSTEM`, `TOOL`), `content`, `inputType` (`TEXT`, `VOICE`), `metadata` (JSON string), timestamps.
* **`Memory`**: `id`, `userId`, `type` (`FACT`, `PREFERENCE`, `PERSON`, `PROJECT`, `ROUTINE`, `CONTEXT`), `content`, `importance` (1-5), timestamps.
* **`ToolExecution`**: `id`, `conversationId`, `toolName`, `input`, `output`, `status`, `durationMs`, timestamps.
* **`Device`**: `id`, `userId`, `name`, `platform`, `appVersion`, `lastSeenAt`, timestamps.

---

## 5. Current APIs (`/api/v1/*`)

* `POST /api/v1/chat` — Text chat orchestration with conversation continuity.
* `POST /api/v1/voice` — End-to-end audio recording -> STT -> Brain -> TTS -> Audio playback.
* `POST /api/v1/voice/tts` — On-demand speech synthesis endpoint.
* `GET /api/v1/health` — Health check verifying database, Gemini AI, STT, and TTS.
* `GET /api/v1/conversations` & `GET /api/v1/conversations/[id]` — Conversation threads and messages.
* `GET /api/v1/memory` & `DELETE /api/v1/memory` — Memory item retrieval and deletion.

---

## 6. Current AI & Brain Pipeline

* **Provider**: `@google/genai` with fallback cascade (`gemini-flash-lite-latest`, `gemini-3.7-flash`, `gemini-3-flash-preview`).
* **Turn Sequence**:
  1. System prompt with injected user identity & relevant memories.
  2. Strict alternating conversation history + current user message.
  3. Single-turn tool call generation.
  4. Tool execution via `ToolRegistry`.
  5. Fast direct formatting for deterministic tools or 2nd turn LLM synthesis for open-ended queries.
  6. Non-blocking asynchronous memory extraction turn.

---

## 7. Current Mobile Architecture

* **Framework**: React Native 0.81.5 + Expo SDK 54 (`expo-router` v6).
* **Screens**:
  * `index.tsx`: Voice-first orb with breathing animations and dynamic state badge.
  * `conversation.tsx`: Interactive text thread history with auto-speak toggle.
  * `settings.tsx`: User profile, backend URL switcher, service health, and memory viewer.
* **Hooks**: `useVoiceRecorder` (metering + audio encoding), `useAudioPlayer` (pre-warmed playback + onFinished callbacks).
* **Services**: `JarvisApiClient` with AbortController timeout handling.

---

## 8. Current Limitations & V2 Problem Statement

1. **Reactive Only (No Autonomous Agent Loop)**:
   * V1 is strictly a single/double-turn pipeline: `User Request -> (Tool) -> Final Response`.
   * It cannot execute multi-step plans (e.g. *“Check weather for tomorrow, if it rains search indoor activities, pick the top one, and set a reminder”*).

2. **No Intent Engine**:
   * All requests go through the same broad prompt structure without classifying whether the user wants a quick calculation, an ongoing multi-step task, a reminder, or a preference update.

3. **No Task Engine or Background Execution**:
   * Jarvis cannot execute tasks outside of an active user HTTP request.
   * No scheduled tasks (`remind me tomorrow at 8 AM`), recurring routines, or conditional triggers (`tell me when X happens`).

4. **No Working / Short-Term Task Memory**:
   * Context is limited to recent DB message history + static long-term memory. Intermediate planning state or multi-step entity slots cannot be tracked across turns without polluting persistent memory.

5. **No Confirmation / Tool Risk Policy**:
   * All tools are currently treated as safe and executed immediately without risk tiers (`SAFE`, `LOW_RISK`, `HIGH_RISK`, `CRITICAL`) or user confirmation prompts.

6. **No Streaming or Interrupt Architecture**:
   * Mobile awaits full server completion before starting playback.

---

## 9. Recommended V2 Migration Strategy

We will follow an **incremental, non-destructive 9-phase migration**:

* **Phase 1 (Brain Architecture & Core Abstractions)**:
  * Implement Context Engine (`context-engine.ts`), Intent Engine (`intent-engine.ts`), Agent Execution Model (`AgentRun`, `AgentStep`), and Tool Risk/Permission registry (`riskLevel`, `requiresConfirmation`).
  * Ensure all V1 endpoints (`/api/v1/chat`, `/api/v1/voice`) continue working flawlessly.

* **Phase 2 (Memory System V2)**:
  * Add short-term working memory (`WorkingMemoryService`).
  * Enhance long-term memory with confidence, validation, conflict detection, and lifecycle metadata.
  * Update database schema for Memory confidence and timestamps.

* **Phase 3 (Agent Planner & Multi-Step Runtime)**:
  * Build the ReAct / Planner loop (`Plan -> Tool -> Observe -> Continue/Finish`).
  * Enforce safety guardrails (max steps: 12, max tool calls: 10, max retries: 2, cancellation tokens).
  * Persist `AgentRun` and `AgentStep` in database for full observability.

* **Phase 4 (Task Engine & Scheduler)**:
  * Create `Task` and `TaskExecution` schema entities (`REMINDER`, `SCHEDULED_TASK`, `RECURRING_TASK`, `CONDITIONAL_TASK`).
  * Build external-triggerable task runner and idempotent scheduler engine.

* **Phase 5 (Proactive Notifications)**:
  * Implement proactive notifications and event bus architecture (`MESSAGE_RECEIVED`, `TASK_EXECUTED`, `NOTIFICATION_DISPATCHED`).

* **Phase 6 (Voice V2 & Streaming)**:
  * Explicit 9-state machine (`IDLE`, `LISTENING`, `TRANSCRIBING`, `THINKING`, `EXECUTING`, `SPEAKING`, `INTERRUPTED`, `ERROR`, `OFFLINE`).
  * Prepare streaming SSE endpoints (`/api/v1/chat/stream`).

* **Phase 7 (Mobile UI V2)**:
  * Add Tasks tab/screen (`apps/mobile/app/tasks.tsx`).
  * Add dedicated Memory management screen (`apps/mobile/app/memories.tsx`).
  * Add Active Task / Agent activity drawer and confirmation dialog modal.

* **Phase 8 (Security, Permissions & Injection Defense)**:
  * Untrusted external content isolation, rate limits, user ownership authorization checks.

* **Phase 9 (Verification & Production Hardening)**:
  * Full unit tests, typecheck across monorepo workspaces, end-to-end scenario verification.
