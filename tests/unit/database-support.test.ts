import { describe, expect, it, vi } from 'vitest';
import {
  CreateReminderSchema,
  CreateTaskSchema,
  SimulatedParcelSeedSchema,
} from '@/lib/validators/schemas';
import {
  assertSeedEnvironment,
  assertSeedPayloadSafety,
  buildSeedPayload,
  hasRealSupabaseEnv,
  isSimulatedParcel,
  parseSeedArgs,
  seedDatabase,
  type SeedClient,
} from '@/scripts/seed';
import { normalizeSupabaseError } from '@/lib/db/errors';

describe('database payload validation', () => {
  it('accepts a valid task insert and rejects an invalid priority', () => {
    expect(
      CreateTaskSchema.safeParse({
        title: 'Prepare the guest room',
        priority: 'high',
        due_date: '2026-12-12T15:00:00Z',
      }).success
    ).toBe(true);

    expect(CreateTaskSchema.safeParse({ title: 'Prepare the guest room', priority: 'urgent' }).success).toBe(
      false
    );
  });

  it('requires a non-empty reminder message and ISO reminder time', () => {
    expect(
      CreateReminderSchema.safeParse({
        message: 'Set the table',
        remind_at: '2026-12-12T17:00:00Z',
      }).success
    ).toBe(true);

    expect(CreateReminderSchema.safeParse({ message: '', remind_at: '2026-12-12T17:00:00Z' }).success).toBe(
      false
    );
    expect(CreateReminderSchema.safeParse({ message: 'Set the table', remind_at: 'tomorrow' }).success).toBe(
      false
    );
  });
});

describe('safe demo seed payload', () => {
  it('contains only clearly marked demo tasks, reminders, and parcels', () => {
    const payload = buildSeedPayload();

    expect(() => assertSeedPayloadSafety(payload)).not.toThrow();
    expect(payload.tasks).toHaveLength(2);
    expect(payload.reminders).toHaveLength(2);
    expect(payload.demo_parcels).toHaveLength(4);
    expect(payload.tasks.every((task) => task.title.startsWith('[DEMO]'))).toBe(true);
    expect(payload.reminders.every((reminder) => reminder.message.startsWith('[DEMO]'))).toBe(true);
    expect(payload.demo_parcels.every(isSimulatedParcel)).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/api[_-]?key|service[_-]?role|password|secret/i);
  });

  it('rejects a parcel that loses the simulation invariant', () => {
    const payload = buildSeedPayload();
    const unsafeParcel = { ...payload.demo_parcels[0], carrier: 'UPS' } as unknown as typeof payload.demo_parcels[number];

    expect(isSimulatedParcel(unsafeParcel)).toBe(false);
    expect(() =>
      assertSeedPayloadSafety({
        ...payload,
        demo_parcels: [unsafeParcel, ...payload.demo_parcels.slice(1)],
      })
    ).toThrow(/simulated/i);
    expect(SimulatedParcelSeedSchema.safeParse(unsafeParcel).success).toBe(false);
  });

  it('rejects credential-like fields added to a seed payload', () => {
    const payload = buildSeedPayload();
    const unsafePayload = {
      ...payload,
      tasks: [{ ...payload.tasks[0], api_key: 'never-write-this' }, ...payload.tasks.slice(1)],
    } as unknown as typeof payload;

    expect(() => assertSeedPayloadSafety(unsafePayload)).toThrow(/credential/i);
  });
});

describe('seed environment guard and writes', () => {
  it('rejects placeholder Supabase values unless explicitly allowed', () => {
    const placeholderEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://your-project.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'your-service-role-key',
    };

    expect(hasRealSupabaseEnv(placeholderEnv)).toBe(false);
    expect(() =>
      assertSeedEnvironment(placeholderEnv, { dryRun: false, allowUnconfigured: false })
    ).toThrow(/Refusing to seed/);
    expect(() =>
      assertSeedEnvironment(placeholderEnv, { dryRun: false, allowUnconfigured: true })
    ).not.toThrow();
    expect(parseSeedArgs(['--allow-placeholder']).allowUnconfigured).toBe(true);
  });

  it('upserts each table with an idempotent conflict key', async () => {
    const upsert = vi
      .fn<(rows: readonly unknown[], options: { onConflict: string }) => Promise<{ error: null }>>()
      .mockResolvedValue({ error: null });
    const from = vi.fn<(table: string) => { upsert: typeof upsert }>(() => ({ upsert }));
    const client = { from } as unknown as SeedClient;

    const result = await seedDatabase(client);

    expect(result).toEqual({
      wrote: true,
      counts: { tasks: 2, reminders: 2, demo_parcels: 4 },
    });
    expect(from.mock.calls.map(([table]) => table)).toEqual(['tasks', 'reminders', 'demo_parcels']);
    expect(upsert.mock.calls.map(([, options]) => options)).toEqual([
      { onConflict: 'id' },
      { onConflict: 'id' },
      { onConflict: 'tracking_number' },
    ]);
    expect(upsert.mock.calls[0][0]).toHaveLength(2);
    expect(upsert.mock.calls[1][0]).toHaveLength(2);
    expect(upsert.mock.calls[2][0]).toHaveLength(4);
  });
});

describe('database service error normalization', () => {
  it('maps provider not-found and unique-conflict codes to stable errors', () => {
    expect(normalizeSupabaseError({ code: 'PGRST116', message: 'No rows' }, 'get task').code).toBe('not_found');
    expect(normalizeSupabaseError({ code: '23505', message: 'Already exists' }, 'seed parcel').code).toBe('conflict');
    expect(normalizeSupabaseError({ code: 'XX000', message: 'Provider failed' }, 'list tasks').code).toBe('query_failed');
  });
});
