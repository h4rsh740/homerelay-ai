import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createExecutionLog,
  createReminder,
  createTask,
  deleteReminder,
  deleteTask,
  getReminder,
  getTask,
  insertExecutionLog,
  listExecutionLogs,
  listReminders,
  listTasks,
  lookupDemoParcel,
  updateReminder,
  updateTask,
} from '@/lib/db/service';
import { DatabaseError, isDatabaseError } from '@/lib/db/errors';
import { databaseErrorResponse } from '@/lib/db/http';
import * as supabaseModule from '@/lib/db/supabase';

interface MockQueryBuilder {
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  then: (resolve: (value: { data: unknown; error: unknown }) => void) => Promise<void>;
}

// Helper to construct a mock Supabase query builder
function createMockQueryBuilder(config: {
  data?: unknown;
  error?: unknown;
}): MockQueryBuilder {
  const query: MockQueryBuilder = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: config.data ?? null,
      error: config.error ?? null,
    }),
    maybeSingle: vi.fn().mockResolvedValue({
      data: config.data ?? null,
      error: config.error ?? null,
    }),
    // Support awaiting the query directly (e.g. `const { data, error } = await query`)
    then: (resolve) => {
      return Promise.resolve({
        data: config.data ?? null,
        error: config.error ?? null,
      }).then(resolve);
    },
  };
  return query;
}

const mockAdminClient = {
  from: vi.fn(),
};

describe('database service - tasks', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(
      mockAdminClient as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>
    );
  });

  const validTaskId = '11111111-1111-4111-8111-111111111111';

  it('creates a task with valid inputs', async () => {
    const mockTask = {
      id: validTaskId,
      title: 'Buy groceries',
      description: 'Milk, eggs, bread',
      priority: 'high',
      status: 'pending',
      due_date: '2026-12-12T15:00:00Z',
      created_at: '2026-10-13T00:00:00Z',
      updated_at: '2026-10-13T00:00:00Z',
    };
    const qb = createMockQueryBuilder({ data: mockTask });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await createTask({
      title: 'Buy groceries',
      description: 'Milk, eggs, bread',
      priority: 'high',
      due_date: '2026-12-12T15:00:00Z',
    });

    expect(result).toEqual(mockTask);
    expect(mockAdminClient.from).toHaveBeenCalledWith('tasks');
    expect(qb.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Buy groceries',
        priority: 'high',
      })
    );
  });

  it('rejects invalid inputs on createTask', async () => {
    await expect(
      createTask({
        title: '',
        priority: 'high',
      })
    ).rejects.toThrowError(DatabaseError);

    await expect(
      createTask({
        title: 'Valid',
        priority: 'urgent' as never,
      })
    ).rejects.toThrowError(DatabaseError);
  });

  it('throws normalized error when createTask fails in Supabase', async () => {
    const qb = createMockQueryBuilder({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mockAdminClient.from.mockReturnValue(qb);

    await expect(
      createTask({
        title: 'Task title',
      })
    ).rejects.toThrowError(DatabaseError);
  });

  it('gets a task by UUID', async () => {
    const mockTask = {
      id: validTaskId,
      title: 'Clean room',
      priority: 'low',
      status: 'pending',
    };
    const qb = createMockQueryBuilder({ data: mockTask });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await getTask(validTaskId);
    expect(result).toEqual(mockTask);
    expect(qb.eq).toHaveBeenCalledWith('id', validTaskId);
  });

  it('rejects an invalid UUID format on getTask', async () => {
    await expect(getTask('not-a-uuid')).rejects.toThrowError(DatabaseError);
  });

  it('throws not_found DatabaseError when task does not exist', async () => {
    const qb = createMockQueryBuilder({ data: null });
    mockAdminClient.from.mockReturnValue(qb);

    try {
      await getTask(validTaskId);
      expect.unreachable('Should have thrown');
    } catch (err) {
      expect(isDatabaseError(err)).toBe(true);
      if (isDatabaseError(err)) {
        expect(err.code).toBe('not_found');
      }
    }
  });

  it('lists tasks with default and filtered options', async () => {
    const mockTasks = [{ id: validTaskId, title: 'Test 1' }];
    const qb = createMockQueryBuilder({ data: mockTasks });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await listTasks({ status: 'pending', limit: 10, offset: 0 });
    expect(result).toEqual(mockTasks);
    expect(qb.eq).toHaveBeenCalledWith('status', 'pending');
    expect(qb.range).toHaveBeenCalledWith(0, 9);
  });

  it('updates a task with valid fields', async () => {
    const mockUpdated = { id: validTaskId, title: 'Updated title' };
    const qb = createMockQueryBuilder({ data: mockUpdated });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await updateTask(validTaskId, { title: 'Updated title' });
    expect(result).toEqual(mockUpdated);
    expect(qb.update).toHaveBeenCalledWith({ title: 'Updated title' });
  });

  it('rejects empty update payloads on updateTask', async () => {
    await expect(updateTask(validTaskId, {})).rejects.toThrowError(
      /At least one task field is required/
    );
  });

  it('throws not_found when updating a nonexistent task', async () => {
    const qb = createMockQueryBuilder({ data: null });
    mockAdminClient.from.mockReturnValue(qb);

    await expect(updateTask(validTaskId, { title: 'New' })).rejects.toThrowError(
      DatabaseError
    );
  });

  it('deletes a task by UUID', async () => {
    const qb = createMockQueryBuilder({ data: { id: validTaskId } });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await deleteTask(validTaskId);
    expect(result).toEqual({ id: validTaskId });
    expect(qb.delete).toHaveBeenCalled();
  });

  it('throws not_found when deleting a nonexistent task', async () => {
    const qb = createMockQueryBuilder({ data: null });
    mockAdminClient.from.mockReturnValue(qb);

    await expect(deleteTask(validTaskId)).rejects.toThrowError(DatabaseError);
  });
});

