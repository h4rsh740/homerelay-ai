import { NextResponse } from 'next/server';

export async function GET() {
  const mcpPort = process.env.MCP_PORT || '3001';
  let mcpStatus = 'unknown';

  try {
    const res = await fetch(`http://127.0.0.1:${mcpPort}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      mcpStatus = 'connected';
    } else {
      mcpStatus = `http_${res.status}`;
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
        url: process.env.MCP_SERVER_URL || `http://127.0.0.1:${mcpPort}/mcp`,
      },
      ai_provider: process.env.AI_PROVIDER || 'gemini',
    },
    { status: isHealthy ? 200 : 200 } // Return 200 so container platforms don't flap during boot
  );
}
