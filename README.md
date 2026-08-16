# Jarvis V1: Voice-First Personal Assistant

**Jarvis** is a personal AI assistant monorepo designed to be accessible anywhere through mobile devices and ordinary Bluetooth earbuds.

---

## Repository Structure

```text
jarvis/
├── apps/
│   ├── brain/                    # Next.js 15 App Router backend (LLM, Tools, Memory, STT/TTS)
│   └── mobile/                   # Expo React Native app (Voice Orb, History, Settings)
├── packages/
│   └── shared/                   # Shared types, Zod schemas, API contracts
├── docs/                         # Architecture, API specs, Tool registry, Dev guide
├── .agents/                      # Agent guidelines (AGENTS.md)
├── .env.example
└── README.md
```

---

## Core Features

- 🎙️ **Voice-First Loop**: Record audio on mobile -> STT transcription -> Gemini tool loop -> TTS response -> Bluetooth earbud playback.
- ⚡ **Google Gemini SDK Integration**: `@google/genai` with native function calling and multi-turn tool loops.
- 🛠️ **Modular Tool System**:
  - `calculator`: Safe math evaluations.
  - `current_time`: Timezone & world clock lookup.
  - `date_time`: Date math & weekday calculations.
  - `weather`: Open-Meteo API provider abstraction.
  - `web_search`: Live web search lookup.
- 🧠 **Structured Memory System**: Automatic background extraction of long-term user facts and preferences, with relevance ranking during conversation turns.
- 📱 **Minimal Futuristic Mobile UI**: VoiceOrb animation states (`IDLE`, `LISTENING`, `PROCESSING`, `THINKING`, `SPEAKING`, `ERROR`, `OFFLINE`).

---

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
3. Initialize Database & Shared Types:
   ```bash
   npm run build:shared
   npm run prisma:push --workspace=apps/brain
   ```
4. Start Backend:
   ```bash
   npm run dev:brain
   ```
5. Start Mobile App:
   ```bash
   npm run dev:mobile
   ```

For detailed documentation, see [Development Guide](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/development.md), [Architecture](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/architecture.md), and [API Specs](file:///c:/Users/susha/OneDrive/Desktop/jarvis/docs/api.md).