describe('database service - reminders', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(
      mockAdminClient as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>
    );
  });

  const validReminderId = '22222222-2222-4222-8222-222222222222';

  it('creates a reminder with valid input', async () => {
    const mockReminder = {
      id: validReminderId,
      message: 'Take medicine',
      remind_at: '2026-12-12T15:00:00Z',
      is_sent: false,
    };
    const qb = createMockQueryBuilder({ data: mockReminder });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await createReminder({
      message: 'Take medicine',
      remind_at: '2026-12-12T15:00:00Z',
    });
    expect(result).toEqual(mockReminder);
    expect(mockAdminClient.from).toHaveBeenCalledWith('reminders');
  });

  it('rejects invalid inputs on createReminder', async () => {
    await expect(
      createReminder({
        message: '',
        remind_at: 'invalid-date',
      })
    ).rejects.toThrowError(DatabaseError);
  });

  it('gets a reminder by ID and handles not found', async () => {
    const mockReminder = { id: validReminderId, message: 'Test' };
    const qb = createMockQueryBuilder({ data: mockReminder });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await getReminder(validReminderId);
    expect(result).toEqual(mockReminder);

    const notFoundQb = createMockQueryBuilder({ data: null });
    mockAdminClient.from.mockReturnValue(notFoundQb);
    await expect(getReminder(validReminderId)).rejects.toThrowError(DatabaseError);
  });

  it('lists reminders with is_sent filtering', async () => {
    const mockList = [{ id: validReminderId, message: 'Test' }];
    const qb = createMockQueryBuilder({ data: mockList });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await listReminders({ is_sent: false });
    expect(result).toEqual(mockList);
    expect(qb.eq).toHaveBeenCalledWith('is_sent', false);
  });

  it('updates a reminder and rejects empty update', async () => {
    const mockUpdated = { id: validReminderId, is_sent: true };
    const qb = createMockQueryBuilder({ data: mockUpdated });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await updateReminder(validReminderId, { is_sent: true });
    expect(result).toEqual(mockUpdated);

    await expect(updateReminder(validReminderId, {})).rejects.toThrowError(
      /At least one reminder field is required/
    );
  });

  it('deletes a reminder', async () => {
    const qb = createMockQueryBuilder({ data: { id: validReminderId } });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await deleteReminder(validReminderId);
    expect(result).toEqual({ id: validReminderId });
  });
});

