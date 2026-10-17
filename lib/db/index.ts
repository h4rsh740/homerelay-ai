import 'server-only';

export {
  createExecutionLog,
  createReminder,
  createTask,
  deleteReminder,
  deleteTask,
  findDemoParcel,
  getDemoParcel,
  getReminder,
  getTask,
  insertExecutionLog,
  listExecutionLogs,
  listReminders,
  listTasks,
  lookupDemoParcel,
  updateReminder,
  updateTask,
} from './service';
export type {
  ListExecutionLogsOptions,
  ListRemindersOptions,
  ListTasksOptions,
} from './service';
export { getDatabaseClient, getSupabaseAdmin, isSupabaseConfigured, supabaseAdmin } from './supabase';
export { getPGlite, pgliteClient } from './pglite';
export {
  DatabaseError,
  isDatabaseError,
  normalizeSupabaseError,
} from './errors';
export type { DatabaseErrorCode, DatabaseErrorOptions } from './errors';
export type {
  Database,
  DemoParcel,
  DemoParcelInsert,
  DemoParcelUpdate,
  ExecutionLog,
  ExecutionLogInsert,
  ExecutionLogUpdate,
  ExecutionStatus,
  JsonObject,
  JsonValue,
  Reminder,
  ReminderInsert,
  ReminderUpdate,
  Task,
  TaskInsert,
  TaskPriority,
  TaskStatus,
  TaskUpdate,
} from './types';
export type {
  CreateExecutionLogInput,
  ListExecutionLogsInput,
  ListRemindersInput,
  ListTasksInput,
} from './validators';
