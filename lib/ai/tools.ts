/**
 * HomeRelay AI — Tool Registry, Schemas & Tool-Calling Definitions
 * Defines all available MCP tools, Zod input validation schemas,
 * Google Gemini function declarations, and safety validation functions.
 *
 * SERVER-ONLY.
 */

import { z } from 'zod';
import { SchemaType, type FunctionDeclaration } from '@google/generative-ai';

// ─── Whitelist of Allowed MCP Tools ──────────────────────────────────────────
export const ALLOWED_MCP_TOOLS = [
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
] as const;

export type AllowedMcpTool = (typeof ALLOWED_MCP_TOOLS)[number];

export function isAllowedTool(toolName: string): toolName is AllowedMcpTool {
  return (ALLOWED_MCP_TOOLS as readonly string[]).includes(toolName);
}

// ─── Tool Argument Validation Schemas (Zod) ───────────────────────────────────

export const CreateTaskArgsSchema = z.object({
  title: z
    .string()
    .min(1, 'Task title cannot be empty')
    .max(200, 'Task title cannot exceed 200 characters'),
  priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  description: z.string().max(2000).optional(),
  due_date: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      'Due date must be in ISO 8601 format'
    )
    .optional(),
});

export const ListTasksArgsSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
});

export const CompleteTaskArgsSchema = z.object({
  id: z.string().uuid('Valid task UUID required'),
});

export const UpdateTaskArgsSchema = z.object({
  id: z.string().uuid('Valid task UUID required'),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/)
    .nullable()
    .optional(),
});

export const DeleteTaskArgsSchema = z.object({
  id: z.string().uuid('Valid task UUID required'),
});

export const ScheduleReminderArgsSchema = z.object({
  message: z
    .string()
    .min(1, 'Reminder message cannot be empty')
    .max(500, 'Reminder message cannot exceed 500 characters'),
  remind_at: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      'remind_at must be in ISO 8601 format'
    ),
});

export const ListRemindersArgsSchema = z.object({
  is_sent: z.boolean().optional(),
});

export const DeleteReminderArgsSchema = z.object({
  id: z.string().uuid('Valid reminder UUID required'),
});

export const GetParcelStatusArgsSchema = z.object({
  tracking_number: z
    .string()
    .min(1, 'Tracking number cannot be empty')
    .max(100, 'Tracking number cannot exceed 100 characters'),
});

export const GetHouseholdSummaryArgsSchema = z.object({});

// Map of tool names to their Zod validation schemas
export const TOOL_SCHEMAS: Record<AllowedMcpTool, z.ZodTypeAny> = {
  create_task: CreateTaskArgsSchema,
  list_tasks: ListTasksArgsSchema,
  complete_task: CompleteTaskArgsSchema,
  update_task: UpdateTaskArgsSchema,
  delete_task: DeleteTaskArgsSchema,
  schedule_reminder: ScheduleReminderArgsSchema,
  create_reminder: ScheduleReminderArgsSchema,
  list_reminders: ListRemindersArgsSchema,
  delete_reminder: DeleteReminderArgsSchema,
  get_parcel_status: GetParcelStatusArgsSchema,
  lookup_parcel: GetParcelStatusArgsSchema,
  get_household_summary: GetHouseholdSummaryArgsSchema,
};

// ─── Safety & Attack Pattern Detection ────────────────────────────────────────

const DANGEROUS_PATTERNS = [
  /drop\s+table/i,
  /insert\s+into/i,
  /delete\s+from/i,
  /update\s+.*\s+set/i,
  /select\s+.*\s+from/i,
  /union\s+select/i,
  /;\s*--/i,
  /\bexec\b/i,
  /\bspawn\b/i,
  /\beval\b/i,
  /\bsh\b\s+-c/i,
  /\bbash\b/i,
  /\brm\s+-rf\b/i,
];

/**
 * Validates a tool name and its arguments.
 * Rejects disallowed tools, dangerous patterns, and schema invalidities.
 */
export function validateToolCall(
  toolName: string,
  toolInput: Record<string, unknown>
): { toolName: AllowedMcpTool; validatedInput: Record<string, unknown> } {
  // 1. Verify tool name is whitelisted
  if (!isAllowedTool(toolName)) {
    throw new Error(
      `Disallowed tool: "${toolName}". Tool is not in the allowed MCP tools list: [${ALLOWED_MCP_TOOLS.join(
        ', '
      )}]`
    );
  }

  // 2. Check for dangerous SQL or shell injection attempts in input values
  const inputStringified = JSON.stringify(toolInput);
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(inputStringified)) {
      throw new Error(
        `Security violation: Tool input contains forbidden command or SQL pattern: ${pattern}`
      );
    }
  }

  // 3. Validate against the tool's specific Zod schema
  const schema = TOOL_SCHEMAS[toolName];
  const parseResult = schema.safeParse(toolInput);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new Error(
      `Invalid arguments for tool "${toolName}": ${errorDetails}`
    );
  }

  return {
    toolName,
    validatedInput: parseResult.data as Record<string, unknown>,
  };
}

// ─── Google Gemini Function Declarations (Tool Calling) ───────────────────────

export const GEMINI_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'create_task',
    description: 'Create a new household task with optional priority and due date in the database.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: {
          type: SchemaType.STRING,
          description: 'Task title (e.g. "Clean kitchen filters")',
        },
        priority: {
          type: SchemaType.STRING,
          description: 'Task priority: "low", "medium", or "high"',
        },
        description: {
          type: SchemaType.STRING,
          description: 'Optional additional details for the task',
        },
        due_date: {
          type: SchemaType.STRING,
          description: 'Optional due date in ISO 8601 format (e.g. "2026-10-25T18:00:00Z")',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'list_tasks',
    description: 'List household tasks from the database, optionally filtered by status.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: {
          type: SchemaType.STRING,
          description: 'Filter status: "pending", "in_progress", "completed", or "cancelled"',
        },
      },
    },
  },
  {
    name: 'complete_task',
    description: 'Mark an existing household task as completed using its UUID.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: {
          type: SchemaType.STRING,
          description: 'UUID of the task to complete',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'schedule_reminder',
    description: 'Schedule a timed household reminder with a message and ISO 8601 remind_at timestamp.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        message: {
          type: SchemaType.STRING,
          description: 'Reminder message (e.g. "Take laundry out of dryer")',
        },
        remind_at: {
          type: SchemaType.STRING,
          description: 'When the reminder is scheduled in ISO 8601 format',
        },
      },
      required: ['message', 'remind_at'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List scheduled household reminders from the database.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        is_sent: {
          type: SchemaType.BOOLEAN,
          description: 'Optional filter by sent status (false for upcoming)',
        },
      },
    },
  },
  {
    name: 'get_parcel_status',
    description: '[SIMULATED] Look up package tracking status from the simulation database.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        tracking_number: {
          type: SchemaType.STRING,
          description: 'Demo package tracking number (e.g. "DEMO-TRK-001")',
        },
      },
      required: ['tracking_number'],
    },
  },
  {
    name: 'get_household_summary',
    description: 'Get an overview of active tasks, reminders, and package deliveries.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
];
