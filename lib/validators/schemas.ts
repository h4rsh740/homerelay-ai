import { z } from 'zod';

// ─── Shared primitives ────────────────────────────────────────────────────────

export const UUIDSchema = z.string().uuid();
// Accept both UTC (Z) and offset (+HH:MM) ISO 8601 datetime strings
export const ISODateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
  'Invalid ISO 8601 datetime'
);

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high']);
export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'completed', 'cancelled']);

export const TaskSchema = z.object({
  id: UUIDSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
  due_date: ISODateSchema.nullable().optional(),
  created_at: ISODateSchema,
  updated_at: ISODateSchema,
});

export const CreateTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  priority: TaskPrioritySchema.default('medium'),
  due_date: ISODateSchema.optional(),
});

/**
 * The insert shape used by the repeatable demo seed. Seed rows carry stable
 * IDs so rerunning the seed updates the same records instead of duplicating
 * them.
 */
export const TaskSeedSchema = CreateTaskSchema.extend({
  id: UUIDSchema,
  status: TaskStatusSchema.default('pending'),
});

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  priority: TaskPrioritySchema.optional(),
  status: TaskStatusSchema.optional(),
  due_date: ISODateSchema.nullable().optional(),
});

export type Task = z.infer<typeof TaskSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type TaskSeed = z.infer<typeof TaskSeedSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;

// ─── Reminders ───────────────────────────────────────────────────────────────

export const ReminderSchema = z.object({
  id: UUIDSchema,
  message: z.string().min(1).max(500),
  remind_at: ISODateSchema,
  is_sent: z.boolean(),
  created_at: ISODateSchema,
  updated_at: ISODateSchema,
});

export const CreateReminderSchema = z.object({
  message: z.string().min(1, 'Message is required').max(500),
  remind_at: ISODateSchema,
});

/** Insert shape used by the repeatable demo seed. */
export const ReminderSeedSchema = CreateReminderSchema.extend({
  id: UUIDSchema,
  is_sent: z.boolean().default(false),
});

export const UpdateReminderSchema = z.object({
  message: z.string().min(1).max(500).optional(),
  remind_at: ISODateSchema.optional(),
  is_sent: z.boolean().optional(),
});

export type Reminder = z.infer<typeof ReminderSchema>;
export type CreateReminder = z.infer<typeof CreateReminderSchema>;
export type ReminderSeed = z.infer<typeof ReminderSeedSchema>;
export type UpdateReminder = z.infer<typeof UpdateReminderSchema>;

// ─── Parcels ─────────────────────────────────────────────────────────────────

export const ParcelStatusSchema = z.enum([
  'processing',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'failed',
]);

/** Shared marker used anywhere a parcel is intentionally simulated. */
export const SIMULATED_DATA_MARKER = '[SIMULATED DATA]';

/**
 * Insert shape for demo parcels. Keeping the simulation invariant in a
 * schema prevents seed data from being mistaken for live carrier data.
 */
export const SimulatedParcelSeedSchema = z.object({
  tracking_number: z.string().regex(/^DEMO-TRK-\d{3}$/, 'Demo tracking number required'),
  carrier: z.literal('SIMULATED'),
  status: ParcelStatusSchema,
  description: z.string().regex(/^\[SIMULATED DATA\]\s+.+$/, 'Simulation marker required'),
  estimated_delivery: ISODateSchema.nullable().optional(),
});

export const ParcelSchema = z.object({
  id: UUIDSchema,
  tracking_number: z.string().min(1).max(100),
  carrier: z.string(),
  status: ParcelStatusSchema,
  description: z.string().nullable().optional(),
  estimated_delivery: ISODateSchema.nullable().optional(),
  last_updated: ISODateSchema,
  created_at: ISODateSchema,
});

export type Parcel = z.infer<typeof ParcelSchema>;
export type ParcelStatus = z.infer<typeof ParcelStatusSchema>;
export type SimulatedParcelSeed = z.infer<typeof SimulatedParcelSeedSchema>;

// ─── Execution History ───────────────────────────────────────────────────────

export const ExecutionStatusSchema = z.enum(['pending', 'success', 'error']);

export const ExecutionStepSchema = z.object({
  id: UUIDSchema,
  session_id: UUIDSchema,
  prompt: z.string(),
  plan_json: z.record(z.string(), z.unknown()),
  step_index: z.number().int().nonnegative(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
  tool_output: z.record(z.string(), z.unknown()).nullable().optional(),
  status: ExecutionStatusSchema,
  error_message: z.string().nullable().optional(),
  duration_ms: z.number().int().nonnegative().nullable().optional(),
  created_at: ISODateSchema,
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

// ─── AI Plan ─────────────────────────────────────────────────────────────────

export const PlanStepSchema = z.object({
  step_index: z.number().int().nonnegative(),
  description: z.string(),
  tool_name: z.string(),
  tool_input: z.record(z.string(), z.unknown()),
});

export const PlanSchema = z.object({
  summary: z.string().min(1).max(500),
  steps: z.array(PlanStepSchema).min(1).max(10),
  estimated_duration_seconds: z.number().int().positive().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;
export type Plan = z.infer<typeof PlanSchema>;

// ─── API Payloads & Execution Reporting ──────────────────────────────────────

export const GeneratePlanRequestSchema = z.object({
  prompt: z.string().min(3, 'Prompt too short').max(1000, 'Prompt too long'),
});

export const ApprovePlanRequestSchema = z.object({
  prompt: z.string().min(1).max(1000),
  plan: PlanSchema,
  plan_id: z.string().uuid().optional(),
  action: z.enum(['approve', 'cancel']).optional().default('approve'),
  session_id: z.string().uuid().optional(),
});

export const ExecutionStepResultSchema = z.object({
  step_index: z.number().int().nonnegative(),
  tool_name: z.string(),
  description: z.string(),
  status: z.enum(['completed', 'failed', 'pending']),
  tool_input: z.record(z.string(), z.unknown()),
  tool_output: z.record(z.string(), z.unknown()).nullable().optional(),
  verified_result: z.record(z.string(), z.unknown()).nullable().optional(),
  error_message: z.string().nullable().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  disclaimer: z.string().optional(),
});

export const ExecutionReportSchema = z.object({
  session_id: z.string(),
  plan_id: z.string().optional(),
  prompt: z.string(),
  overall_status: z.enum(['completed', 'partial_failure', 'failed']),
  summary: z.string(),
  total_steps: z.number().int().nonnegative(),
  completed_steps: z.array(ExecutionStepResultSchema),
  failed_steps: z.array(ExecutionStepResultSchema),
  pending_steps: z.array(ExecutionStepResultSchema),
  executed_at: ISODateSchema,
  audit_logged: z.boolean(),
});

export type GeneratePlanRequest = z.infer<typeof GeneratePlanRequestSchema>;
export type ApprovePlanRequest = z.infer<typeof ApprovePlanRequestSchema>;
export type ExecutionStepResultType = z.infer<typeof ExecutionStepResultSchema>;
export type ExecutionReportType = z.infer<typeof ExecutionReportSchema>;
