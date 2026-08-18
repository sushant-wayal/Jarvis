# Jarvis V2: Personal Operating Layer & Agentic Assistant

**Jarvis V2** is an autonomous personal AI agent and operating layer designed to work seamlessly across mobile devices, Bluetooth earbuds, and background routines.

---

## Repository Structure

```text
jarvis/
├── apps/
│   ├── brain/                    # Next.js 15 App Router backend (ReAct Agent, Schedulers, Memory, STT/TTS)
│   └── mobile/                   # Expo React Native app (Voice Orb, Tasks, Memories, History, Settings)
├── packages/
│   └── shared/                   # Shared types, Zod validation schemas, API contracts
├── docs/                         # V2 Audit, Agent Architecture, Tasks, Memory, Security, API specs
├── .agents/                      # Agent guidelines (AGENTS.md)
├── .env.example
└── README.md
```

---

## V2 Core Capabilities

- 🤖 **Autonomous Multi-Step Agent Planner**: ReAct execution loop (**Plan → Execute Tool → Observe → Continue/Finish**) with safety limits (max 12 steps, max 10 tool calls, max 2 retries).
- 🧭 **Structured Intent & Context Engines**: Sub-10ms deterministic intent classification and multi-source context assembly (user profile, working memory, active tasks, ranked memories).
- 🧠 **Dual Memory System (V2)**:
  - **Short-Term Working Memory**: Ephemeral slot tracking for active agent goals with automatic TTL expiry.
  - **Long-Term Memory V2**: Knowledge lifecycle with confidence scores, source attribution, and conflict resolution.
- 📋 **Task & Proactivity Engine**:
  - Background scheduler for one-time reminders, recurring routines, and conditional tasks.
  - Idempotent execution and proactive notification dispatch.
- 🛡️ **Tool Permissions & Safety Guardrails**:
  - Risk classification (`SAFE`, `LOW_RISK`, `HIGH_RISK`, `CRITICAL`).
  - Interactive **ConfirmationModal** on mobile client for destructive or sensitive operations.
- 🎙️ **Low-Latency Voice Architecture**:
  - Expo AV recording with Bluetooth earbud compatibility.
  - Gemini multimodal speech-to-text with production fallback cascade.
  - Sub-1.2s fast path for deterministic arithmetic and information tools.
- 📱 **Multi-Screen Mobile Client**:
  - **Voice Home**: Ambient Voice Orb with real-time breathing animations.
  - **Tasks**: Create, filter, complete, and delete scheduled routines.
  - **Memories**: Browse, search, filter by type (`PREFERENCE`, `FACT`, `GOAL`), and delete memories.
  - **History & Settings**: Full conversation threads and service health probes.

---

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up environment configuration:
   ```bash
   cp .env.example .env
   ```
3. Initialize Database & Shared Types:
   ```bash
   npm run build:shared
   npm run prisma:push --workspace=apps/brain
   ```
4. Run Tests & Typecheck:
   ```bash
   npm test
   npm run typecheck
   ```
5. Start Brain & Mobile:
   ```bash
   npm run dev:brain
   npm run dev:mobile
   ```

For in-depth architectural and developer documentation, see:
- [V2 Audit & Roadmap](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/v2-audit.md)
- [Agent Architecture](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/agent-architecture.md)
- [Memory System](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/memory.md)
- [Task Engine](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/tasks.md)
- [Security Guardrails](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/security.md)
