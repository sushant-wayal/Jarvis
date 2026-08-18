# Jarvis V2 Task & Proactivity Engine

## 1. Overview
Jarvis V2 treats Tasks as first-class, durable system entities (`REMINDER`, `SCHEDULED_TASK`, `RECURRING_TASK`, `CONDITIONAL_TASK`).

```
Task Created (Voice / Chat / Direct API)
             │
             ▼
      PostgreSQL (Task)
             │
      Task Scheduler / Runner
             │
             ▼
Idempotent Execution (TaskExecution Record)
             │
             ▼
   Proactive Notification Dispatched
```

## 2. Execution Guarantees & Idempotency
* **Backend-Driven**: Tasks run independently from mobile app foreground state.
* **Idempotency**: Every run records a `TaskExecution` row and advances `nextRunAt` / transitions `status = 'COMPLETED'` in a database transaction, eliminating duplicate notifications.
* **User Control**: Tasks can be viewed, paused, resumed, or deleted directly from the **Tasks Screen** (`app/tasks.tsx`).
