/**
 * MCP Task Tools — create_task, list_tasks, complete_task, update_task, delete_task
 * All tools validate inputs with Zod and read/write to the database.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMcpDbClient } from '../db.js';
import type { TaskInsert, TaskUpdate } from '@/lib/db/types';

export const CreateTaskInputSchema = {
  title: z
    .string()
    .min(1, 'Title cannot be empty')
    .max(200, 'Title cannot exceed 200 characters')
    .describe('Task title'),
  description: z
    .string()
    .max(2000, 'Description cannot exceed 2000 characters')
    .optional()
    .describe('Optional task description'),
  priority: z
    .enum(['low', 'medium', 'high'])
    .optional()
    .default('medium')
    .describe('Task priority'),
  due_date: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      'Due date must be in ISO 8601 format'
    )
    .optional()
    .describe('Due date in ISO 8601 format'),
};

/**
 * Register ONLY create_task tool on the given McpServer
 */
export function registerCreateTask(server: McpServer) {
  server.tool(
    'create_task',
    'Create a new household task with optional priority and due date.',
    CreateTaskInputSchema,
    async ({ title, description, priority, due_date }) => {
      try {
        const db = getMcpDbClient();
        const insertPayload: TaskInsert & Record<string, unknown> = {
          title,
          priority: (priority as TaskInsert['priority']) ?? 'medium',
          status: 'pending',
          ...(description !== undefined ? { description } : {}),
          ...(due_date !== undefined ? { due_date } : {}),
        };

        const { data, error } = await db
          .from('tasks')
          .insert(insertPayload)
          .select('*')
          .single();

        if (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Database error creating task: ${error.message ?? JSON.stringify(error)}`,
              },
            ],
            isError: true,
          };
        }

        if (!data) {
          return {
            content: [
              {
                type: 'text' as const,
                text: 'Task creation failed: no record returned from database.',
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                task: data,
                message: `Task "${title}" created successfully with ID ${data.id}`,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Unexpected error creating task: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}

/**
 * Register all task tools (create_task, list_tasks, complete_task, update_task, delete_task)
 */
export function taskTools(server: McpServer) {
  registerCreateTask(server);

  // ── list_tasks ─────────────────────────────────────────────────────────────
  server.tool(
    'list_tasks',
    'List household tasks, optionally filtered by status.',
    {
      status: z
        .enum(['pending', 'in_progress', 'completed', 'cancelled'])
        .optional()
        .describe('Filter by task status'),
    },
    async ({ status }) => {
      try {
        const db = getMcpDbClient();
        let query = db.from('tasks').select('*').order('created_at', { ascending: false });

        if (status) query = query.eq('status', status);

        const { data, error } = await query.limit(50);

        if (error) {
          return {
            content: [{ type: 'text' as const, text: `Error listing tasks: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, tasks: data ?? [], count: data?.length ?? 0 }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Unexpected error listing tasks: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ── complete_task ──────────────────────────────────────────────────────────
  server.tool(
    'complete_task',
    'Mark a household task as completed by its ID.',
    {
      id: z.string().uuid('Valid task UUID required').describe('Task UUID to complete'),
    },
    async ({ id }) => {
      try {
        const db = getMcpDbClient();
        const { data, error } = await db
          .from('tasks')
          .update({ status: 'completed' })
          .eq('id', id)
          .select('*')
          .single();

        if (error) {
          return {
            content: [{ type: 'text' as const, text: `Error completing task: ${error.message}` }],
            isError: true,
          };
        }

        if (!data) {
          return {
            content: [{ type: 'text' as const, text: `Task with ID ${id} not found.` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                task: data,
                message: `Task "${data.title}" marked as completed.`,
              }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Unexpected error completing task: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ── update_task ────────────────────────────────────────────────────────────
  server.tool(
    'update_task',
    'Update an existing task by ID.',
    {
      id: z.string().uuid().describe('Task UUID'),
      title: z.string().min(1).max(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      status: z.enum(['pending', 'in_progress', 'completed', 'cancelled']).optional(),
      due_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/)
        .nullable()
        .optional(),
    },
    async ({ id, ...updates }) => {
      try {
        const cleanUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, v]) => v !== undefined)
        );

        if (Object.keys(cleanUpdates).length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No fields to update were provided.' }],
            isError: true,
          };
        }

        const db = getMcpDbClient();
        const { data, error } = await db
          .from('tasks')
          .update(cleanUpdates as TaskUpdate)
          .eq('id', id)
          .select('*')
          .single();

        if (error) {
          return {
            content: [{ type: 'text' as const, text: `Error updating task: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, task: data, message: `Task ${id} updated` }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Unexpected error updating task: ${msg}` }],
          isError: true,
        };
      }
    }
  );

  // ── delete_task ────────────────────────────────────────────────────────────
  server.tool(
    'delete_task',
    'Delete a task by its ID.',
    {
      id: z.string().uuid().describe('Task UUID to delete'),
    },
    async ({ id }) => {
      try {
        const db = getMcpDbClient();
        const { error } = await db.from('tasks').delete().eq('id', id);

        if (error) {
          return {
            content: [{ type: 'text' as const, text: `Error deleting task: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: `Task ${id} deleted` }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: 'text' as const, text: `Unexpected error deleting task: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
