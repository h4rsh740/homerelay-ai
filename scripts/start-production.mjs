#!/usr/bin/env node

/**
 * HomeRelay AI — Unified Production Process Runner
 * Starts both the MCP Server (Streamable HTTP) and Next.js Web App in a single container or service.
 * Ideal for Render, Railway, Fly.io, or Docker deployments.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';

const WEB_PORT = process.env.PORT || '3000';
const MCP_PORT = process.env.MCP_PORT || '3001';
const MCP_SECRET = process.env.MCP_SERVER_SECRET || 'homerelay-prod-secret-2026';
const MCP_URL = process.env.MCP_SERVER_URL || `http://127.0.0.1:${MCP_PORT}/mcp`;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 HomeRelay AI Production Supervisor starting...');
console.log(`🌐 Web App Target Port: ${WEB_PORT}`);
console.log(`🔌 MCP Server Target Port: ${MCP_PORT}`);
console.log(`🔗 MCP Internal URL: ${MCP_URL}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Ensure child processes inherit these environment variables
const sharedEnv = {
  ...process.env,
  PORT: WEB_PORT,
  MCP_PORT: MCP_PORT,
  MCP_SERVER_SECRET: MCP_SECRET,
  MCP_SERVER_URL: MCP_URL,
  NODE_ENV: process.env.NODE_ENV || 'production',
};

let mcpProcess = null;
let nextProcess = null;
let isShuttingDown = false;

function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Shutting down all processes gracefully...`);

  if (nextProcess) {
    nextProcess.kill('SIGTERM');
  }
  if (mcpProcess) {
    mcpProcess.kill('SIGTERM');
  }

  setTimeout(() => {
    console.log('⚠️ Forced shutdown timeout reached. Exiting.');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 1. Wait for MCP Server /health endpoint to respond
async function waitForMcpHealth(port, maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const isHealthy = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 1000 }, (res) => {
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          resolve(false);
        }
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });

    if (isHealthy) {
      return true;
    }

    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function start() {
  // 1. Launch MCP Server
  console.log('📦 Starting MCP Server (Streamable HTTP)...');
  mcpProcess = spawn('npx', ['tsx', 'src/mcp-server/index.ts'], {
    env: sharedEnv,
    stdio: 'inherit',
  });

  mcpProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.error(`❌ MCP Server exited unexpectedly with code ${code} / signal ${signal}`);
      shutdown('MCP_CRASH');
    }
  });

  // 2. Wait for MCP Server to be ready
  console.log(`⏳ Waiting for MCP Server on port ${MCP_PORT}...`);
  const ready = await waitForMcpHealth(MCP_PORT);
  if (!ready) {
    console.error(`❌ Timed out waiting for MCP Server on port ${MCP_PORT}!`);
    shutdown('MCP_TIMEOUT');
    return;
  }
  console.log('✅ MCP Server is healthy and accepting connections!');

  // 3. Launch Next.js Production Web Server
  console.log(`🌐 Starting Next.js Web App on 0.0.0.0:${WEB_PORT}...`);
  nextProcess = spawn('npx', ['next', 'start', '-p', WEB_PORT, '-H', '0.0.0.0'], {
    env: sharedEnv,
    stdio: 'inherit',
  });

  nextProcess.on('exit', (code, signal) => {
    if (!isShuttingDown) {
      console.error(`❌ Next.js exited with code ${code} / signal ${signal}`);
      shutdown('NEXT_CRASH');
    }
  });
}

start().catch((err) => {
  console.error('💥 Fatal error starting supervisor:', err);
  process.exit(1);
});
