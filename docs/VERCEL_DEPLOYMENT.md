# Jarvis Brain - Vercel Deployment Guide

This guide provides step-by-step instructions to deploy the **Jarvis Brain** (Next.js serverless backend) to [Vercel](https://vercel.com).

---

## 1. Prerequisites

Before deploying to Vercel, ensure you have:
1. A **Vercel Account** ([vercel.com](https://vercel.com))
2. A **PostgreSQL Database** (e.g., [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)).
3. A **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/).
4. (Optional) **Tavily / Search API Key** and **OpenWeatherMap API Key**.

---

## 2. Database Setup

1. Create a PostgreSQL database on Neon, Supabase, or Vercel Postgres.
2. Obtain your pooled connection string:
   ```text
   postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/jarvis?sslmode=require
   ```
3. Push your Prisma schema to your remote database:
   ```bash
   cd apps/brain
   DATABASE_URL="your-postgresql-url" npx prisma db push
   ```

---

## 3. Deploying to Vercel

### Option A: Deploy from Git (Recommended)

1. Push your repository to **GitHub** / **GitLab** / **Bitbucket**.
2. Go to [Vercel Dashboard](https://vercel.com/new) -> **Import Project**.
3. Select your repository.

#### Project Settings on Vercel:
- **Framework Preset**: `Next.js`
- **Root Directory**: Leave blank (root `.`) OR select `apps/brain`.
  - *If deploying from root (`.`)*: Vercel will automatically run `npm run build:shared && npm run build:brain`.
  - *If setting Root Directory to `apps/brain`*: Vercel will run `prisma generate && next build` in `apps/brain`.

---

## 4. Environment Variables Checklist

Configure the following Environment Variables in **Project Settings > Environment Variables** on Vercel:

| Variable Name | Description | Example / Default | Required |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (pooled) | `postgresql://user:pass@host/db?sslmode=require` | **Yes** |
| `GEMINI_API_KEY` | Google Gemini API key for AI brain & voice | `AIzaSy...` | **Yes** |
| `JARVIS_API_SECRET` | Secret token for securing endpoints | `your-production-secret-key` | Recommended |
| `CRON_SECRET` | Secret used by Vercel to secure `/api/cron/*` | `your-random-cron-secret` | Optional |
| `SEARCH_API_KEY` | Tavily Web Search API key | `tvly-...` | Optional |
| `WEATHER_API_KEY` | OpenWeatherMap API key | `xyz...` | Optional |
| `NODE_ENV` | Environment identifier | `production` | Automatic |

> [!TIP]
> When `CRON_SECRET` is set in Vercel environment variables, Vercel automatically attaches `Authorization: Bearer <CRON_SECRET>` to cron requests targeting `/api/cron/cleanup`.

---

## 5. Built-in Vercel Features

### Automated Crons (`vercel.json`)
The repository includes automated cleanup cron configuration:
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 0 * * *"
    }
  ]
}
```
- **Cleanup Schedule**: Runs every day at 00:00 UTC to purge expired conversations, messages, and TTL-expired memories.

### Serverless Function Timeouts & Streaming
- Streaming chat (`/api/v1/chat/stream`) utilizes Server-Sent Events (SSE) compatible with Vercel Serverless.
- Heavy operations (Voice STT/TTS and multi-step agent loops) are configured with `maxDuration = 60` and `runtime = 'nodejs'` to prevent early timeouts.

### Global CORS & Preflight Handling
- `apps/brain/src/middleware.ts` handles `OPTIONS` preflight requests (204 No Content) and attaches CORS headers so mobile clients can connect securely.

---

## 6. Verifying Your Deployment

Once Vercel finishes building, your backend will be accessible at `https://<your-app-name>.vercel.app`.

### Health Check:
```bash
curl -X GET https://<your-app-name>.vercel.app/api/v1/health
```
**Expected Response:**
```json
{
  "success": true,
  "data": {
    "status": "operational",
    "timestamp": "2026-08-28T...",
    "services": {
      "database": true,
      "aiProvider": true,
      "sttProvider": true,
      "ttsProvider": true
    },
    "version": "1.0.0"
  },
  "error": null,
  "requestId": "req_..."
}
```

### Chat Test:
```bash
curl -X POST https://<your-app-name>.vercel.app/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Jarvis, are you online?", "userId": "test-user"}'
```

---

## 7. Connecting the Mobile App

In your local `.env` or Expo configuration for `apps/mobile`:
```env
EXPO_PUBLIC_JARVIS_API_URL="https://<your-app-name>.vercel.app/api/v1"
EXPO_PUBLIC_JARVIS_API_KEY="your-production-secret-key"
```
Rebuild or restart Expo (`npm run dev:mobile`) to begin communicating with your live Vercel Brain backend.
