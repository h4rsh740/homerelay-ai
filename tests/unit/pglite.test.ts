import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPGlite, pgliteClient } from '@/lib/db/pglite';

type TaskRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  created_at: string;
};

type ParcelRow = {
  tracking_number: string;
  carrier: string;
  status: string;
  simulated: boolean;
  description: string;
};

describe('PGlite embedded PostgreSQL client', () => {
  beforeAll(async () => {
    process.env.PG_IN_MEMORY = 'true';
  });

  afterAll(async () => {
    delete process.env.PG_IN_MEMORY;
  });

  it('initializes schema and tables in PGlite', async () => {
    const db = await getPGlite();
    expect(db).toBeDefined();

    const res = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const tables = res.rows.map((r) => r.table_name);
    expect(tables).toContain('tasks');
    expect(tables).toContain('reminders');
    expect(tables).toContain('demo_parcels');
    expect(tables).toContain('execution_logs');
  });

  it('performs CRUD operations on tasks using pgliteClient', async () => {
    // 1. Insert
    const insertRes = await pgliteClient
      .from('tasks')
      .insert({
        title: 'PGlite Test Task',
        priority: 'high',
        status: 'pending',
      })
      .select('*')
      .single();

    expect(insertRes.error).toBeNull();
    const task = insertRes.data as TaskRow;
    expect(task).toBeDefined();
    expect(task.title).toBe('PGlite Test Task');
    expect(task.priority).toBe('high');
    expect(task.id).toBeDefined();

    // 2. Select by ID
    const getRes = await pgliteClient
      .from('tasks')
      .select('*')
      .eq('id', task.id)
      .maybeSingle();

    expect(getRes.error).toBeNull();
    expect((getRes.data as TaskRow).id).toBe(task.id);

    // 3. Update
    const updateRes = await pgliteClient
      .from('tasks')
      .update({ status: 'completed' })
      .eq('id', task.id)
      .select('*')
      .single();

    expect(updateRes.error).toBeNull();
    expect((updateRes.data as TaskRow).status).toBe('completed');

    // 4. List with order and range
    const listRes = await pgliteClient
      .from('tasks')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .range(0, 10);

    expect(listRes.error).toBeNull();
    expect(Array.isArray(listRes.data)).toBe(true);
    expect((listRes.data as TaskRow[]).some((t) => t.id === task.id)).toBe(true);

    // 5. Delete
    const deleteRes = await pgliteClient
      .from('tasks')
      .delete()
      .eq('id', task.id)
      .select('id')
      .single();

    expect(deleteRes.error).toBeNull();
    expect((deleteRes.data as { id: string }).id).toBe(task.id);

    // Verify deleted
    const verifyRes = await pgliteClient
      .from('tasks')
      .select('*')
      .eq('id', task.id)
      .maybeSingle();
    expect(verifyRes.data).toBeNull();
  });

  it('performs upsert operations with conflict key', async () => {
    const demoParcel = {
      tracking_number: 'PG-TEST-001',
      carrier: 'SIMULATED',
      status: 'in_transit',
      simulated: true,
      description: '[SIMULATED DATA] Test package',
    };

    // First upsert
    const res1 = await pgliteClient
      .from('demo_parcels')
      .upsert([demoParcel], { onConflict: 'tracking_number' });
    expect(res1.error).toBeNull();

    // Verify inserted
    const check1 = await pgliteClient
      .from('demo_parcels')
      .select('*')
      .eq('tracking_number', 'PG-TEST-001')
      .single();
    expect((check1.data as ParcelRow).status).toBe('in_transit');

    // Second upsert with updated status
    const updatedParcel = { ...demoParcel, status: 'delivered' };
    const res2 = await pgliteClient
      .from('demo_parcels')
      .upsert([updatedParcel], { onConflict: 'tracking_number' });
    expect(res2.error).toBeNull();

    // Verify updated
    const check2 = await pgliteClient
      .from('demo_parcels')
      .select('*')
      .eq('tracking_number', 'PG-TEST-001')
      .single();
    expect((check2.data as ParcelRow).status).toBe('delivered');
  });

  it('returns PGRST116 error when single() finds no rows', async () => {
    const res = await pgliteClient
      .from('tasks')
      .select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000')
      .single();

    expect(res.data).toBeNull();
    expect((res.error as { code: string }).code).toBe('PGRST116');
  });
});
