/**
 * HomeRelay AI — Server-Enforced Plan Approval Store
 * Ensures that plans CANNOT be executed simply because the model produced them.
 * Explicit user approval must be recorded and verified on the server.
 *
 * SERVER-ONLY.
 */

import crypto from 'node:crypto';
import type { Plan } from '@/lib/validators/schemas';

export type PlanApprovalStatus =
  | 'pending_approval'
  | 'approved'
  | 'cancelled'
  | 'executed';

export interface ManagedPlan {
  plan_id: string;
  prompt: string;
  plan: Plan;
  status: PlanApprovalStatus;
  created_at: string;
  approved_at?: string;
  cancelled_at?: string;
  executed_at?: string;
  executed_session_id?: string;
}

export class PlanApprovalError extends Error {
  public readonly code: 'NOT_FOUND' | 'NOT_APPROVED' | 'CANCELLED' | 'ALREADY_EXECUTED';
  public readonly status: number;

  constructor(
    message: string,
    code: 'NOT_FOUND' | 'NOT_APPROVED' | 'CANCELLED' | 'ALREADY_EXECUTED',
    status = 403
  ) {
    super(message);
    this.name = 'PlanApprovalError';
    this.code = code;
    this.status = status;
  }
}

// In-memory server-side registry of managed plans (persists for session lifetime)
const planRegistry = new Map<string, ManagedPlan>();

/**
 * Register a newly generated plan in "pending_approval" status.
 * Returns the managed plan with a unique server-issued plan_id.
 */
export function registerPlanForApproval(prompt: string, plan: Plan): ManagedPlan {
  const plan_id = crypto.randomUUID();
  const managed: ManagedPlan = {
    plan_id,
    prompt,
    plan,
    status: 'pending_approval',
    created_at: new Date().toISOString(),
  };

  planRegistry.set(plan_id, managed);
  return managed;
}

/**
 * Retrieve a managed plan by its server-assigned ID.
 */
export function getManagedPlan(planId: string): ManagedPlan | null {
  return planRegistry.get(planId) ?? null;
}

/**
 * Explicitly approve a plan on the server.
 */
export function approvePlan(planId: string): ManagedPlan {
  const managed = planRegistry.get(planId);
  if (!managed) {
    throw new PlanApprovalError(
      `Plan with ID "${planId}" not found in server registry.`,
      'NOT_FOUND',
      404
    );
  }

  if (managed.status === 'cancelled') {
    throw new PlanApprovalError(
      `Plan "${planId}" was previously cancelled and cannot be approved.`,
      'CANCELLED',
      403
    );
  }

  if (managed.status === 'executed') {
    throw new PlanApprovalError(
      `Plan "${planId}" has already been executed.`,
      'ALREADY_EXECUTED',
      400
    );
  }

  managed.status = 'approved';
  managed.approved_at = new Date().toISOString();
  return managed;
}

/**
 * Explicitly cancel/reject a plan on the server.
 */
export function cancelPlan(planId: string): ManagedPlan {
  const managed = planRegistry.get(planId);
  if (!managed) {
    throw new PlanApprovalError(
      `Plan with ID "${planId}" not found in server registry.`,
      'NOT_FOUND',
      404
    );
  }

  managed.status = 'cancelled';
  managed.cancelled_at = new Date().toISOString();
  return managed;
}

/**
 * Verifies that a plan is officially approved on the server before execution.
 * Throws a PlanApprovalError if not approved, cancelled, or already executed.
 * If sessionId matches a previous execution for the same plan, allows idempotent replay.
 */
export function verifyPlanApproved(planId: string, sessionId?: string): ManagedPlan {
  const managed = planRegistry.get(planId);
  if (!managed) {
    throw new PlanApprovalError(
      `Execution rejected: Plan "${planId}" not found in server registry.`,
      'NOT_FOUND',
      404
    );
  }

  if (managed.status === 'cancelled') {
    throw new PlanApprovalError(
      `Execution rejected: Plan was cancelled by the user.`,
      'CANCELLED',
      403
    );
  }

  if (managed.status === 'pending_approval') {
    throw new PlanApprovalError(
      `Execution rejected: Plan has not been approved. User must explicitly approve before execution.`,
      'NOT_APPROVED',
      403
    );
  }

  if (managed.status === 'executed') {
    // If this is a retry under the same session ID, allow idempotent replay
    if (sessionId && managed.executed_session_id === sessionId) {
      return managed;
    }
    throw new PlanApprovalError(
      `Execution rejected: Plan has already been executed.`,
      'ALREADY_EXECUTED',
      409
    );
  }

  return managed;
}

/**
 * Mark a plan as successfully executed.
 */
export function markPlanExecuted(planId: string, sessionId?: string): void {
  const managed = planRegistry.get(planId);
  if (managed) {
    managed.status = 'executed';
    managed.executed_at = new Date().toISOString();
    if (sessionId) {
      managed.executed_session_id = sessionId;
    }
  }
}

/**
 * Clear registry (used in unit test setups).
 */
export function resetApprovalRegistry(): void {
  planRegistry.clear();
}
