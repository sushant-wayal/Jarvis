# Jarvis V2 Event-Based & Context-Aware Reminders

---

## 🌟 Overview

Traditional assistants require explicit clock times (e.g. *"Remind me at 10 AM"*). Jarvis V2 introduces **Event-Based & Context-Aware Reminders**, which trigger when **real-world conditions become relevant**.

### Example Scenario:
1. **User**: *"I'm going to Goa next month."*
   - Jarvis creates a `UserEvent` with title `Goa Trip`, destination `Goa`, and status `PLANNED`.
2. **User**: *"Make sure I go parasailing there."*
   - Jarvis links an `EventReminder` (`Go parasailing`) to the upcoming Goa trip with trigger `LOCATION_ENTER` and target `Goa`.
3. **Real World**: User arrives in Goa.
   - GPS reports coordinates in Goa.
   - `EventEvaluationEngine` identifies geofence match.
   - `UserEvent` transitions to `ACTIVE`.
   - Jarvis dispatches a natural notification:
     > *"You're in Goa. You mentioned wanting to go parasailing here."*
4. **Completion**: User says *"I already went parasailing."*
   - Status transitions to `COMPLETED`. No duplicate reminders will trigger.

---

## 🎯 Trigger Types Supported

| Trigger Type | Description | Example |
| :--- | :--- | :--- |
| `LOCATION_ENTER` | User enters geographic region or city | *"When I reach Goa, remind me to parasail"* |
| `LOCATION_NEAR` | User is within configured radius of place | *"When I'm near the airport, check passport"* |
| `LOCATION_EXIT` | User departs from a known place | *"When I leave office, buy groceries"* |
| `EVENT_ACTIVE` | Associated trip or event becomes active | *"When my trip begins, remind me to check in"* |
| `CONTEXT_MATCH` | Composite conditions (location + time/weather)| Future extensible composite rules |

---

## 🛡️ Anti-Spam & Deduplication Guardrails

- **Cooldown Windows**: Default 120-minute cooldown prevents rapid duplicate alerts if GPS coordinates wobble near a geofence boundary.
- **Single-Fire vs. Recurring**: Reminders are single-fire by default (`PENDING` -> `COMPLETED`). Explicit recurring reminders (*"Every time I'm in Goa..."*) preserve `TRIGGERED` status and enforce cooldown between visits.
- **Cascade Cancellation**: Cancelling an event (*"I'm not going to Goa anymore"*) automatically cancels all pending uncompleted reminders linked to that event.
