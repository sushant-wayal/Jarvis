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
* **Granular Permission & Policy Enforcement (`ALLOW` | `ASK` | `DENY`)**:
  - Dynamically injects user-configured policies into the LLM system prompt:
    - `[PRE-AUTHORIZED ACTIONS - DIRECT EXECUTION]`: Tools the user explicitly set to `ALLOW`.
    - `[DISALLOWED ACTIONS - BLOCKED BY USER]`: Tools the user explicitly set to `DENY`.
  - Evaluates runtime policies with strict hierarchy:
    1. Tool-Specific Policy (`toolPolicies[tool.name]` / `toolPolicies[tool.id]`)
    2. Action-Type Policy (`policies[tool.actionType]`)
    3. Tool Default (`requiresConfirmation`)
  - **`ALLOW`**: Auto-executes directly without pausing for confirmation in conversation, even for high-risk actions.
  - **`ASK`**: Halts execution, records pending `AgentStep` with `mode: 'CONFIRMATION'`, and presents an interactive authorization card on mobile.
  - **`DENY`**: Blocks execution immediately, returning a user-friendly notice indicating that the tool is disabled in settings.
* Preserves single-turn direct formatting for deterministic tools (`calculator`, `date_time`, `weather`) to ensure sub-1.2s voice responses.
