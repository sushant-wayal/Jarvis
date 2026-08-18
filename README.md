# Jarvis V2: Personal Operating Layer & Agentic Assistant

**Jarvis V2** is an autonomous personal AI agent and operating layer designed to work seamlessly across mobile devices, Bluetooth earbuds, and background routines with **Location Awareness** and **Event-Based Reminders**.

---

## Repository Structure

```text
jarvis/
├── apps/
│   ├── brain/                    # Next.js 15 App Router backend (ReAct Agent, Schedulers, Location & Events, Memory, STT/TTS)
│   └── mobile/                   # Expo React Native app (Voice Orb, Tasks, Memories, History, Settings)
├── packages/
│   └── shared/                   # Shared types, Zod validation schemas, API contracts
├── docs/                         # Location Awareness, Event Reminders, V2 Audit, Agent Architecture, Tasks, Memory, Security
├── .agents/                      # Agent guidelines (AGENTS.md)
├── .env.example
└── README.md
```

---

## V2 Core Capabilities

- 📍 **Location Awareness & Known Places**:
  - Ingests battery-optimized GPS updates from mobile client.
  - Reverse geocodes semantic city, state, country, and matches custom `KnownPlace` regions (*Home, Office, Gym, Airport*).
- 🏖️ **Event-Based & Context-Aware Reminders**:
  - Semantic future intentions (e.g. *"I'm going to Goa next month. Make sure I go parasailing there"*).
  - Geofence and multi-modal trigger evaluation (`LOCATION_ENTER`, `LOCATION_NEAR`, `LOCATION_EXIT`, `EVENT_ACTIVE`).
  - Strict anti-spam cooldowns (default 120 minutes) and single-fire idempotency.
- 🤖 **Autonomous Multi-Step Agent Planner**: ReAct execution loop (**Plan → Execute Tool → Observe → Continue/Finish**) with safety limits (max 12 steps, max 10 tool calls, max 2 retries).
- 🧭 **Structured Intent & Context Engines**: Sub-10ms deterministic intent classification and multi-source context assembly (user profile, location, working memory, active tasks, upcoming events, ranked memories).
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
  - **History & Settings**: Full conversation threads, service health probes, and location awareness controls.

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
- [Location Awareness](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/location-awareness.md)
- [Event-Based Reminders](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/event-reminders.md)
- [Capabilities Guide](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/capabilities-guide.md)
- [V2 Audit & Roadmap](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/v2-audit.md)
- [Agent Architecture](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/agent-architecture.md)
- [Memory System](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/memory.md)
- [Task Engine](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/tasks.md)
- [Security Guardrails](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/security.md)
