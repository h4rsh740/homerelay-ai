import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractToolResultText, type MCPToolResult } from '@/lib/mcp/client';

// Mock fetch globally
const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('extractToolResultText', () => {
  it('extracts text from a single text content item', () => {
    const result: MCPToolResult = {
      content: [{ type: 'text', text: 'Task created successfully' }],
    };
    expect(extractToolResultText(result)).toBe('Task created successfully');
  });

  it('joins multiple text items with newlines', () => {
    const result: MCPToolResult = {
      content: [
        { type: 'text', text: 'Line 1' },
        { type: 'text', text: 'Line 2' },
      ],
    };
    expect(extractToolResultText(result)).toBe('Line 1\nLine 2');
  });

  it('ignores non-text content items', () => {
    const result: MCPToolResult = {
      content: [
        { type: 'image', data: 'base64data', mimeType: 'image/png' },
        { type: 'text', text: 'Some text' },
      ],
    };
    expect(extractToolResultText(result)).toBe('Some text');
  });

  it('returns empty string for empty content', () => {
    const result: MCPToolResult = { content: [] };
    expect(extractToolResultText(result)).toBe('');
  });
});

describe('callMCPTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MCP_SERVER_URL', 'http://localhost:3001/mcp');
    vi.stubEnv('MCP_SERVER_SECRET', 'test-secret');
  });

  it('throws if MCP_SERVER_URL is missing', async () => {
    vi.unstubAllEnvs();
    const { callMCPTool } = await import('@/lib/mcp/client');
    await expect(callMCPTool('create_task', {})).rejects.toThrow('MCP_SERVER_URL is not set');
  });

  it('throws if MCP_SERVER_SECRET is missing', async () => {
    vi.stubEnv('MCP_SERVER_URL', 'http://localhost:3001/mcp');
    delete process.env.MCP_SERVER_SECRET;
    const { callMCPTool } = await import('@/lib/mcp/client');
    await expect(callMCPTool('create_task', {})).rejects.toThrow('MCP_SERVER_SECRET is not set');
  });

  it('sends correct JSON-RPC payload', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: '123',
        result: {
          content: [{ type: 'text', text: '{"success":true}' }],
        },
      }),
    });

    const { callMCPTool } = await import('@/lib/mcp/client');
    const result = await callMCPTool('create_task', { title: 'Test task' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/mcp');
    expect(options.method).toBe('POST');

    const body = JSON.parse(options.body as string);
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('create_task');
    expect(body.params.arguments).toEqual({ title: 'Test task' });
    expect(result.content[0].text).toBe('{"success":true}');
  });

  it('throws on non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    });

    const { callMCPTool } = await import('@/lib/mcp/client');
    await expect(callMCPTool('list_tasks', {})).rejects.toThrow('MCP server error 500');
  });

  it('throws on JSON-RPC error response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: '123',
        error: { code: -32603, message: 'Tool not found' },
      }),
    });

    const { callMCPTool } = await import('@/lib/mcp/client');
    await expect(callMCPTool('nonexistent_tool', {})).rejects.toThrow('Tool not found');
  });
});

describe('listMCPTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('MCP_SERVER_URL', 'http://localhost:3001/mcp');
    vi.stubEnv('MCP_SERVER_SECRET', 'test-secret');
  });

  it('throws if MCP_SERVER_URL is not set', async () => {
    vi.unstubAllEnvs();
    const { listMCPTools } = await import('@/lib/mcp/client');
    await expect(listMCPTools()).rejects.toThrow('MCP_SERVER_URL is not set');
  });

  it('throws if MCP_SERVER_SECRET is not set', async () => {
    vi.stubEnv('MCP_SERVER_URL', 'http://localhost:3001/mcp');
    delete process.env.MCP_SERVER_SECRET;
    const { listMCPTools } = await import('@/lib/mcp/client');
    await expect(listMCPTools()).rejects.toThrow('MCP_SERVER_SECRET is not set');
  });

  it('successfully fetches tools list', async () => {
    const mockTools = [
      { name: 'create_task', description: 'Create task', inputSchema: {} },
      { name: 'list_tasks', description: 'List tasks', inputSchema: {} },
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        id: 'abc',
        result: { tools: mockTools },
      }),
    });

    const { listMCPTools } = await import('@/lib/mcp/client');
    const tools = await listMCPTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('create_task');
  });

  it('throws on non-2xx response from listMCPTools', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    const { listMCPTools } = await import('@/lib/mcp/client');
    await expect(listMCPTools()).rejects.toThrow('MCP list tools error 503');
  });
});
