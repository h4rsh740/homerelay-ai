/**
 * MCP client for Streamable HTTP transport.
 * Used by Next.js API routes to communicate with the local MCP server.
 * This file is SERVER-ONLY.
 */

export interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface MCPListToolsResponse {
  tools: MCPTool[];
}

export interface MCPCallToolResponse {
  result: MCPToolResult;
}

/**
 * Calls a tool on the MCP server via Streamable HTTP transport.
 * Throws on network errors or non-2xx responses.
 */
export async function callMCPTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<MCPToolResult> {
  const serverUrl = process.env.MCP_SERVER_URL;
  const secret = process.env.MCP_SERVER_SECRET;

  if (!serverUrl) throw new Error('MCP_SERVER_URL is not set');
  if (!secret) throw new Error('MCP_SERVER_SECRET is not set');

  const requestBody = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: toolInput,
    },
  };

  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MCP server error ${response.status}: ${errorText}`);
  }

  const data = await parseMcpResponse(response);

  if (data.error) {
    throw new Error(`MCP tool error: ${data.error.message ?? JSON.stringify(data.error)}`);
  }

  return data.result as MCPToolResult;
}

/**
 * Fetches the list of available tools from the MCP server.
 */
export async function listMCPTools(): Promise<MCPTool[]> {
  const serverUrl = process.env.MCP_SERVER_URL;
  const secret = process.env.MCP_SERVER_SECRET;

  if (!serverUrl) throw new Error('MCP_SERVER_URL is not set');
  if (!secret) throw new Error('MCP_SERVER_SECRET is not set');

  const requestBody = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method: 'tools/list',
    params: {},
  };

  const response = await fetch(serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${secret}`,
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`MCP list tools error ${response.status}: ${errorText}`);
  }

  const data = await parseMcpResponse(response);
  return (data.result as MCPListToolsResponse).tools;
}

/**
 * Parses Streamable HTTP response whether returned as SSE (text/event-stream)
 * or as standard JSON (application/json).
 */
interface McpJsonResponse {
  result?: unknown;
  error?: { message?: string };
}

async function parseMcpResponse(response: Response): Promise<McpJsonResponse> {
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const text = await response.text();
    const dataLines = text
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, '').trim())
      .filter(Boolean);

    for (const jsonStr of dataLines) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.result !== undefined || parsed.error !== undefined) {
          return parsed;
        }
      } catch {
        // continue search
      }
    }
    return JSON.parse(text);
  }
  return response.json();
}

/**
 * Extracts text content from an MCP tool result.
 */
export function extractToolResultText(result: MCPToolResult): string {
  return result.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
}
