import { NextRequest, NextResponse } from 'next/server';
import { dispatchMcpTool, listRegisteredMcpTools } from '@/src/mcp-server/dispatcher';

export async function POST(req: NextRequest) {
  const secret = process.env.MCP_SERVER_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (token !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error: Invalid JSON' }, id: null },
      { status: 400 }
    );
  }

  const { jsonrpc = '2.0', id = null, method, params = {} } = body;

  // 1. Initialize Handshake
  if (method === 'initialize') {
    return NextResponse.json({
      jsonrpc,
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: true } },
        serverInfo: { name: 'homerelay-ai', version: '1.0.0' },
      },
    });
  }

  // 2. Tools List Discovery
  if (method === 'tools/list') {
    return NextResponse.json({
      jsonrpc,
      id,
      result: {
        tools: listRegisteredMcpTools(),
      },
    });
  }

  // 3. Tools Call Execution
  if (method === 'tools/call') {
    const toolName = params.name as string;
    const toolArgs = (params.arguments as Record<string, unknown>) || {};
    try {
      const result = await dispatchMcpTool(toolName, toolArgs);
      return NextResponse.json({ jsonrpc, id, result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        jsonrpc,
        id,
        result: {
          content: [{ type: 'text' as const, text: message }],
          isError: true,
        },
      });
    }
  }

  return NextResponse.json(
    { jsonrpc, id, error: { code: -32601, message: `Method '${method}' not found` } },
    { status: 404 }
  );
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    server: 'homerelay-ai-mcp',
    version: '1.0.0',
    endpoint: '/api/mcp',
    transport: 'Streamable HTTP compatible',
  });
}
