import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpHttpServer } from '@/src/mcp-server/index';
import { getMcpDbClient } from '@/src/mcp-server/db';
import { callMCPTool, listMCPTools } from '@/lib/mcp/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseToolCallResult(result: unknown): any {
  const r = result as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  return JSON.parse(r.content?.[0]?.text ?? '{}');
}

describe('Phase 3: MCP Server Streamable HTTP & Tools Integration', () => {
  const secret = 'test-mcp-full-secret';
  let httpServer: Server;
  let serverUrl: string;
  let client: Client;
  let transport: StreamableHTTPClientTransport;

  beforeAll(async () => {
    // Start MCP server in default ('all') mode with authentication
    httpServer = createMcpHttpServer({
      toolsMode: 'all',
      secret,
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });

    const port = (httpServer.address() as AddressInfo).port;
    serverUrl = `http://localhost:${port}/mcp`;

    // Configure env for lib/mcp/client calls
    process.env.MCP_SERVER_URL = serverUrl;
    process.env.MCP_SERVER_SECRET = secret;

    // Connect official MCP Client using Streamable HTTP transport
    client = new Client(
      { name: 'phase3-integration-client', version: '1.0.0' },
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

    // Ensure demo parcel DEMO-TRK-001 is seeded
    const db = getMcpDbClient();
    await db.from('demo_parcels').upsert(
      {
        tracking_number: 'DEMO-TRK-001',
        carrier: 'SIMULATED',
        status: 'in_transit',
        description: 'Kitchen blender',
        estimated_delivery: '2026-10-25T10:00:00Z',
        simulated: true,
      },
      { onConflict: 'tracking_number' }
    );
  });

  afterAll(async () => {
    try {
      await client.close();
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  // ─── 1. Tool Discovery ──────────────────────────────────────────────────────

  describe('1. Tool Discovery (tools/list)', () => {
    it('discovers all required Phase 3 tools via official MCP client', async () => {
      const response = await client.listTools();
      const toolNames = response.tools.map((t) => t.name);

      const requiredTools = [
        'create_task',
        'list_tasks',
        'complete_task',
        'schedule_reminder',
        'list_reminders',
        'get_parcel_status',
      ];

      for (const required of requiredTools) {
        expect(toolNames).toContain(required);
      }
    });

    it('each required tool has a validated Zod inputSchema', async () => {
      const response = await client.listTools();
      const toolMap = new Map(response.tools.map((t) => [t.name, t]));

      // create_task schema
      const createTask = toolMap.get('create_task')!;
      expect(createTask.inputSchema.properties).toHaveProperty('title');
      expect(createTask.inputSchema.properties).toHaveProperty('priority');

      // list_tasks schema
      const listTasks = toolMap.get('list_tasks')!;
      expect(listTasks.inputSchema.properties).toHaveProperty('status');

      // complete_task schema
      const completeTask = toolMap.get('complete_task')!;
      expect(completeTask.inputSchema.properties).toHaveProperty('id');

      // schedule_reminder schema
      const scheduleReminder = toolMap.get('schedule_reminder')!;
      expect(scheduleReminder.inputSchema.properties).toHaveProperty('message');
      expect(scheduleReminder.inputSchema.properties).toHaveProperty('remind_at');

      // list_reminders schema
      const listReminders = toolMap.get('list_reminders')!;
      expect(listReminders.inputSchema.properties).toHaveProperty('is_sent');

      // get_parcel_status schema
      const getParcelStatus = toolMap.get('get_parcel_status')!;
      expect(getParcelStatus.inputSchema.properties).toHaveProperty('tracking_number');
    });
  });

  // ─── 2. Tool Execution & Database Persistence ──────────────────────────────

  describe('2. Tool Execution (tools/call) & Database Persistence', () => {
    let createdTaskId: string;
    let createdReminderId: string;

    it('create_task persists record to database and returns structured result', async () => {
      const title = `Phase 3 Task ${Date.now()}`;
      const result = await client.callTool({
        name: 'create_task',
        arguments: {
          title,
          description: 'Created during Phase 3 verification',
          priority: 'high',
          due_date: '2026-10-20T10:00:00Z',
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = parseToolCallResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.task.title).toBe(title);
      expect(parsed.task.priority).toBe('high');
      expect(parsed.task.status).toBe('pending');
      createdTaskId = parsed.task.id;

      // Direct database verification
      const db = getMcpDbClient();
      const { data: dbRow, error } = await db
        .from('tasks')
        .select('*')
        .eq('id', createdTaskId)
        .single();

      expect(error).toBeNull();
      expect(dbRow).toBeDefined();
      expect(dbRow!.id).toBe(createdTaskId);
      expect(dbRow!.title).toBe(title);
      expect(dbRow!.priority).toBe('high');
    });

    it('list_tasks returns persistent tasks filtered by status', async () => {
      const result = await client.callTool({
        name: 'list_tasks',
        arguments: {
          status: 'pending',
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = parseToolCallResult(result);
      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.tasks)).toBe(true);
      expect(parsed.count).toBeGreaterThanOrEqual(1);

      // Verify created task is in the list
      const found = parsed.tasks.some((t: { id: string }) => t.id === createdTaskId);
      expect(found).toBe(true);
    });

    it('complete_task updates status in database and returns structured result', async () => {
      const result = await client.callTool({
        name: 'complete_task',
        arguments: {
          id: createdTaskId,
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = parseToolCallResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.task.id).toBe(createdTaskId);
      expect(parsed.task.status).toBe('completed');

      // Direct database verification
      const db = getMcpDbClient();
      const { data: dbRow, error } = await db
        .from('tasks')
        .select('*')
        .eq('id', createdTaskId)
        .single();

      expect(error).toBeNull();
      expect(dbRow!.status).toBe('completed');
    });

    it('complete_task handles missing/invalid task honestly without spoofing success', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000000';
      const result = await client.callTool({
        name: 'complete_task',
        arguments: {
          id: fakeUuid,
        },
      });

      // Should indicate error or not found, NEVER success
      if (result.isError) {
        expect(result.isError).toBe(true);
      } else {
        const parsed = parseToolCallResult(result);
        expect(parsed.success).toBeFalsy();
      }
    });

    it('schedule_reminder persists record to database and returns structured result', async () => {
      const message = `Phase 3 Reminder ${Date.now()}`;
      const remindAt = '2026-10-25T14:30:00Z';

      const result = await client.callTool({
        name: 'schedule_reminder',
        arguments: {
          message,
          remind_at: remindAt,
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = parseToolCallResult(result);
      expect(parsed.success).toBe(true);
      expect(parsed.reminder.message).toBe(message);
      expect(new Date(parsed.reminder.remind_at).toISOString()).toBe(new Date(remindAt).toISOString());
      createdReminderId = parsed.reminder.id;

      // Direct database verification
      const db = getMcpDbClient();
      const { data: dbRow, error } = await db
        .from('reminders')
        .select('*')
        .eq('id', createdReminderId)
        .single();

      expect(error).toBeNull();
      expect(dbRow).toBeDefined();
      expect(dbRow!.id).toBe(createdReminderId);
      expect(dbRow!.message).toBe(message);
      expect(dbRow!.is_sent).toBe(false);
    });

    it('list_reminders returns upcoming reminders from database', async () => {
      const result = await client.callTool({
        name: 'list_reminders',
        arguments: {
          is_sent: false,
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = parseToolCallResult(result);
      expect(parsed.success).toBe(true);
      expect(Array.isArray(parsed.reminders)).toBe(true);
      expect(parsed.count).toBeGreaterThanOrEqual(1);

      const found = parsed.reminders.some((r: { id: string }) => r.id === createdReminderId);
      expect(found).toBe(true);
    });

    it('get_parcel_status retrieves simulated parcel details from database', async () => {
      const result = await client.callTool({
        name: 'get_parcel_status',
        arguments: {
          tracking_number: 'DEMO-TRK-001',
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = parseToolCallResult(result);
      expect(parsed.simulated).toBe(true);
      expect(parsed.warning).toContain('[SIMULATED DATA]');
      expect(parsed.parcel).toBeDefined();
      expect(parsed.parcel.tracking_number).toBe('DEMO-TRK-001');
      expect(parsed.parcel.carrier).toBeDefined();
      expect(parsed.status).toBe('in_transit');
    });

    it('get_parcel_status handles unknown tracking number with simulated not found', async () => {
      const result = await client.callTool({
        name: 'get_parcel_status',
        arguments: {
          tracking_number: 'UNKNOWN-PARCEL-999',
        },
      });

      expect(result.isError).toBeFalsy();
      const parsed = parseToolCallResult(result);
      expect(parsed.simulated).toBe(true);
      expect(parsed.status).toBeNull();
      expect(parsed.warning).toContain('No parcel found');
    });
  });

  // ─── 3. Backend Validation & Security ──────────────────────────────────────

  describe('3. Validation & Honest Error Handling', () => {
    it('prevents bypassing backend validation with invalid argument types', async () => {
      // Missing title
      const result = await client.callTool({
        name: 'create_task',
        arguments: {
          description: 'No title provided',
        },
      });

      expect(result.isError).toBe(true);
    });

    it('rejects invalid UUID format for complete_task', async () => {
      const result = await client.callTool({
        name: 'complete_task',
        arguments: {
          id: 'not-a-valid-uuid',
        },
      });

      expect(result.isError).toBe(true);
    });

    it('rejects invalid ISO timestamp format for schedule_reminder', async () => {
      const result = await client.callTool({
        name: 'schedule_reminder',
        arguments: {
          message: 'Meeting',
          remind_at: 'tomorrow at 3pm', // Not ISO 8601
        },
      });

      expect(result.isError).toBe(true);
    });
  });

  // ─── 4. Stateless Direct JSON-RPC Client Interoperability ──────────────────

  describe('4. Stateless JSON-RPC Client Interoperability (lib/mcp/client)', () => {
    it('listMCPTools discovers tools over direct Streamable HTTP POST', async () => {
      const tools = await listMCPTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThanOrEqual(6);

      const names = tools.map((t) => t.name);
      expect(names).toContain('create_task');
      expect(names).toContain('complete_task');
      expect(names).toContain('schedule_reminder');
      expect(names).toContain('get_parcel_status');
    });

    it('callMCPTool executes a tool over direct Streamable HTTP POST', async () => {
      const result = await callMCPTool('create_task', {
        title: 'Stateless Client Task',
        priority: 'low',
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text as string);
      expect(parsed.success).toBe(true);
      expect(parsed.task.title).toBe('Stateless Client Task');
    });
  });
});
