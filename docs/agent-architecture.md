# Jarvis V2 Agent Architecture

## 1. Overview
Jarvis V2 elevates the personal assistant into an autonomous **Personal Operating Layer** utilizing a structured ReAct (**Plan → Execute Tool → Observe → Continue/Finish**) agent loop.

```
User Request
     │
     ▼
Context Engine (User Profile + Working Memory + Long-Term Memories + Active Tasks)
     │
     ▼
Intent Engine (Deterministic / Heuristic & AI Classification)
     │
     ▼
Agent Planner (ReAct Loop, Max 12 Steps, Max 10 Tool Calls)
     │
     ├───────────────┬───────────────┐
     ▼               ▼               ▼
Tool Registry   Task Engine    Memory Engine
 (Permissions)  (Schedulers)   (Lifecycle)
     │               │               │
     └───────────────┼───────────────┘
                     │
                     ▼
             Observation & Loop
                     │
                     ▼
           Direct Response / TTS
```

## 2. Core Components

### Context Engine (`apps/brain/src/modules/brain/context-engine.ts`)
* Gathers user profile, active tasks, short-term working memory, and ranked relevant memories concurrently.
* Delivers bounded, high-relevance prompt contexts.

### Intent Engine (`apps/brain/src/modules/brain/intent-engine.ts`)
* Fast-path deterministic classifier (<10ms) for arithmetic, time, weather, reminder triggers.
* Structured AI fallback for complex multi-intent utterances.

### Agent Planner (`apps/brain/src/modules/brain/agent-planner.ts`)
* Coordinates multi-step tool calling and handles tool failures gracefully.
* Halts on high-risk tools (`requiresConfirmation: true`) to request user authorization.
* Preserves single-turn direct formatting for deterministic tools (`calculator`, `date_time`, `weather`) to ensure sub-1.2s voice responses.
