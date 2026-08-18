# Jarvis V2 Location Awareness

---

## 🌟 Overview

Jarvis V2 includes **Location Awareness**, transforming Jarvis from a reactive assistant into a **situationally aware operating layer**.

Instead of continuously recording invasive GPS tracks, Jarvis evaluates **semantic context** (e.g. *Home, Office, Airport, Goa, Mumbai*) and matches real-world presence against scheduled intentions.

---

## 📍 Architectural Flow

```
┌─────────────────────────┐
│       Mobile Phone      │
│  - GPS Coordinates      │
│  - Balanced Accuracy    │
│  - Throttled Sync       │
└────────────┬────────────┘
             │ (POST /api/v1/location/update)
             ▼
┌─────────────────────────┐
│     Jarvis API Layer    │
│  - Input Validation     │
│  - Auth & Rate Limit    │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│     Location Service    │
│  - Reverse Geocoding    │
│  - KnownPlace Matcher   │
│  - Upsert LocationState │
└────────────┬────────────┘
             │
             ▼
┌─────────────────────────┐
│ Event Evaluation Engine │
│  - Geofence Distance    │
│  - Trigger Evaluation   │
│  - Cooldown Anti-Spam   │
│  - Proactive Notifs     │
└─────────────────────────┘
```

---

## 🔋 Battery & Privacy Optimization

1. **No Constant GPS Streaming**: Location syncs are throttled to a minimum interval of 1 minute, triggered by significant displacement or foreground application syncs.
2. **Minimal Data Storage**: Only the latest `UserLocationState` and configured `KnownPlace` items are preserved. Detailed location history is not stored by default.
3. **Semantic Display**: Raw coordinates (`15.4909, 73.8278`) are converted into human-readable locations (`Panaji, Goa`) before presentation in the UI.

---

## ⚙️ REST API Endpoints

- `POST /api/v1/location/update` — Submits coordinate updates (`latitude`, `longitude`, `accuracy`).
- `GET /api/v1/location/current` — Retrieves user's latest semantic location and known place.
