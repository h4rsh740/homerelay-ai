import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHttpServer } from '@/src/mcp-server/index';
import { getMcpDbClient } from '@/src/mcp-server/db';

describe('Milestone 1: MCP Server Streamable HTTP Transport & create_task Tool', () => {
  const secret = 'test-mcp-secret-123';
  let httpServer: Server;
  let serverUrl: string;
  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    // Start MCP server in create_task_only mode with authentication
    httpServer = createMcpHttpServer({
      toolsMode: 'create_task_only',
      secret,
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as AddressInfo).port;
    serverUrl = `http://localhost:${port}/mcp`;

    // Connect official MCP client using Streamable HTTP with Authorization header
    client = new Client(
      { name: 'mcp-integration-test-client', version: '1.0.0' },
      { capabilities: {} }
    );
    transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${secret}`,
        },
      },
    });
    await client.connect(transport);
  });

  afterAll(async () => {
    try {
      await client.close();
    } catch {
      // Ignore cleanup error if already closed
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('1. tools/list discovers ONLY create_task in Milestone 1', async () => {
    const response = await client.listTools();
    expect(response.tools).toBeDefined();
    expect(response.tools.length).toBe(1);

    const tool = response.tools[0];
    expect(tool.name).toBe('create_task');
    expect(tool.description).toContain('Create a new household task');
    expect(tool.inputSchema.properties).toHaveProperty('title');
    expect(tool.inputSchema.properties).toHaveProperty('priority');
    expect(tool.inputSchema.properties).toHaveProperty('description');
    expect(tool.inputSchema.properties).toHaveProperty('due_date');
  });

  it('2. tools/call executes create_task and returns structured success', async () => {
    const taskTitle = `Milestone 1 Test Task ${Date.now()}`;
    const result = await client.callTool({
      name: 'create_task',
      arguments: {
        title: taskTitle,
        description: 'Verified via Streamable HTTP transport',
        priority: 'high',
      },
    });

    if (result.isError) {
      console.error('MILESTONE 1 CALL FAILED:', JSON.stringify(result));
    }
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content).toBeDefined();
    expect(content.length).toBeGreaterThan(0);

    const firstContent = content[0];
    expect(firstContent.type).toBe('text');
    const parsed = JSON.parse(firstContent.text!);

    expect(parsed.success).toBe(true);
    expect(parsed.task).toBeDefined();
    expect(parsed.task.id).toBeDefined();
    expect(parsed.task.title).toBe(taskTitle);
    expect(parsed.task.priority).toBe('high');
    expect(parsed.task.status).toBe('pending');

    // 3. Confirm that the resulting record exists in Supabase / PGlite
    const db = getMcpDbClient();
    const { data: dbRow, error } = await db
      .from('tasks')
      .select('*')
      .eq('id', parsed.task.id)
      .single();

    expect(error).toBeNull();
    expect(dbRow).toBeDefined();
    expect(dbRow!.id).toBe(parsed.task.id);
    expect(dbRow!.title).toBe(taskTitle);
    expect(dbRow!.priority).toBe('high');
    expect(dbRow!.status).toBe('pending');
  });

  it('3. rejects unauthenticated client connection with 401', async () => {
    const unauthClient = new Client(
      { name: 'unauth-client', version: '1.0.0' },
      { capabilities: {} }
    );
    const unauthTransport = new StreamableHTTPClientTransport(new URL(serverUrl));

    await expect(unauthClient.connect(unauthTransport)).rejects.toThrow();
  });

  it('4. rejects invalid arguments with schema validation error', async () => {
    const result = await client.callTool({
      name: 'create_task',
      arguments: {
        title: '',
      },
    });

    expect(result.isError).toBe(true);
  });

  it('5. rejects invalid priority enum with schema validation error', async () => {
    const result = await client.callTool({
      name: 'create_task',
      arguments: {
        title: 'Valid title',
        priority: 'urgent_not_allowed',
      },
    });

    expect(result.isError).toBe(true);
  });
});
