import 'server-only';

import { z } from 'zod';
import { getSupabaseAdmin } from './supabase';
import {
  DatabaseError,
  normalizeSupabaseError,
  validationDatabaseError,
} from './errors';
import type {
  CreateReminder as CreateReminderInput,
  UpdateReminder as UpdateReminderInput,
  UpdateTask as UpdateTaskInput,
} from '@/lib/validators/schemas';
import type {
  DemoParcel,
  ExecutionLog,
  ExecutionLogInsert,
  Reminder,
  Task,
} from './types';
import type { CreateExecutionLogInput } from './validators';
import {
  CreateExecutionLogSchema,
  CreateReminderSchema,
  CreateTaskSchema,
  DemoParcelLookupSchema,
  ListExecutionLogsSchema,
  ListRemindersSchema,
  ListTasksSchema,
  TaskIdSchema,
  UpdateReminderSchema,
  UpdateTaskSchema,
  ReminderIdSchema,
} from './validators';

type ListTasksOptions = z.input<typeof ListTasksSchema>;
type ListRemindersOptions = z.input<typeof ListRemindersSchema>;
type ListExecutionLogsOptions = z.input<typeof ListExecutionLogsSchema>;
type CreateTaskInput = z.input<typeof CreateTaskSchema>;

function validate<T>(schema: z.ZodType<T>, input: unknown, operation: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw validationDatabaseError(operation, parsed.error);
  return parsed.data;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function requireRow<T>(row: T | null, operation: string): T {
  if (row) return row;
  throw new DatabaseError('query_failed', `Database ${operation} returned no row.`, {
    operation,
  });
}

function notFound(operation: string): never {
  throw new DatabaseError('not_found', `${operation} was not found.`, { operation });
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  const values = validate(CreateTaskSchema, input, 'create task');
  const { data, error } = await getSupabaseAdmin()
    .from('tasks')
    .insert(withoutUndefined(values))
    .select('*')
    .single();

  if (error) throw normalizeSupabaseError(error, 'create task');
  return requireRow(data, 'create task') as Task;
}

export async function getTask(id: string): Promise<Task> {
  const taskId = validate(TaskIdSchema, id, 'get task');
  const { data, error } = await getSupabaseAdmin()
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error) throw normalizeSupabaseError(error, 'get task');
  if (!data) notFound(`Task ${taskId}`);
  return data as Task;
}

