/**
 * HomeRelay AI — MCP In-Process Tool Dispatcher
 * Provides direct tool dispatching for serverless environments (e.g. Vercel)
 * and seamless fallback when standalone HTTP MCP server is offline.
 */

import { createMcpServer, type McpToolsMode } from './index';
import type { MCPTool } from '@/lib/mcp/client';

let cachedServer: ReturnType<typeof createMcpServer> | null = null;

export function getSharedMcpServer() {
  if (!cachedServer) {
    const toolsMode = (process.env.MCP_TOOLS_MODE as McpToolsMode) ?? 'all';
    cachedServer = createMcpServer({ toolsMode });
  }
  return cachedServer;
}

export async function dispatchMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }>; isError?: boolean }> {
  const server = getSharedMcpServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registeredTool = (server as any)._registeredTools?.[toolName];

  if (!registeredTool) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `MCP error -32602: Tool ${toolName} not found`,
        },
      ],
      isError: true,
    };
  }

  try {
    return await registeredTool.handler(args);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: 'text' as const,
          text: `MCP tool execution error in ${toolName}: ${msg}`,
        },
      ],
      isError: true,
    };
  }
}

export function listRegisteredMcpTools(): MCPTool[] {
  const server = getSharedMcpServer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = (server as any)._registeredTools ?? {};

  return Object.keys(tools).map((name) => ({
    name,
    description: tools[name].description || '',
    inputSchema: tools[name].inputSchema || { type: 'object', properties: {} },
  }));
}
