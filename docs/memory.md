# Jarvis V2 Memory System

## 1. Dual Memory Architecture
Jarvis V2 implements a clear boundary between **Ephemeral Working Memory** and **Persistent Long-Term Memory**.

### Short-Term Working Memory (`WorkingMemoryService`)
* Tracks temporary task slots (e.g. flight destinations, dates, budgets) for active agent goals.
* Automatically expires (default TTL: 15 minutes) without cluttering persistent storage.

### Long-Term Memory V2 (`MemoryLifecycleService` & `MemoryService`)
* Categorized by `FACT`, `PREFERENCE`, `PERSON`, `PROJECT`, `ROUTINE`, `GOAL`, `CONSTRAINT`, `HABIT`, and `CONTEXT`.
* Stores confidence scores (0.0 to 1.0) and source attribution (`USER_EXPLICIT`, `EXTRACTED_CONVERSATION`).
* Implements conflict resolution to update conflicting memories when newer, higher-confidence preferences are stated.
* Exposed to the user via the dedicated **Memories Screen** (`app/memories.tsx`) for searching, filtering, and deletion.
