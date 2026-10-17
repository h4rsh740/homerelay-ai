import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as handlePlanPost } from '@/app/api/plan/route';
import { POST as handleApprovePost } from '@/app/api/approve/route';
import { resetApprovalRegistry } from '@/lib/ai/approval';
import { resetIdempotencyRegistry } from '@/lib/ai/executor';

// Mock callMCPTool so integration tests run in memory without needing an active HTTP listener
const mockCallMCPTool = vi.fn();
vi.mock('@/lib/mcp/client', () => ({
  callMCPTool: (...args: unknown[]) => mockCallMCPTool(...args),
  extractToolResultText: (res: { content?: Array<{ text?: string }> }) =>
    res?.content?.[0]?.text ?? '',
}));

vi.mock('@/lib/db', () => ({
  insertExecutionLog: vi.fn().mockResolvedValue({ id: 'mock-log-id' }),
}));

function createJsonRequest(url: string, body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('Agent API Routes Integration (/api/plan and /api/approve)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetApprovalRegistry();
    resetIdempotencyRegistry();
    vi.stubEnv('AI_PROVIDER', 'mock');
  });

  describe('POST /api/plan', () => {
    it('generates a plan, assigns a plan_id, and sets status to pending_approval', async () => {
      const req = createJsonRequest('/api/plan', {
        prompt: 'Clean the kitchen and prepare for dinner',
      });

      const res = await handlePlanPost(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.plan).toBeDefined();
      expect(json.plan.summary).toBeTruthy();
      expect(json.plan_id).toBeDefined();
      expect(json.status).toBe('pending_approval');
    });

    it('rejects short prompts with 422 Unprocessable Entity', async () => {
      const req = createJsonRequest('/api/plan', {
        prompt: 'ab', // < 3 chars
      });

      const res = await handlePlanPost(req);
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error).toBe('Validation error');
    });
  });

  describe('POST /api/approve', () => {
    it('cancels a plan when action is "cancel" and does not execute tools', async () => {
      // 1. Generate plan
      const planReq = createJsonRequest('/api/plan', {
        prompt: 'Check delivery DEMO-TRK-001',
      });
      const planRes = await handlePlanPost(planReq);
      const { plan_id, plan } = await planRes.json();

      // 2. User cancels approval
      const cancelReq = createJsonRequest('/api/approve', {
        prompt: 'Check delivery DEMO-TRK-001',
        plan,
        plan_id,
        action: 'cancel',
      });

      const cancelRes = await handleApprovePost(cancelReq);
      expect(cancelRes.status).toBe(200);
      const cancelJson = await cancelRes.json();
      expect(cancelJson.status).toBe('cancelled');
      expect(cancelJson.message).toContain('cancelled by user');

      // No tools executed
      expect(mockCallMCPTool).not.toHaveBeenCalled();

      // 3. Attempting execution after cancellation must be rejected with 403
      const execReq = createJsonRequest('/api/approve', {
        prompt: 'Check delivery DEMO-TRK-001',
        plan,
        plan_id,
        action: 'approve',
      });

      const execRes = await handleApprovePost(execReq);
      expect(execRes.status).toBe(403);
      const execJson = await execRes.json();
      expect(execJson.code).toBe('CANCELLED');
    });

    it('approves and executes plan, returning structured execution report', async () => {
      // 1. Generate plan
      const planReq = createJsonRequest('/api/plan', {
        prompt: 'Mop floor and check package DEMO-TRK-002',
      });
      const planRes = await handlePlanPost(planReq);
      const { plan_id, plan } = await planRes.json();

      // Mock tool responses
      mockCallMCPTool
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: 'text', text: JSON.stringify({ success: true, parcel: { status: 'in_transit' } }) }],
        })
        .mockResolvedValueOnce({
          isError: false,
          content: [{ type: 'text', text: JSON.stringify({ success: true, task: { id: 'task-1' } }) }],
        });

      // 2. Approve and execute
      const approveReq = createJsonRequest('/api/approve', {
        prompt: 'Mop floor and check package DEMO-TRK-002',
        plan,
        plan_id,
        action: 'approve',
      });

      const approveRes = await handleApprovePost(approveReq);
      expect(approveRes.status).toBe(200);

      const report = await approveRes.json();
      expect(report.overall_status).toBe('completed');
      expect(report.completed_steps.length).toBeGreaterThan(0);
      expect(report.failed_steps).toHaveLength(0);
      expect(report.pending_steps).toHaveLength(0);
    });

    it('streams Server-Sent Events when Accept header contains text/event-stream', async () => {
      const planReq = createJsonRequest('/api/plan', {
        prompt: 'Check DEMO-TRK-003',
      });
      const planRes = await handlePlanPost(planReq);
      const { plan_id, plan } = await planRes.json();

      mockCallMCPTool.mockResolvedValue({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ success: true, simulated: true, status: 'delivered' }) }],
      });

      const sseReq = createJsonRequest(
        '/api/approve',
        {
          prompt: 'Check DEMO-TRK-003',
          plan,
          plan_id,
          action: 'approve',
        },
        { Accept: 'text/event-stream' }
      );

      const sseRes = await handleApprovePost(sseReq);
      expect(sseRes.status).toBe(200);
      expect(sseRes.headers.get('content-type')).toContain('text/event-stream');

      const sseText = await sseRes.text();
      expect(sseText).toContain('event: session_start');
      expect(sseText).toContain('event: step_start');
      expect(sseText).toContain('event: step_complete');
      expect(sseText).toContain('event: session_complete');
    });

    it('handles partial failures cleanly via API', async () => {
      const testPlan = {
        summary: 'Two step plan with step 2 failing',
        steps: [
          {
            step_index: 0,
            description: 'Step 1: Check parcel',
            tool_name: 'get_parcel_status',
            tool_input: { tracking_number: 'DEMO-TRK-001' },
          },
          {
            step_index: 1,
            description: 'Step 2: Failing task completion',
            tool_name: 'complete_task',
            tool_input: { id: '00000000-0000-4000-8000-000000000000' },
          },
        ],
      };

      // Step 1 succeeds
      mockCallMCPTool.mockResolvedValueOnce({
        isError: false,
        content: [{ type: 'text', text: JSON.stringify({ simulated: true }) }],
      });

      // Step 2 fails
      mockCallMCPTool.mockResolvedValueOnce({
        isError: true,
        content: [{ type: 'text', text: 'Task not found in DB' }],
      });

      const approveReq = createJsonRequest('/api/approve', {
        prompt: 'Test partial failure',
        plan: testPlan,
        action: 'approve',
      });

      const approveRes = await handleApprovePost(approveReq);
      expect(approveRes.status).toBe(200);

      const report = await approveRes.json();
      expect(report.overall_status).toBe('partial_failure');
      expect(report.completed_steps).toHaveLength(1);
      expect(report.failed_steps).toHaveLength(1);
      expect(report.failed_steps[0].error_message).toContain('Task not found in DB');
    });
  });
});