export async function listTasks(options: ListTasksOptions = {}): Promise<Task[]> {
  const values = validate(ListTasksSchema, options, 'list tasks');
  let query = getSupabaseAdmin()
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .range(values.offset, values.offset + values.limit - 1);

  if (values.status) query = query.eq('status', values.status);

  const { data, error } = await query;
  if (error) throw normalizeSupabaseError(error, 'list tasks');
  return (data ?? []) as Task[];
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  const taskId = validate(TaskIdSchema, id, 'update task');
  const values = validate(UpdateTaskSchema, input, 'update task');
  const updates = withoutUndefined(values);
  if (Object.keys(updates).length === 0) {
    throw new DatabaseError('validation', 'At least one task field is required.', {
      operation: 'update task',
    });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('tasks')
    .update(updates)
    .eq('id', taskId)
    .select('*')
    .maybeSingle();

  if (error) throw normalizeSupabaseError(error, 'update task');
  if (!data) notFound(`Task ${taskId}`);
  return data as Task;
}

export async function deleteTask(id: string): Promise<{ id: string }> {
  const taskId = validate(TaskIdSchema, id, 'delete task');
  const { data, error } = await getSupabaseAdmin()
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .select('id')
    .maybeSingle();

  if (error) throw normalizeSupabaseError(error, 'delete task');
  if (!data) notFound(`Task ${taskId}`);
  return { id: taskId };
}

export async function createReminder(input: CreateReminderInput): Promise<Reminder> {
  const values = validate(CreateReminderSchema, input, 'create reminder');
  const { data, error } = await getSupabaseAdmin()
    .from('reminders')
    .insert(withoutUndefined(values))
    .select('*')
    .single();

  if (error) throw normalizeSupabaseError(error, 'create reminder');
  return requireRow(data, 'create reminder') as Reminder;
}

export async function getReminder(id: string): Promise<Reminder> {
  const reminderId = validate(ReminderIdSchema, id, 'get reminder');
  const { data, error } = await getSupabaseAdmin()
    .from('reminders')
    .select('*')
    .eq('id', reminderId)
    .maybeSingle();

  if (error) throw normalizeSupabaseError(error, 'get reminder');
  if (!data) notFound(`Reminder ${reminderId}`);
  return data as Reminder;
}

export async function listReminders(
  options: ListRemindersOptions = {}
): Promise<Reminder[]> {
  const values = validate(ListRemindersSchema, options, 'list reminders');
  let query = getSupabaseAdmin()
    .from('reminders')
    .select('*')
    .order('remind_at', { ascending: true })
    .range(values.offset, values.offset + values.limit - 1);

  if (values.is_sent !== undefined) query = query.eq('is_sent', values.is_sent);

  const { data, error } = await query;
  if (error) throw normalizeSupabaseError(error, 'list reminders');
  return (data ?? []) as Reminder[];
}

export async function updateReminder(
  id: string,
  input: UpdateReminderInput
): Promise<Reminder> {
  const reminderId = validate(ReminderIdSchema, id, 'update reminder');
  const values = validate(UpdateReminderSchema, input, 'update reminder');
  const updates = withoutUndefined(values);
  if (Object.keys(updates).length === 0) {
    throw new DatabaseError('validation', 'At least one reminder field is required.', {
      operation: 'update reminder',
    });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('reminders')
    .update(updates)
    .eq('id', reminderId)
    .select('*')
    .maybeSingle();

  if (error) throw normalizeSupabaseError(error, 'update reminder');
  if (!data) notFound(`Reminder ${reminderId}`);
  return data as Reminder;
}

export async function deleteReminder(id: string): Promise<{ id: string }> {
  const reminderId = validate(ReminderIdSchema, id, 'delete reminder');
  const { data, error } = await getSupabaseAdmin()
    .from('reminders')
    .delete()
    .eq('id', reminderId)
    .select('id')
    .maybeSingle();

  if (error) throw normalizeSupabaseError(error, 'delete reminder');
  if (!data) notFound(`Reminder ${reminderId}`);
  return { id: reminderId };
}

/**
 * Look up only explicitly simulated parcel records.  A missing tracking
 * number is a normal lookup miss and returns null; provider/query failures
 * still surface as DatabaseError.
 */
export async function lookupDemoParcel(
  trackingNumber: string
): Promise<DemoParcel | null> {
  const normalizedTrackingNumber = validate(
    DemoParcelLookupSchema,
    trackingNumber,
    'lookup demo parcel'
  );
  const { data, error } = await getSupabaseAdmin()
    .from('demo_parcels')
    .select('*')
    .eq('tracking_number', normalizedTrackingNumber)
    .eq('simulated', true)
    .maybeSingle();

  if (error) throw normalizeSupabaseError(error, 'lookup demo parcel');
  return (data ?? null) as DemoParcel | null;
}

export const findDemoParcel = lookupDemoParcel;
export const getDemoParcel = lookupDemoParcel;

export async function insertExecutionLog(
  input: CreateExecutionLogInput
): Promise<ExecutionLog> {
  const values = validate(CreateExecutionLogSchema, input, 'insert execution log');
  const insertValues = withoutUndefined(values) as unknown as ExecutionLogInsert &
    Record<string, unknown>;
  const { data, error } = await getSupabaseAdmin()
    .from('execution_logs')
    .insert(insertValues)
    .select('*')
    .single();

  if (error) throw normalizeSupabaseError(error, 'insert execution log');
  return requireRow(data, 'insert execution log') as ExecutionLog;
}

export const createExecutionLog = insertExecutionLog;

export async function listExecutionLogs(
  options: ListExecutionLogsOptions = {}
): Promise<ExecutionLog[]> {
  const values = validate(ListExecutionLogsSchema, options, 'list execution logs');
  let query = getSupabaseAdmin()
    .from('execution_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .range(values.offset, values.offset + values.limit - 1);

  if (values.session_id) query = query.eq('session_id', values.session_id);
  if (values.status) query = query.eq('status', values.status);

  const { data, error } = await query;
  if (error) throw normalizeSupabaseError(error, 'list execution logs');
  return (data ?? []) as ExecutionLog[];
}

export type {
  ListExecutionLogsOptions,
  ListRemindersOptions,
  ListTasksOptions,
};
