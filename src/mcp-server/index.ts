/**
 * HomeRelay AI — MCP Server Entry Point
 * Runs as a standalone HTTP server on port 3001 (configurable via PORT / MCP_PORT env).
 * Implements the Model Context Protocol using official Streamable HTTP transport.
 *
 * Start with: npx tsx src/mcp-server/index.ts
 * Or via npm script: npm run dev:mcp
 */

import fs from 'node:fs';
import path from 'node:path';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import crypto from 'node:crypto';

// Load .env.local if present in project root
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath) && typeof process.loadEnvFile === 'function') {
    process.loadEnvFile(envPath);
  }
} catch {
  // Ignore env file errors
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { registerCreateTask, taskTools } from './tools/tasks.js';
import { reminderTools } from './tools/reminders.js';
import { parcelTools } from './tools/parcels.js';
import { summaryTools } from './tools/summary.js';

export type McpToolsMode = 'create_task_only' | 'all';

export interface McpServerFactoryOptions {
  toolsMode?: McpToolsMode;
}

export interface McpHttpServerOptions extends McpServerFactoryOptions {
  secret?: string;
  corsOrigin?: string;
}

/**
 * Creates and configures an McpServer instance.
 */
export function createMcpServer(options: McpServerFactoryOptions = {}): McpServer {
  const toolsMode = options.toolsMode ?? (process.env.MCP_TOOLS_MODE as McpToolsMode) ?? 'all';

  const server = new McpServer({
    name: 'homerelay-ai',
    version: '1.0.0',
  });

  if (toolsMode === 'create_task_only') {
    registerCreateTask(server);
  } else {
    taskTools(server);
    reminderTools(server);
    parcelTools(server);
    summaryTools(server);
  }

  return server;
}

/**
 * Creates a compliant Streamable HTTP server for MCP.
 */
export function createMcpHttpServer(options: McpHttpServerOptions = {}): http.Server {
  const serverSecret = options.secret ?? process.env.MCP_SERVER_SECRET;
  const corsOrigin = options.corsOrigin ?? process.env.NEXT_PUBLIC_APP_URL ?? '*';

  // Active sessions map: sessionId -> { transport, server }
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

  const httpServer = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = new URL(req.url ?? '/', 'http://localhost');
    const pathname = parsedUrl.pathname;

    // Health check endpoint
    if (req.method === 'GET' && pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', server: 'homerelay-ai-mcp', version: '1.0.0' }));
      return;
    }

    // Only route /mcp is handled
    if (pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found. Use /mcp endpoint' }));
      return;
    }

    // Bearer token authentication
    if (serverSecret) {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      if (token !== serverSecret) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // ── Handle GET /mcp (SSE stream connection) ─────────────────────────────
    if (req.method === 'GET') {
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        return;
      }
      // If no valid session ID, return 405 Method Not Allowed as per MCP spec
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method Not Allowed. Connect via POST with initialization first.' },
        id: null,
      }));
      return;
    }

    // ── Handle DELETE /mcp (Session termination) ────────────────────────────
    if (req.method === 'DELETE') {
      if (sessionId && sessions.has(sessionId)) {
        const session = sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res);
        sessions.delete(sessionId);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }));
      return;
    }

    // ── Handle POST /mcp ────────────────────────────────────────────────────
    if (req.method === 'POST') {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const bodyStr = Buffer.concat(chunks).toString('utf-8');
      let parsedBody: unknown;
      if (bodyStr.trim().length > 0) {
        try {
          parsedBody = JSON.parse(bodyStr);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: Invalid JSON' }, id: null }));
          return;
        }
      }

      // Existing session request
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (session) {
          await session.transport.handleRequest(req, res, parsedBody);
          return;
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null }));
        return;
      }

      // Initialization request (no sessionId yet)
      if (isInitializeRequest(parsedBody)) {
        const mcpServer = createMcpServer(options);
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (newSid) => {
            sessions.set(newSid, { transport, server: mcpServer });
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, parsedBody);
        return;
      }

      // Stateless fallback for direct JSON-RPC calls without initialize handshake
      const mcpServer = createMcpServer(options);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, parsedBody);
      res.on('close', () => {
        transport.close();
        mcpServer.close();
      });
      return;
    }

    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
  });

  return httpServer;
}

// ── Standalone Server Execution ───────────────────────────────────────────────
const PORT = parseInt(process.env.MCP_PORT ?? process.env.PORT ?? '3001', 10);
const SERVER_SECRET = process.env.MCP_SERVER_SECRET;

const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('src/mcp-server/index.ts') ||
    process.argv[1].endsWith('src/mcp-server/index.js'));

let defaultServer: McpServer | undefined;

if (isMainModule) {
  const toolsMode = (process.env.MCP_TOOLS_MODE as McpToolsMode) ?? 'all';
  defaultServer = createMcpServer({ toolsMode });
  const server = createMcpHttpServer({ toolsMode, secret: SERVER_SECRET });
  server.listen(PORT, () => {
    console.log(`🏠 HomeRelay AI MCP Server running on http://localhost:${PORT}/mcp (mode: ${toolsMode})`);
    console.log(`🔧 Health check: http://localhost:${PORT}/health`);
    if (!SERVER_SECRET) {
      console.warn('⚠️  MCP_SERVER_SECRET is not set — requests are unauthenticated');
    }
  });
} else {
  defaultServer = createMcpServer({ toolsMode: 'all' });
}

export const server = defaultServer!;
export default createMcpHttpServer;
