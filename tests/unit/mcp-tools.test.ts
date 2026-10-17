import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { taskTools } from '@/src/mcp-server/tools/tasks';
import { reminderTools } from '@/src/mcp-server/tools/reminders';
import { parcelTools } from '@/src/mcp-server/tools/parcels';
import { summaryTools } from '@/src/mcp-server/tools/summary';

// Mock Supabase client
const mockFrom = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

describe('MCP Tools Registration and Handlers', () => {
  let server: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://mock.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-service-key');

    server = new McpServer({
      name: 'homerelay-test',
      version: '1.0.0',
    });

    taskTools(server);
    reminderTools(server);
    parcelTools(server);
    summaryTools(server);
  });

  const getToolHandler = (name: string) => {
    const registered = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> })._registeredTools;
    const tool = registered[name];
    if (!tool) throw new Error(`Tool ${name} not found`);
    return tool.handler;
  };

  it('registers all 9 core MCP tools', () => {
    const registered = (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools;
    const expectedTools = [
      'create_task',
      'list_tasks',
      'complete_task',
      'update_task',
      'delete_task',
      'schedule_reminder',
      'create_reminder',
      'list_reminders',
      'delete_reminder',
      'get_parcel_status',
      'lookup_parcel',
      'get_household_summary',
    ];

    for (const toolName of expectedTools) {
      expect(registered[toolName]).toBeDefined();
    }
  });

  describe('taskTools', () => {
    it('create_task inserts task and returns success response', async () => {
      const mockTask = {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Water plants',
        priority: 'low',
        status: 'pending',
      };

      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockTask, error: null }),
          }),
        }),
      });

      const handler = getToolHandler('create_task');
      const result = await handler({
        title: 'Water plants',
        priority: 'low',
      }) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.task.title).toBe('Water plants');
    });

    it('create_task returns error on database failure', async () => {
      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert failed' } }),
          }),
        }),
      });

      const handler = getToolHandler('create_task');
      const result = await handler({
        title: 'Water plants',
      }) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Insert failed');
    });

    it('list_tasks retrieves task list', async () => {
      const mockTasks = [
        { id: '1', title: 'Task 1', status: 'pending' },
        { id: '2', title: 'Task 2', status: 'completed' },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockTasks, error: null }),
          }),
        }),
      });

      const handler = getToolHandler('list_tasks');
      const result = await handler({}) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
    });

    it('list_tasks returns error on database failure', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'Select error' } }),
          }),
        }),
      });

      const handler = getToolHandler('list_tasks');
      const result = await handler({}) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Select error');
    });

    it('update_task updates task fields successfully', async () => {
      const mockUpdated = { id: '11111111-1111-1111-1111-111111111111', title: 'New title' };
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockUpdated, error: null }),
            }),
          }),
        }),
      });

      const handler = getToolHandler('update_task');
      const result = await handler({
        id: '11111111-1111-1111-1111-111111111111',
        title: 'New title',
      }) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.task.title).toBe('New title');
    });

    it('update_task rejects empty updates', async () => {
      const handler = getToolHandler('update_task');
      const result = await handler({
        id: '11111111-1111-1111-1111-111111111111',
      }) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('No fields to update');
    });

    it('update_task handles database error', async () => {
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Update failed' } }),
            }),
          }),
        }),
      });

      const handler = getToolHandler('update_task');
      const result = await handler({
        id: '11111111-1111-1111-1111-111111111111',
        title: 'New title',
      }) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Update failed');
    });

    it('delete_task deletes specified task by ID', async () => {
      mockFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const handler = getToolHandler('delete_task');
      const result = await handler({
        id: '11111111-1111-1111-1111-111111111111',
      }) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('delete_task returns error on database failure', async () => {
      mockFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'Delete error' } }),
        }),
      });

      const handler = getToolHandler('delete_task');
      const result = await handler({
        id: '11111111-1111-1111-1111-111111111111',
      }) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Delete error');
    });

    it('complete_task updates task status to completed', async () => {
      const mockCompleted = {
        id: '11111111-1111-1111-1111-111111111111',
        title: 'Water plants',
        status: 'completed',
      };
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: mockCompleted, error: null }),
            }),
          }),
        }),
      });

      const handler = getToolHandler('complete_task');
      const result = await handler({
        id: '11111111-1111-1111-1111-111111111111',
      }) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.task.status).toBe('completed');
    });

    it('complete_task returns error on database failure', async () => {
      mockFrom.mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB update error' } }),
            }),
          }),
        }),
      });

      const handler = getToolHandler('complete_task');
      const result = await handler({
        id: '11111111-1111-1111-1111-111111111111',
      }) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('DB update error');
    });
  });

  describe('reminderTools', () => {
    it('create_reminder schedules a reminder', async () => {
      const mockReminder = {
        id: '22222222-2222-2222-2222-222222222222',
        message: 'Take medicine',
        remind_at: '2026-10-12T18:00:00Z',
      };

      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockReminder, error: null }),
          }),
        }),
      });

      const handler = getToolHandler('create_reminder');
      const result = await handler({
        message: 'Take medicine',
        remind_at: '2026-10-12T18:00:00Z',
      }) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.reminder.message).toBe('Take medicine');
    });

    it('schedule_reminder schedules a reminder', async () => {
      const mockReminder = {
        id: '22222222-2222-2222-2222-222222222222',
        message: 'Take medicine',
        remind_at: '2026-10-12T18:00:00Z',
      };

      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockReminder, error: null }),
          }),
        }),
      });

      const handler = getToolHandler('schedule_reminder');
      const result = await handler({
        message: 'Take medicine',
        remind_at: '2026-10-12T18:00:00Z',
      }) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.reminder.message).toBe('Take medicine');
    });

    it('create_reminder returns error on database failure', async () => {
      mockFrom.mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Insert reminder failed' } }),
          }),
        }),
      });

      const handler = getToolHandler('create_reminder');
      const result = await handler({
        message: 'Take medicine',
        remind_at: '2026-10-12T18:00:00Z',
      }) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Insert reminder failed');
    });

    it('list_reminders fetches reminders list', async () => {
      const mockReminders = [
        { id: '1', message: 'Take out trash', remind_at: '2026-10-12T20:00:00Z' },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: mockReminders, error: null }),
          }),
        }),
      });

      const handler = getToolHandler('list_reminders');
      const result = await handler({}) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(1);
    });

    it('list_reminders returns error on database failure', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: null, error: { message: 'List reminder failed' } }),
          }),
        }),
      });

      const handler = getToolHandler('list_reminders');
      const result = await handler({}) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('List reminder failed');
    });

    it('delete_reminder removes a reminder by ID', async () => {
      mockFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const handler = getToolHandler('delete_reminder');
      const result = await handler({
        id: '22222222-2222-2222-2222-222222222222',
      }) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('delete_reminder returns error on database failure', async () => {
      mockFrom.mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'Delete reminder failed' } }),
        }),
      });

      const handler = getToolHandler('delete_reminder');
      const result = await handler({
        id: '22222222-2222-2222-2222-222222222222',
      }) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Delete reminder failed');
    });
  });

  describe('parcelTools', () => {
    it('lookup_parcel returns simulated package status with clear disclaimer', async () => {
      const mockParcel = {
        tracking_number: 'DEMO-TRK-001',
        carrier: 'Amazon Logistics',
        status: 'out_for_delivery',
        description: 'Kitchen Blender',
        estimated_delivery: '2026-10-12T17:00:00Z',
        last_updated: '2026-10-12T12:00:00Z',
      };

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockParcel, error: null }),
          }),
        }),
      });

      const handler = getToolHandler('lookup_parcel');
      const result = await handler({ tracking_number: 'DEMO-TRK-001' }) as {
        content: [{ type: string; text: string }];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.simulated).toBe(true);
      expect(parsed.warning).toContain('[SIMULATED DATA]');
      expect(parsed.parcel.status).toBe('out_for_delivery');
    });

    it('get_parcel_status returns simulated package status with clear disclaimer', async () => {
      const mockParcel = {
        tracking_number: 'DEMO-TRK-001',
        carrier: 'Amazon Logistics',
        status: 'out_for_delivery',
        description: 'Kitchen Blender',
        estimated_delivery: '2026-10-12T17:00:00Z',
        last_updated: '2026-10-12T12:00:00Z',
      };

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockParcel, error: null }),
          }),
        }),
      });

      const handler = getToolHandler('get_parcel_status');
      const result = await handler({ tracking_number: 'DEMO-TRK-001' }) as {
        content: [{ type: string; text: string }];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.simulated).toBe(true);
      expect(parsed.warning).toContain('[SIMULATED DATA]');
      expect(parsed.parcel.status).toBe('out_for_delivery');
    });

    it('lookup_parcel returns not found simulation message if tracking number missing', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      });

      const handler = getToolHandler('lookup_parcel');
      const result = await handler({ tracking_number: 'UNKNOWN-123' }) as {
        content: [{ type: string; text: string }];
      };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.simulated).toBe(true);
      expect(parsed.status).toBeNull();
    });
  });

  describe('summaryTools', () => {
    it('get_household_summary aggregates status across tables', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'tasks') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: '1', title: 'Task 1', status: 'pending', priority: 'high', due_date: null }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'reminders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: '1', message: 'Pay rent', remind_at: '2026-10-12T18:00:00Z', is_sent: false }],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'execution_logs') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ session_id: 's-1', prompt: 'test', tool_name: 'create_task', status: 'success', created_at: '2026-10-12T12:00:00Z' }],
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      });

      const handler = getToolHandler('get_household_summary');
      const result = await handler({}) as { content: [{ type: string; text: string }] };

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.household_summary.active_tasks.count).toBe(1);
      expect(parsed.household_summary.upcoming_reminders.count).toBe(1);
      expect(parsed.household_summary.recent_executions.count).toBe(1);
    });

    it('get_household_summary handles database errors gracefully', async () => {
      const chain = {
        in: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database unreachable' },
        }),
      };

      mockFrom.mockImplementation(() => ({
        select: vi.fn().mockReturnValue(chain),
      }));

      const handler = getToolHandler('get_household_summary');
      const result = await handler({}) as { content: [{ type: string; text: string }]; isError?: boolean };

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Database unreachable');
    });
  });
});