describe('database service - demo parcels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(
      mockAdminClient as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>
    );
  });

  it('looks up a demo parcel and ensures uppercase tracking number', async () => {
    const mockParcel = {
      id: '33333333-3333-4333-8333-333333333333',
      tracking_number: 'DEMO-TRK-001',
      carrier: 'SIMULATED',
      status: 'in_transit',
      simulated: true,
    };
    const qb = createMockQueryBuilder({ data: mockParcel });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await lookupDemoParcel('demo-trk-001');
    expect(result).toEqual(mockParcel);
    expect(qb.eq).toHaveBeenCalledWith('tracking_number', 'DEMO-TRK-001');
    expect(qb.eq).toHaveBeenCalledWith('simulated', true);
  });

  it('returns null when tracking number is not found', async () => {
    const qb = createMockQueryBuilder({ data: null });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await lookupDemoParcel('DEMO-TRK-999');
    expect(result).toBeNull();
  });

  it('rejects empty tracking number', async () => {
    await expect(lookupDemoParcel('   ')).rejects.toThrowError(DatabaseError);
  });
});

describe('database service - execution logs', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseModule, 'getSupabaseAdmin').mockReturnValue(
      mockAdminClient as unknown as ReturnType<typeof supabaseModule.getSupabaseAdmin>
    );
  });

  const validSessionId = '44444444-4444-4444-8444-444444444444';

  it('inserts an execution log and supports createExecutionLog alias', async () => {
    const mockLog = {
      id: '55555555-5555-4555-8555-555555555555',
      session_id: validSessionId,
      prompt: 'Check tasks',
      plan_json: { steps: [] },
      step_index: 0,
      tool_name: 'list_tasks',
      tool_input: {},
      status: 'success',
    };
    const qb = createMockQueryBuilder({ data: mockLog });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await insertExecutionLog({
      session_id: validSessionId,
      prompt: 'Check tasks',
      plan_json: { steps: [] },
      step_index: 0,
      tool_name: 'list_tasks',
      tool_input: {},
      status: 'success',
    });

    expect(result).toEqual(mockLog);
    expect(mockAdminClient.from).toHaveBeenCalledWith('execution_logs');

    // Also verify createExecutionLog alias
    const aliasResult = await createExecutionLog({
      session_id: validSessionId,
      prompt: 'Check tasks',
      plan_json: { steps: [] },
      step_index: 0,
      tool_name: 'list_tasks',
      tool_input: {},
      status: 'success',
    });
    expect(aliasResult).toEqual(mockLog);
  });

  it('lists execution logs filtered by session_id and status', async () => {
    const mockLogs = [{ id: '1', prompt: 'test' }];
    const qb = createMockQueryBuilder({ data: mockLogs });
    mockAdminClient.from.mockReturnValue(qb);

    const result = await listExecutionLogs({
      session_id: validSessionId,
      status: 'error',
    });

    expect(result).toEqual(mockLogs);
    expect(qb.eq).toHaveBeenCalledWith('session_id', validSessionId);
    expect(qb.eq).toHaveBeenCalledWith('status', 'error');
  });
});

describe('HTTP response mapper', () => {
  it('maps database error codes to appropriate HTTP statuses', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const notFoundError = new DatabaseError('not_found', 'Not found', { operation: 'get' });
    const validationError = new DatabaseError('validation', 'Invalid input', { operation: 'create' });
    const conflictError = new DatabaseError('conflict', 'Conflict', { operation: 'insert' });
    const configError = new DatabaseError('configuration', 'Unconfigured', { operation: 'init' });
    const queryError = new DatabaseError('query_failed', 'Failed', { operation: 'select' });
    const genericError = new Error('Unknown crash');

    const resNotFound = databaseErrorResponse(notFoundError);
    expect(resNotFound.status).toBe(404);

    const resValidation = databaseErrorResponse(validationError);
    expect(resValidation.status).toBe(422);

    const resConflict = databaseErrorResponse(conflictError);
    expect(resConflict.status).toBe(409);

    const resConfig = databaseErrorResponse(configError);
    expect(resConfig.status).toBe(503);

    const resQuery = databaseErrorResponse(queryError);
    expect(resQuery.status).toBe(500);

    const resGeneric = databaseErrorResponse(genericError);
    expect(resGeneric.status).toBe(500);

    consoleSpy.mockRestore();
  });
});

describe('supabase configuration module', () => {
  it('detects valid configuration and returns admin client', () => {
    expect(supabaseModule.isSupabaseConfigured).toBe(true);
    expect(() => supabaseModule.getSupabaseAdmin()).not.toThrow();
  });
});
