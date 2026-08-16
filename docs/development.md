# Jarvis V1 Development Guide

## Prerequisites

- **Node.js**: v18.0.0 or higher (v22.x recommended)
- **NPM**: v10.x or higher
- **Expo Go / Development Client** for mobile testing on iOS / Android / Web
- **Google Gemini API Key**: Set in `apps/brain/.env` or root `.env` as `GEMINI_API_KEY`

---

## Local Setup Instructions

### 1. Install Dependencies
From the repository root:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `DATABASE_URL` is set to `"file:./dev.db"` and `GEMINI_API_KEY` contains your Gemini API key.

### 3. Initialize Prisma Database Schema
```bash
npm run prisma:push --workspace=apps/brain
```

### 4. Build Shared Package
```bash
npm run build:shared
```

---

## Running Applications

### Start Backend (`apps/brain`)
```bash
npm run dev:brain
```
The Next.js server will start at `http://localhost:3000`. Test the health endpoint at `http://localhost:3000/api/v1/health`.

### Start Mobile Client (`apps/mobile`)
```bash
npm run dev:mobile
```
Press `w` to open web preview, `a` for Android emulator, or scan the QR code with Expo Go.

---

## Verification & Testing Commands

- **Typecheck all workspaces**:
  ```bash
  npm run typecheck
  ```
- **Lint all workspaces**:
  ```bash
  npm run lint
  ```
