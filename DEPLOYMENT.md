# 🚀 HomeRelay AI — Cloud Deployment & Hosting Guide (Vercel)

HomeRelay AI is built with an enterprise-grade multi-tier architecture combining a **Next.js 16 Web Dashboard** with a **Model Context Protocol (MCP) Streamable HTTP Server**.

This guide covers deployment to **Vercel** (the native, recommended platform for Next.js 16), as well as Docker options.

---

## 🏗️ Architecture on Vercel Serverless

On Vercel, HomeRelay AI runs as a native Next.js 16 application:

```
┌─────────────────────────────────────────────────────────────────┐
│ Vercel Serverless Edge Platform                                 │
│                                                                 │
│  [Public Internet]                                              │
│          │                                                      │
│          ▼                                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Next.js 16 App Router (Web App & API Routes)              │  │
│  │ - Dashboard & UI: /                                       │  │
│  │ - Natural-Language Planner: /api/plan                     │  │
│  │ - Safety Approval & Live Execution: /api/approve          │  │
│  │ - Platform Health Check: /health                          │  │
│  │ - Streamable HTTP MCP Endpoint: /api/mcp (or /mcp rewrite)│  │
│  └──────────────────────────────┬────────────────────────────┘  │
│                                 │                               │
│                                 ▼                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ In-Process MCP Tool Dispatcher                            │  │
│  │ - 12 Registered Tools (tasks, reminders, parcels, summary)│  │
│  │ - Full schema validation with Zod                         │  │
│  └──────────────────────────────┬────────────────────────────┘  │
│                                 │                               │
│                                 ▼                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Database Layer (Auto-Initialized)                         │  │
│  │ - Embedded PGlite (stored in /tmp/.pglite or memory)      │  │
│  │ - OR Cloud Supabase PostgreSQL (when env vars set)        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

- **Zero Port-Binding Issues:** Tool execution in `/api/approve` executes in-process with 0ms internal latency.
- **MCP Spec Compliant:** External MCP inspectors and tools can query `/api/mcp` or `/mcp` using standard Streamable HTTP JSON-RPC.
- **Embedded Schema Fallback:** All database tables (`tasks`, `reminders`, `demo_parcels`, `execution_logs`) are auto-created on first query.

---

## ⚡ Option 1: Deploy to Vercel (Recommended)

### Step 1: Import Project to Vercel
1. Open the [Vercel Dashboard](https://vercel.com/new).
2. Click **Import** next to your GitHub repository: **`h4rsh740/homerelay-ai`**.
3. Leave **Framework Preset** as **Next.js** (auto-detected).
4. Leave **Root Directory** as `./`.

### Step 2: Configure Environment Variables
Under the **Environment Variables** section, add the following:

| Variable | Value | Notes |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | `<your-gemini-api-key>` | Primary free AI planning key |
| `OPENROUTER_API_KEY` | `<your-openrouter-api-key>` | Secondary fallback key |
| `AI_PROVIDER` | `gemini` | AI orchestrator engine |
| `MCP_SERVER_SECRET` | `<random-secret-token>` | Token for authenticating MCP calls |

*(Optional: If you wish to connect to external Supabase rather than embedded PGlite, add `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`)*.

### Step 3: Deploy
1. Click **Deploy**.
2. Vercel will build and deploy the application in under 60 seconds.
3. Your live application will be available at `https://homerelay-ai.vercel.app` (or your assigned Vercel domain).

---

## 🐳 Option 2: Self-Hosted Docker or VPS

If you prefer self-hosting with Docker Compose:

1. Clone the repository on your server:
   ```bash
   git clone https://github.com/h4rsh740/homerelay-ai.git
   cd homerelay-ai
   ```
2. Set your environment variables:
   ```bash
   export GEMINI_API_KEY="your-gemini-key"
   export MCP_SERVER_SECRET="homerelay-prod-secret-2026"
   ```
3. Start the application:
   ```bash
   docker compose up -d --build
   ```
4. Access the application at `http://your-server-ip:3000`.

---

## ✅ Post-Deployment Verification Checklist

Once deployed to Vercel:

1. **System Health Check:**
   Visit `https://<your-vercel-domain>/health`  
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
2. **MCP HTTP Endpoint:**
   Visit `https://<your-vercel-domain>/api/mcp` (or `/mcp`)  
   Expected response:
   ```json
   {
     "status": "ok",
     "server": "homerelay-ai-mcp",
     "version": "1.0.0",
     "endpoint": "/api/mcp",
     "transport": "Streamable HTTP compatible"
   }
   ```
3. **Task Creation:**
   Visit `https://<your-vercel-domain>/tasks`, click **+ Add Task**, create a task, and verify it persists.
4. **Natural-Language Planning Flow:**
   Visit `https://<your-vercel-domain>/new-request`, enter:
   > *"Clean the air intake and schedule a reminder for 5pm"*
   
   Confirm Gemini generates the structured multi-step plan, click **Approve & Execute**, and watch real-time execution progress complete with all checks green!
