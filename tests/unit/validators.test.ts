import { describe, it, expect } from 'vitest';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  CreateReminderSchema,
  PlanSchema,
  GeneratePlanRequestSchema,
  ApprovePlanRequestSchema,
} from '@/lib/validators/schemas';

describe('CreateTaskSchema', () => {
  it('accepts a valid task', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Buy groceries',
      priority: 'high',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = CreateTaskSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid priority', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Task', priority: 'urgent' });
    expect(result.success).toBe(false);
  });

  it('defaults priority to medium', () => {
    const result = CreateTaskSchema.safeParse({ title: 'Task' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.priority).toBe('medium');
  });

  it('accepts a valid ISO due_date', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Task',
      due_date: '2026-12-01T10:00:00+05:30',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-ISO due_date', () => {
    const result = CreateTaskSchema.safeParse({
      title: 'Task',
      due_date: 'tomorrow',
    });
    expect(result.success).toBe(false);
  });
});

describe('UpdateTaskSchema', () => {
  it('accepts partial updates', () => {
    const result = UpdateTaskSchema.safeParse({ status: 'completed' });
    expect(result.success).toBe(true);
  });

  it('accepts empty object (all fields optional)', () => {
    const result = UpdateTaskSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('CreateReminderSchema', () => {
  it('accepts valid reminder', () => {
    const result = CreateReminderSchema.safeParse({
      message: 'Take out the trash',
      remind_at: '2026-12-01T18:00:00+05:30',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing message', () => {
    const result = CreateReminderSchema.safeParse({
      remind_at: '2026-12-01T18:00:00+05:30',
    });
    expect(result.success).toBe(false);
  });
});

describe('PlanSchema', () => {
  const validPlan = {
    summary: 'Create a grocery task and set a reminder',
    steps: [
      {
        step_index: 0,
        description: 'Create a grocery shopping task',
        tool_name: 'create_task',
        tool_input: { title: 'Buy groceries', priority: 'medium' },
      },
    ],
  };

  it('accepts a valid plan', () => {
    const result = PlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  it('rejects an empty steps array', () => {
    const result = PlanSchema.safeParse({ ...validPlan, steps: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 10 steps', () => {
    const result = PlanSchema.safeParse({
      ...validPlan,
      steps: Array.from({ length: 11 }, (_, i) => ({
        step_index: i,
        description: `Step ${i}`,
        tool_name: 'list_tasks',
        tool_input: {},
      })),
    });
    expect(result.success).toBe(false);
  });
});

describe('GeneratePlanRequestSchema', () => {
  it('accepts a valid prompt', () => {
    const result = GeneratePlanRequestSchema.safeParse({ prompt: 'Buy milk' });
    expect(result.success).toBe(true);
  });

  it('rejects a prompt that is too short', () => {
    const result = GeneratePlanRequestSchema.safeParse({ prompt: 'ok' });
    expect(result.success).toBe(false);
  });

  it('rejects a prompt that is too long', () => {
    const result = GeneratePlanRequestSchema.safeParse({ prompt: 'a'.repeat(1001) });
    expect(result.success).toBe(false);
  });
});

describe('ApprovePlanRequestSchema', () => {
  it('accepts a valid approval request', () => {
    const result = ApprovePlanRequestSchema.safeParse({
      prompt: 'Buy groceries',
      plan: {
        summary: 'Create a task',
        steps: [
          {
            step_index: 0,
            description: 'Create task',
            tool_name: 'create_task',
            tool_input: { title: 'Buy groceries' },
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
