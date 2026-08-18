# Jarvis V2 Task & Proactivity Engine

## 1. Overview
Jarvis V2 treats Tasks as first-class, durable system entities:
- **Time-Based Tasks**: `REMINDER`, `SCHEDULED_TASK`, `RECURRING_TASK`, `CONDITIONAL_TASK`.
- **Event-Based & Location Reminders**: `EventReminder` attached to `UserEvent` with trigger types (`LOCATION_ENTER`, `LOCATION_NEAR`, `LOCATION_EXIT`, `EVENT_ACTIVE`).

```
Task / Event Created (Voice / Chat / Direct API)
             │
             ▼
     PostgreSQL (Task / UserEvent / EventReminder)
             │
    ┌────────┴──────────────────────────┐
    ▼                                   ▼
Time Scheduler / Runner         Event Evaluation Engine
(Cron / NextRunAt)              (GPS Updates & Geofences)
    │                                   │
    └────────┬──────────────────────────┘
             ▼
 Idempotent Execution & Anti-Spam Cooldown
             │
             ▼
 Proactive Notification Dispatched
```

## 2. Execution Guarantees & Idempotency
* **Backend-Driven**: Tasks and geofence evaluations run server-side, independent of mobile OS thread termination.
* **Idempotency & Cooldowns**: Every execution records state transitions, advancing schedules or enforcing a cooldown window (default 120 minutes) to eliminate repetitive location notifications.
* **User Control**: Tasks and Event Reminders can be viewed, paused, marked completed, or deleted directly from the mobile app.
