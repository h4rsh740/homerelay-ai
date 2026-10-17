import { z } from 'zod';
import {
  CreateReminderSchema,
  CreateTaskSchema,
  ExecutionStatusSchema,
  ISODateSchema,
  TaskStatusSchema,
  UpdateReminderSchema,
  UpdateTaskSchema,
  UUIDSchema,
} from '@/lib/validators/schemas';

export const TaskIdSchema = UUIDSchema;
export const ReminderIdSchema = UUIDSchema;
export const ExecutionSessionIdSchema = UUIDSchema;

export const ListTasksSchema = z.object({
  status: TaskStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const ListRemindersSchema = z.object({
  is_sent: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).default(0),
});

export const DemoParcelLookupSchema = z
  .string()
  .trim()
  .min(1, 'Tracking number is required')
  .max(100)
  .transform((trackingNumber) => trackingNumber.toUpperCase());

export const CreateExecutionLogSchema = z.object({
  session_id: ExecutionSessionIdSchema,
  prompt: z.string().min(1),
  plan_json: z.record(z.string(), z.unknown()),
  step_index: z.number().int().nonnegative(),
  tool_name: z.string().min(1).max(200),
  tool_input: z.record(z.string(), z.unknown()),
  tool_output: z.record(z.string(), z.unknown()).nullable().optional(),
  status: ExecutionStatusSchema.default('pending'),
  error_message: z.string().max(4000).nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
});

export const ListExecutionLogsSchema = z.object({
  session_id: ExecutionSessionIdSchema.optional(),
  status: ExecutionStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).default(0),
});

export {
  CreateReminderSchema,
  CreateTaskSchema,
  ISODateSchema,
  TaskStatusSchema,
  UpdateReminderSchema,
  UpdateTaskSchema,
  UUIDSchema,
};

export type CreateExecutionLogInput = z.input<typeof CreateExecutionLogSchema>;
export type ListExecutionLogsInput = z.input<typeof ListExecutionLogsSchema>;
export type ListRemindersInput = z.input<typeof ListRemindersSchema>;
export type ListTasksInput = z.input<typeof ListTasksSchema>;
