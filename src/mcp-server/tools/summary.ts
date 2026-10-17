/**
 * MCP Household Summary Tool — get_household_summary
 * Returns a snapshot of tasks, reminders, and recent execution history.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getMcpDbClient } from '../db.js';

export function summaryTools(server: McpServer) {
  server.tool(
    'get_household_summary',
    'Get a summary of all household tasks, reminders, and recent AI executions.',
    {},
    async () => {
      try {
        const db = getMcpDbClient();

        const [tasksRes, remindersRes, historyRes] = await Promise.all([
          db
            .from('tasks')
            .select('id, title, status, priority, due_date')
            .in('status', ['pending', 'in_progress'])
            .order('due_date', { ascending: true })
            .limit(10),
          db
            .from('reminders')
            .select('id, message, remind_at, is_sent')
            .eq('is_sent', false)
            .order('remind_at', { ascending: true })
            .limit(10),
          db
            .from('execution_logs')
            .select('session_id, prompt, tool_name, status, created_at')
            .order('created_at', { ascending: false })
            .limit(5),
        ]);

        const hasError = tasksRes.error || remindersRes.error || historyRes.error;
        if (hasError) {
          const msg =
            tasksRes.error?.message ??
            remindersRes.error?.message ??
            historyRes.error?.message;
          return {
            content: [{ type: 'text' as const, text: `Error fetching summary: ${msg}` }],
            isError: true,
          };
        }

        const summary = {
          household_summary: {
            active_tasks: {
              count: tasksRes.data?.length ?? 0,
              items: tasksRes.data,
            },
            upcoming_reminders: {
              count: remindersRes.data?.length ?? 0,
              items: remindersRes.data,
            },
            recent_executions: {
              count: historyRes.data?.length ?? 0,
              items: historyRes.data,
            },
          },
          generated_at: new Date().toISOString(),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(summary) }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [
            {
              type: 'text' as const,
              text: `Unexpected error generating summary: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
