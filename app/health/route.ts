import { NextResponse } from 'next/server';
import { listRegisteredMcpTools } from '@/src/mcp-server/dispatcher';

export async function GET() {
  const mcpPort = process.env.MCP_PORT || '3001';
  const mcpUrl = process.env.MCP_SERVER_URL || `http://127.0.0.1:${mcpPort}/mcp`;
  let mcpStatus = 'unknown';

  try {
    const registeredTools = listRegisteredMcpTools();
    if (registeredTools.length > 0) {
      mcpStatus = 'connected';
    } else {
      const res = await fetch(mcpUrl, {
        cache: 'no-store',
        signal: AbortSignal.timeout(2000),
      });
      mcpStatus = res.ok ? 'connected' : `http_${res.status}`;
    }
  } catch (err: unknown) {
    mcpStatus = err instanceof Error ? err.message : 'unreachable';
  }

  const isHealthy = mcpStatus === 'connected';

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'homerelay-ai',
      timestamp: new Date().toISOString(),
      mcp_server: {
        status: mcpStatus,
        url: mcpUrl,
      },
      ai_provider: process.env.AI_PROVIDER || 'gemini',
    },
    { status: 200 }
  );
}

