import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createActionPlan,
  validatePlanSteps,
  generateDeterministicPlan,
} from '@/lib/ai/planner';
import {
  validateToolCall,
  isAllowedTool,
} from '@/lib/ai/tools';
import {
  registerPlanForApproval,
  getManagedPlan,
  approvePlan,
  cancelPlan,
  verifyPlanApproved,
  resetApprovalRegistry,
  PlanApprovalError,
} from '@/lib/ai/approval';
import {
  executeApprovedPlan,
  resetIdempotencyRegistry,
  type ExecutionReport,
} from '@/lib/ai/executor';
import type { Plan } from '@/lib/validators/schemas';

// Mock callMCPTool from @/lib/mcp/client
const mockCallMCPTool = vi.fn();
vi.mock('@/lib/mcp/client', () => ({
  callMCPTool: (...args: unknown[]) => mockCallMCPTool(...args),
  extractToolResultText: (res: { content?: Array<{ text?: string }> }) =>
    res?.content?.[0]?.text ?? '',
}));

// Mock insertExecutionLog to keep tests isolated
vi.mock('@/lib/db', () => ({
  insertExecutionLog: vi.fn().mockResolvedValue({ id: 'mock-log-id' }),
}));

describe('HomeRelay AI Agent: Comprehensive Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApprovalRegistry();
    resetIdempotencyRegistry();
    vi.stubEnv('AI_PROVIDER', 'mock');
  });

  // ─── 1. Tool Selection & Input Validation ──────────────────────────────────

  describe('1. Tool Validation & Security', () => {
    it('allows valid whitelisted tools and validates input schemas', () => {
      expect(isAllowedTool('create_task')).toBe(true);
      expect(isAllowedTool('schedule_reminder')).toBe(true);
      expect(isAllowedTool('get_parcel_status')).toBe(true);

      const taskCall = validateToolCall('create_task', {
        title: 'Repair kitchen cabinet',
        priority: 'high',
      });
      expect(taskCall.validatedInput.title).toBe('Repair kitchen cabinet');
      expect(taskCall.validatedInput.priority).toBe('high');

      const reminderCall = validateToolCall('schedule_reminder', {
        message: 'Turn off space heater',
        remind_at: '2026-10-25T15:00:00Z',
      });
      expect(reminderCall.validatedInput.message).toBe('Turn off space heater');
    });

    it('rejects disallowed tools not in the allowed MCP whitelist', () => {
      expect(() => validateToolCall('execute_bash_command', { cmd: 'ls' })).toThrow(
        /Disallowed tool/
      );
      expect(() => validateToolCall('query_database_arbitrary', { q: 'SELECT 1' })).toThrow(
        /Disallowed tool/
      );
    });

    it('rejects invalid tool arguments (empty title, invalid priority, bad ISO date)', () => {
      // Empty title
      expect(() => validateToolCall('create_task', { title: '' })).toThrow(
        /Invalid arguments for tool "create_task"/
      );

      // Invalid priority
      expect(() =>
        validateToolCall('create_task', { title: 'Valid', priority: 'extreme_urgent' })
      ).toThrow(/Invalid arguments for tool "create_task"/);

      // Invalid ISO timestamp for reminder
      expect(() =>
        validateToolCall('schedule_reminder', {
          message: 'Meeting',
          remind_at: 'tomorrow morning',
        })
      ).toThrow(/Invalid arguments for tool "schedule_reminder"/);

      // Invalid UUID for complete_task
      expect(() => validateToolCall('complete_task', { id: 'not-a-uuid' })).toThrow(
        /Invalid arguments for tool "complete_task"/
      );
    });

    it('detects and blocks dangerous SQL and shell injection patterns in tool arguments', () => {
      expect(() =>
        validateToolCall('create_task', {
          title: 'Clean room; DROP TABLE tasks; --',
        })
      ).toThrow(/Security violation/);

      expect(() =>
        validateToolCall('create_task', {
          title: 'Normal title',
          description: 'test UNION SELECT * FROM users',
        })
      ).toThrow(/Security violation/);
    });
  });

  // ─── 2. Plan Generation & Validation ───────────────────────────────────────

  describe('2. Plan Generation & Schema Validation', () => {
    it('generates a structured action plan with appropriate MCP tools', async () => {
      const result = await createActionPlan('Clean the garage and remind me at 5pm to check the lock');

      expect(result.plan).toBeDefined();
      expect(result.plan.summary).toBeTruthy();
      expect(result.plan.steps.length).toBeGreaterThanOrEqual(1);

      // Step tool names must be in allowed list
      for (const step of result.plan.steps) {
        expect(isAllowedTool(step.tool_name)).toBe(true);
        expect(step.description).toBeTruthy();
        expect(step.tool_input).toBeDefined();
      }

      // Automatically registered in pending_approval state
      expect(result.managedPlan).toBeDefined();
      expect(result.managedPlan.status).toBe('pending_approval');
      expect(result.managedPlan.plan_id).toBeTruthy();
    });

    it('selects parcel tracking tool for package inquiries', () => {
      const plan = generateDeterministicPlan('Where is my package DEMO-TRK-003?');
      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].tool_name).toBe('get_parcel_status');
      expect(plan.steps[0].tool_input.tracking_number).toBe('DEMO-TRK-003');
    });

    it('rejects invalid plan when steps contain invalid tool inputs', () => {
      const invalidPlan: Plan = {
        summary: 'Invalid plan',
        steps: [
          {
            step_index: 0,
            description: 'Invalid task',
            tool_name: 'create_task',
            tool_input: { title: '' }, // empty title invalid
          },
        ],
      };

      expect(() => validatePlanSteps(invalidPlan)).toThrow(/Invalid arguments for tool "create_task"/);
    });

    it('rejects plan generation on empty prompt', async () => {
      await expect(createActionPlan('')).rejects.toThrow('User prompt cannot be empty');
    });
  });

  // ─── 3. Server-Enforced Approval & Cancellation ────────────────────────────

  describe('3. Server-Enforced Approval & Cancellation', () => {
    it('enforces that a plan cannot execute merely because it was generated', async () => {
      const { managedPlan, plan } = await createActionPlan('Order milk and eggs');
      expect(managedPlan.status).toBe('pending_approval');

      // Attempting execution without explicit approval must be rejected by the server
      await expect(
        executeApprovedPlan({
          plan_id: managedPlan.plan_id,
          prompt: 'Order milk and eggs',
          plan,
        })
      ).rejects.toThrow(PlanApprovalError);
    });

    it('allows execution after explicit user approval on the server', async () => {
      const { managedPlan } = await createActionPlan('Clean oven');
      approvePlan(managedPlan.plan_id);

      const approved = getManagedPlan(managedPlan.plan_id);
      expect(approved?.status).toBe('approved');
      expect(approved?.approved_at).toBeDefined();

      // Should not throw verification error
      expect(() => verifyPlanApproved(managedPlan.plan_id)).not.toThrow();
    });

    it('prevents execution when plan approval is cancelled by the user', async () => {
      const { managedPlan, plan } = await createActionPlan('Paint hallway');
      cancelPlan(managedPlan.plan_id);

      const cancelled = getManagedPlan(managedPlan.plan_id);
      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.cancelled_at).toBeDefined();

      // Verify server rejects execution with 403
      await expect(
        executeApprovedPlan({
          plan_id: managedPlan.plan_id,
          prompt: 'Paint hallway',
          plan,
        })
      ).rejects.toThrow('Execution rejected: Plan was cancelled by the user.');
    });

    it('blocks approving a previously cancelled plan', async () => {
      const { managedPlan } = await createActionPlan('Replace light bulbs');
      cancelPlan(managedPlan.plan_id);

      expect(() => approvePlan(managedPlan.plan_id)).toThrow(
        /was previously cancelled and cannot be approved/
      );
    });

    it('rejects unknown plan_id with NOT_FOUND', () => {
      expect(() => verifyPlanApproved('00000000-0000-0000-0000-000000000000')).toThrow(
        /not found in server registry/
      );
    });
  });

  // ─── 4. Execution, Result Verification & Honest Disclaimers ────────────────

  describe('4. Execution & Honest Result Verification', () => {
    it('executes approved plan, verifies results, and attaches required disclaimers', async () => {
      const validPlan: Plan = {
        summary: 'Household prep',
        steps: [
          {
            step_index: 0,
            description: 'Create cleaning task',
            tool_name: 'create_task',
            tool_input: { title: 'Mop living room floor', priority: 'medium' },
          },
          {
            step_index: 1,
            description: 'Schedule check reminder',
            tool_name: 'schedule_reminder',
            tool_input: {
              message: 'Check dry floor',
              remind_at: '2026-10-25T18:00:00Z',
            },
          },
          {
            step_index: 2,
            description: 'Look up delivery',
            tool_name: 'get_parcel_status',
            tool_input: { tracking_number: 'DEMO-TRK-001' },
          },
        ],
      };

      const managed = registerPlanForApproval('Prep house', validPlan);
      approvePlan(managed.plan_id);

      // Mock MCP responses
      mockCallMCPTool
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                task: { id: 'task-123', title: 'Mop living room floor' },
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                reminder: { id: 'rem-456', message: 'Check dry floor' },
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                simulated: true,
                parcel: { tracking_number: 'DEMO-TRK-001', status: 'in_transit' },
              }),
            },
          ],
        });

      const report: ExecutionReport = await executeApprovedPlan({
        plan_id: managed.plan_id,
        prompt: 'Prep house',
        plan: validPlan,
      });

      expect(report.overall_status).toBe('completed');
      expect(report.completed_steps).toHaveLength(3);
      expect(report.failed_steps).toHaveLength(0);
      expect(report.pending_steps).toHaveLength(0);

      // Verification of honest reminder disclaimer (never claims delivered)
      const reminderStep = report.completed_steps[1];
      expect(reminderStep.disclaimer).toContain(
        'Reminder has been saved to the database for scheduled dispatch. It has NOT been delivered yet.'
      );

      // Verification of honest parcel disclaimer (never claims live shipment)
      const parcelStep = report.completed_steps[2];
      expect(parcelStep.disclaimer).toContain('[SIMULATED DATA]');
      expect(parcelStep.disclaimer).toContain('No live carrier API was called.');
    });

    it('prevents duplicate actions during retries (idempotency)', async () => {
      const plan: Plan = {
        summary: 'Single task plan',
        steps: [
          {
            step_index: 0,
            description: 'Create unique task',
            tool_name: 'create_task',
            tool_input: { title: 'Do dishes' },
          },
        ],
      };

      const managed = registerPlanForApproval('Do dishes', plan);
      approvePlan(managed.plan_id);

      mockCallMCPTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ success: true, task: { id: 't-1' } }) }],
      });

      const sessionId = 'test-session-idempotency';

      // First execution: tool is called once
      const report1 = await executeApprovedPlan({
        plan_id: managed.plan_id,
        session_id: sessionId,
        prompt: 'Do dishes',
        plan,
      });
      expect(report1.completed_steps).toHaveLength(1);
      expect(mockCallMCPTool).toHaveBeenCalledTimes(1);

      // Retry execution with same session_id: tool must NOT be called again
      const report2 = await executeApprovedPlan({
        plan_id: managed.plan_id,
        session_id: sessionId,
        prompt: 'Do dishes',
        plan,
      });
      expect(report2.completed_steps).toHaveLength(1);
      expect(mockCallMCPTool).toHaveBeenCalledTimes(1); // Still 1 call, deduplicated!
    });
  });

  // ─── 5. Tool Failure Handling ──────────────────────────────────────────────

  describe('5. Tool Failures (Honest Failure Reporting)', () => {
    it('handles tool failure honestly without claiming success', async () => {
      const plan: Plan = {
        summary: 'Task completion',
        steps: [
          {
            step_index: 0,
            description: 'Complete non-existent task',
            tool_name: 'complete_task',
            tool_input: { id: '00000000-0000-0000-0000-000000000000' },
          },
        ],
      };

      const managed = registerPlanForApproval('Complete missing', plan);
      approvePlan(managed.plan_id);

      // Tool returns failure from database
      mockCallMCPTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Task with ID not found in database.' }],
      });

      const report = await executeApprovedPlan({
        plan_id: managed.plan_id,
        prompt: 'Complete missing',
        plan,
      });

      expect(report.overall_status).toBe('failed');
      expect(report.completed_steps).toHaveLength(0);
      expect(report.failed_steps).toHaveLength(1);
      expect(report.failed_steps[0].error_message).toContain('Task with ID not found');
    });
  });

  // ─── 6. Partial Execution Handling ─────────────────────────────────────────

  describe('6. Partial Execution & Separate Step Reporting', () => {
    it('halts on step failure and reports completed, failed, and pending steps separately', async () => {
      const multiStepPlan: Plan = {
        summary: 'Multi-action plan with failure',
        steps: [
          {
            step_index: 0,
            description: 'Step 1: Create task (succeeds)',
            tool_name: 'create_task',
            tool_input: { title: 'First Task' },
          },
          {
            step_index: 1,
            description: 'Step 2: Complete task (fails)',
            tool_name: 'complete_task',
            tool_input: { id: '00000000-0000-4000-8000-000000000000' },
          },
          {
            step_index: 2,
            description: 'Step 3: Schedule reminder (pending/skipped)',
            tool_name: 'schedule_reminder',
            tool_input: {
              message: 'Check completed',
              remind_at: '2026-10-25T20:00:00Z',
            },
          },
        ],
      };

      const managed = registerPlanForApproval('Multi action', multiStepPlan);
      approvePlan(managed.plan_id);

      // Step 0 succeeds
      mockCallMCPTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ success: true, task: { id: 't-success' } }) }],
      });

      // Step 1 fails
      mockCallMCPTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Database error completing task: row not found' }],
      });

      const report = await executeApprovedPlan({
        plan_id: managed.plan_id,
        prompt: 'Multi action',
        plan: multiStepPlan,
      });

      // Overall status must be partial_failure
      expect(report.overall_status).toBe('partial_failure');
      expect(report.summary).toContain('Completed 1 action(s), but 1 action failed');

      // Completed steps must contain only Step 0
      expect(report.completed_steps).toHaveLength(1);
      expect(report.completed_steps[0].step_index).toBe(0);
      expect(report.completed_steps[0].tool_name).toBe('create_task');
      expect(report.completed_steps[0].status).toBe('completed');

      // Failed steps must contain only Step 1
      expect(report.failed_steps).toHaveLength(1);
      expect(report.failed_steps[0].step_index).toBe(1);
      expect(report.failed_steps[0].tool_name).toBe('complete_task');
      expect(report.failed_steps[0].status).toBe('failed');
      expect(report.failed_steps[0].error_message).toContain('row not found');

      // Pending steps must contain Step 2
      expect(report.pending_steps).toHaveLength(1);
      expect(report.pending_steps[0].step_index).toBe(2);
      expect(report.pending_steps[0].tool_name).toBe('schedule_reminder');
      expect(report.pending_steps[0].status).toBe('pending');
      expect(report.pending_steps[0].error_message).toContain('Skipped due to prior step failure');

      // MCP tool should not have been called for Step 2
      expect(mockCallMCPTool).toHaveBeenCalledTimes(2);
    });
  });
});
