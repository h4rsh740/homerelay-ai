# 🚀 HomeRelay AI — Cloud Deployment & Hosting Guide

HomeRelay AI is built with an enterprise-grade multi-tier architecture combining a **Next.js 16 Web Dashboard** with a **Model Context Protocol (MCP) Streamable HTTP Server**.

This guide covers 1-click and automated deployments to **Render**, **Railway**, **Fly.io**, or **Docker (AWS / GCP / VPS)**.

---

## 🏗️ Deployment Architecture

In production, HomeRelay AI runs as a unified containerized service:

```
┌────────────────────────────────────────────────────────┐
│ Cloud Host (Render / Railway / Fly.io / Docker)        │
│                                                        │
│  [Public Internet]                                     │
│          │ (HTTPS :443 -> :PORT)                       │
│          ▼                                             │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Next.js 16 App Router (Web App & API Routes)     │  │
│  │ - Dashboard & UI: /                              │  │
│  │ - Natural-Language Planner: /api/plan            │  │
│  │ - Safety Approval: /api/approve                  │  │
│  │ - Health Monitor: /health                        │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│                         │ Streamable HTTP (Localhost)  │
│                         ▼ (Authorization: Bearer)      │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Standalone MCP Server (Streamable HTTP Transport)│  │
│  │ - Port: 3001 (Internal only)                     │  │
│  │ - Endpoint: http://127.0.0.1:3001/mcp            │  │
│  │ - 12 Registered Tools (tasks, reminders, parcels)│  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│                         ▼                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Storage Engine                                   │  │
│  │ - Embedded PGlite (WASM PostgreSQL with disk)    │  │
│  │ - OR Cloud Supabase (when env vars configured)   │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
```

Both services are launched and supervised by [`scripts/start-production.mjs`](./scripts/start-production.mjs), which:
1. Starts the MCP server on `MCP_PORT` (`3001`).
2. Awaits its `/health` check.
3. Starts Next.js on `PORT` (`$PORT` assigned by host).
4. Handles `SIGTERM`/`SIGINT` to ensure zero zombie processes.

---

## 📋 Required Environment Variables

Configure these in your cloud provider's dashboard:

| Variable | Required | Description | Example / Default |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | **Yes** | Execution mode | `production` |
| `GEMINI_API_KEY` | **Recommended** | Google Gemini API key for AI planning | `AIzaSy...` |
| `OPENROUTER_API_KEY`| **Optional** | OpenRouter key for free model fallback | `sk-or-v1-...` |
| `AI_PROVIDER` | Optional | AI engine provider | `gemini` (default) |
| `MCP_SERVER_SECRET` | **Yes** | Internal bearer token for MCP calls | Random secure string (e.g. `openssl rand -hex 24`) |
| `NEXT_PUBLIC_APP_URL`| Optional | Your public deployed domain URL | `https://your-app.onrender.com` |
| `NEXT_PUBLIC_APP_NAME`| Optional | UI brand title | `HomeRelay AI` |

> [!NOTE]
> **Database:** HomeRelay AI defaults to local embedded **PGlite** (zero setup required). If you wish to connect to external Supabase PostgreSQL, add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

---

## ⚡ Option 1: Deploy to Render (Recommended)

### Method A: 1-Click Render Blueprint (Fastest)

1. Fork or push this repository to your GitHub account: [github.com/h4rsh740/homerelay-ai](https://github.com/h4rsh740/homerelay-ai).
2. Go to the [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Blueprint**.
3. Connect your repository. Render will automatically read [`render.yaml`](./render.yaml).
4. Enter your `GEMINI_API_KEY` (and optionally `OPENROUTER_API_KEY`).
5. Click **Apply**. Render will build the Docker container and deploy your live URL.

### Method B: Manual Web Service Setup on Render

1. Click **New +** -> **Web Service**.
2. Connect your Git repository.
3. Configure the service settings:
   - **Environment:** `Docker`
   - **Dockerfile Path:** `./Dockerfile`
   - **Instance Type:** `Free` or `Starter`
   - **Health Check Path:** `/health`
4. In **Environment Variables**, add:
   - `GEMINI_API_KEY` = `<your-gemini-key>`
   - `MCP_SERVER_SECRET` = `<random-secret-token>`
   - `AI_PROVIDER` = `gemini`
5. Click **Deploy Web Service**.

---

## 🚆 Option 2: Deploy to Railway

1. Open the [Railway Dashboard](https://railway.com/) and click **New Project**.
2. Select **Deploy from GitHub repo** and choose `homerelay-ai`.
3. Railway automatically detects the [`Dockerfile`](./Dockerfile) and [`railway.json`](./railway.json).
4. Go to **Variables** tab and add:
   - `GEMINI_API_KEY` = `<your-gemini-key>`
   - `MCP_SERVER_SECRET` = `<random-secret-token>`
5. Go to **Settings** -> **Networking** -> click **Generate Domain**.
6. Railway will build and deploy the container.

---

## 🪰 Option 3: Deploy to Fly.io

1. Install the Fly CLI and log in:
   ```bash
   brew install flyctl
   fly auth login
   ```
2. In the project directory, run:
   ```bash
   fly launch --no-deploy
   ```
3. Set your production secrets securely:
   ```bash
   fly secrets set GEMINI_API_KEY="your-gemini-key" MCP_SERVER_SECRET="random-secret-token"
   ```
4. Deploy to Fly.io:
   ```bash
   fly deploy
   ```
5. Open your live app:
   ```bash
   fly open
   ```

---

## 🐳 Option 4: Self-Hosted Docker or VPS

### Using Docker Compose (Single Command)

1. Clone the repository on your server:
   ```bash
   git clone https://github.com/h4rsh740/homerelay-ai.git
   cd homerelay-ai
   ```
2. Create your `.env` or set environment variables:
   ```bash
   export GEMINI_API_KEY="your-gemini-key"
   export MCP_SERVER_SECRET="$(openssl rand -hex 24)"
   ```
3. Start the application:
   ```bash
   docker compose up -d --build
   ```
4. Access the application at `http://your-server-ip:3000`.

---

## ✅ Post-Deployment Verification Checklist

Once your deployment is live:

1. **System Health Check:**
   Visit `https://your-deployed-domain.com/health`  
   Expected JSON response:
   ```json
   {
     "status": "healthy",
     "service": "homerelay-ai",
     "mcp_server": {
       "status": "connected",
       "url": "http://127.0.0.1:3001/mcp"
     },
     "ai_provider": "gemini"
   }
   ```
2. **Dashboard UI:**
   Visit `https://your-deployed-domain.com/` and confirm the dark navy and teal SaaS dashboard loads.
3. **Task CRUD Flow:**
   Navigate to `/tasks`, create a task, and verify it persists after reload.
4. **Natural-Language Planning Flow:**
   Navigate to `/new-request`, enter:
   > *"Clean the air intake and schedule a reminder for 5pm"*
   
   Confirm Gemini generates a structured plan, click **Approve & Execute**, and watch real-time MCP execution progress via SSE!
