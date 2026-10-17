/**
 * MCP Reminder Tools — schedule_reminder, list_reminders, create_reminder, delete_reminder
 * All tools validate inputs with Zod and read/write to the database.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMcpDbClient } from '../db';

export const ScheduleReminderInputSchema = {
  message: z
    .string()
    .min(1, 'Reminder message cannot be empty')
    .max(500, 'Reminder message cannot exceed 500 characters')
    .describe('Reminder message'),
  remind_at: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
      'remind_at must be in ISO 8601 format'
    )
    .describe('When to send the reminder in ISO 8601 format'),
};

export function reminderTools(server: McpServer) {
  const handleScheduleReminder = async ({
    message,
    remind_at,
  }: {
    message: string;
    remind_at: string;
  }) => {
    try {
      const db = getMcpDbClient();
      const { data, error } = await db
        .from('reminders')
        .insert({ message, remind_at, is_sent: false })
        .select('*')
        .single();

      if (error) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Database error scheduling reminder: ${error.message ?? JSON.stringify(error)}`,
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
              text: 'Reminder creation failed: no record returned from database.',
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
              reminder: data,
              message: `Reminder "${message}" scheduled for ${remind_at}`,
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
            text: `Unexpected error scheduling reminder: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  };

  // ── schedule_reminder (Primary tool required in Phase 3) ───────────────────
  server.tool(
    'schedule_reminder',
    'Schedule a timed household reminder with message and remind_at timestamp.',
    ScheduleReminderInputSchema,
    handleScheduleReminder
  );

  // ── create_reminder (Alias for backwards compatibility) ────────────────────
  server.tool(
    'create_reminder',
    'Create a timed household reminder.',
    ScheduleReminderInputSchema,
    handleScheduleReminder
  );

  // ── list_reminders ─────────────────────────────────────────────────────────
  server.tool(
    'list_reminders',
    'List all upcoming and past reminders.',
    {
      is_sent: z
        .boolean()
        .optional()
        .describe('Filter reminders by whether they have been sent'),
    },
    async ({ is_sent }) => {
      try {
        const db = getMcpDbClient();
        let query = db
          .from('reminders')
          .select('*')
          .order('remind_at', { ascending: true });

        if (is_sent !== undefined) {
          query = query.eq('is_sent', is_sent);
        }

        const { data, error } = await query.limit(50);

        if (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error listing reminders: ${error.message ?? JSON.stringify(error)}`,
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
                reminders: data ?? [],
                count: data?.length ?? 0,
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
              text: `Unexpected error listing reminders: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // ── delete_reminder ────────────────────────────────────────────────────────
  server.tool(
    'delete_reminder',
    'Delete a reminder by its ID.',
    {
      id: z.string().uuid().describe('Reminder UUID to delete'),
    },
    async ({ id }) => {
      try {
        const db = getMcpDbClient();
        const { error } = await db.from('reminders').delete().eq('id', id);

        if (error) {
          return {
            content: [{ type: 'text' as const, text: `Error deleting reminder: ${error.message}` }],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ success: true, message: `Reminder ${id} deleted` }),
            },
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Unexpected error deleting reminder: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
