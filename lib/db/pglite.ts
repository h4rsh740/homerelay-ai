import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

declare global {
  var __pgliteInstance: PGlite | undefined;
  var __pgliteReadyPromise: Promise<PGlite> | undefined;
}

const DEFAULT_DB_PATH = path.join(process.cwd(), '.pglite');

export async function getPGlite(): Promise<PGlite> {
  if (globalThis.__pgliteInstance) {
    return globalThis.__pgliteInstance;
  }

  if (globalThis.__pgliteReadyPromise) {
    return globalThis.__pgliteReadyPromise;
  }

  globalThis.__pgliteReadyPromise = (async () => {
    const isVercel = Boolean(
      process.env.VERCEL ||
      process.env.NEXT_PUBLIC_VERCEL_ENV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME
    );
    let dataDir: string | undefined = undefined;

    if (process.env.PG_IN_MEMORY === 'true') {
      dataDir = undefined;
    } else if (isVercel) {
      dataDir = path.join('/tmp', '.pglite');
    } else {
      dataDir = DEFAULT_DB_PATH;
    }

    if (dataDir && !fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        console.warn('Failed to create dataDir, falling back to in-memory PGlite:', err);
        dataDir = undefined;
      }
    }

    const client = new PGlite(dataDir);
    await initializeSchema(client);
    globalThis.__pgliteInstance = client;
    return client;
  })();

  return globalThis.__pgliteReadyPromise;
}

const EMBEDDED_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  is_sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.demo_parcels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number TEXT NOT NULL UNIQUE,
  carrier TEXT NOT NULL DEFAULT 'SIMULATED'
    CHECK (carrier = 'SIMULATED'),
  status TEXT NOT NULL DEFAULT 'in_transit'
    CHECK (status IN ('processing', 'in_transit', 'out_for_delivery', 'delivered', 'failed')),
  description TEXT,
  estimated_delivery TIMESTAMPTZ,
  simulated BOOLEAN NOT NULL DEFAULT TRUE
    CHECK (simulated = TRUE),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  plan_json JSONB NOT NULL,
  step_index INTEGER NOT NULL CHECK (step_index >= 0),
  tool_name TEXT NOT NULL,
  tool_input JSONB NOT NULL,
  tool_output JSONB,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'error')),
  error_message TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

async function initializeSchema(client: PGlite): Promise<void> {
  // Check if public.tasks already exists
  const check = await client.query<{ exists: boolean }>(
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks') as exists"
  );

  if (!check.rows[0]?.exists) {
    const migrationPath = path.join(
      process.cwd(),
      'supabase/migrations/20261013000000_phase_2_storage_foundation.sql'
    );

    let executed = false;
    if (fs.existsSync(migrationPath)) {
      try {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        await client.exec(sql);
        executed = true;
      } catch (err) {
        console.warn('⚠️ Error executing migration file, using embedded schema fallback:', err);
      }
    }

    if (!executed) {
      await client.exec(EMBEDDED_SCHEMA_SQL);
    }
  }

  // Ensure demo parcels exist for simulation lookup
  try {
    const parcelCheck = await client.query<{ count: string }>(
      'SELECT count(*) as count FROM demo_parcels'
    );
    if (parseInt(parcelCheck.rows[0]?.count ?? '0', 10) === 0) {
      await client.exec(`
        INSERT INTO demo_parcels (tracking_number, carrier, status, description, estimated_delivery, simulated)
        VALUES
          ('DEMO-TRK-001', 'SIMULATED', 'in_transit', 'Kitchen blender', NOW() + INTERVAL '2 days', true),
          ('DEMO-TRK-002', 'SIMULATED', 'delivered', 'Espresso cups', NOW() - INTERVAL '1 day', true),
          ('DEMO-TRK-003', 'SIMULATED', 'out_for_delivery', 'Coffee beans', NOW() + INTERVAL '4 hours', true),
          ('DEMO-TRK-004', 'SIMULATED', 'exception', 'Air purifier filters', NOW() + INTERVAL '3 days', true)
        ON CONFLICT (tracking_number) DO NOTHING;
      `);
    }
  } catch {
    // Ignore if table not yet available
  }
}

type QueryFilter = { column: string; value: unknown };
type QueryInFilter = { column: string; values: unknown[] };

export class PGliteQueryBuilder {
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectColumns = '*';
  private filters: QueryFilter[] = [];
  private inFilters: QueryInFilter[] = [];
  private orderClause?: { column: string; ascending: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private insertData?: Record<string, unknown> | Record<string, unknown>[];
  private updateData?: Record<string, unknown>;
  private conflictKey?: string;
  private isSingle = false;
  private isMaybeSingle = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns = '*'): this {
    if (this.action === 'select') {
      this.selectColumns = columns;
    }
    return this;
  }

  insert(values: Record<string, unknown> | Record<string, unknown>[]): this {
    this.action = 'insert';
    this.insertData = values;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.action = 'update';
    this.updateData = values;
    return this;
  }

  delete(): this {
    this.action = 'delete';
    return this;
  }

  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string }
  ): this {
    this.action = 'upsert';
    this.insertData = values;
    this.conflictKey = options?.onConflict;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.inFilters.push({ column, values });
    return this;
  }

  order(column: string, options: { ascending: boolean } = { ascending: true }): this {
    this.orderClause = { column, ascending: options.ascending };
    return this;
  }

  range(from: number, to: number): this {
    this.offsetCount = from;
    this.limitCount = Math.max(0, to - from + 1);
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): Promise<{ data: unknown; error: unknown }> {
    this.isSingle = true;
    return this.execute();
  }

  maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    this.isMaybeSingle = true;
    return this.execute();
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute(): Promise<{ data: unknown; error: unknown }> {
    try {
      const client = await getPGlite();
      const params: unknown[] = [];
      let paramIndex = 1;

      if (this.action === 'insert') {
        const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData!];
        if (rows.length === 0) return { data: [], error: null };

        const insertedRows: unknown[] = [];
        for (const row of rows) {
          const keys = Object.keys(row);
          const cols = keys.map((k) => `"${k}"`).join(', ');
          const rowParams: unknown[] = [];
          const placeholders = keys
            .map((k, idx) => {
              rowParams.push(row[k]);
              return `$${idx + 1}`;
            })
            .join(', ');

          const insertSql = `INSERT INTO public."${this.tableName}" (${cols}) VALUES (${placeholders}) RETURNING *`;
          const res = await client.query(insertSql, rowParams);
          insertedRows.push(res.rows[0]);
        }

        const data = Array.isArray(this.insertData) ? insertedRows : insertedRows[0];
        return { data, error: null };

      }

      if (this.action === 'upsert') {
        const rows = Array.isArray(this.insertData) ? this.insertData : [this.insertData!];
        if (rows.length === 0) return { data: [], error: null };

        for (const row of rows) {
          const keys = Object.keys(row);
          const cols = keys.map((k) => `"${k}"`).join(', ');
          const conflictCol = this.conflictKey || 'id';
          const updateKeys = keys.filter((k) => k !== conflictCol);
          const updateAssignments = updateKeys
            .map((k) => `"${k}" = EXCLUDED."${k}"`)
            .join(', ');

          const rowParams: unknown[] = [];
          const placeholders = keys
            .map((k) => {
              rowParams.push(row[k]);
              return `$${rowParams.length}`;
            })
            .join(', ');

          const upsertSql =
            updateAssignments.length > 0
              ? `INSERT INTO public."${this.tableName}" (${cols}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO UPDATE SET ${updateAssignments}`
              : `INSERT INTO public."${this.tableName}" (${cols}) VALUES (${placeholders}) ON CONFLICT ("${conflictCol}") DO NOTHING`;

          await client.query(upsertSql, rowParams);
        }

        return { data: rows, error: null };
      }

      if (this.action === 'update') {
        const keys = Object.keys(this.updateData || {});
        if (keys.length === 0) return { data: null, error: null };

        const setClause = keys
          .map((k) => {
            params.push(this.updateData![k]);
            return `"${k}" = $${paramIndex++}`;
          })
          .join(', ');

        const whereClauses: string[] = [];
        for (const f of this.filters) {
          params.push(f.value);
          whereClauses.push(`"${f.column}" = $${paramIndex++}`);
        }
        for (const inF of this.inFilters) {
          if (!inF.values || inF.values.length === 0) {
            whereClauses.push('1 = 0');
          } else {
            const placeholders = inF.values
              .map((v) => {
                params.push(v);
                return `$${paramIndex++}`;
              })
              .join(', ');
            whereClauses.push(`"${inF.column}" IN (${placeholders})`);
          }
        }
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const updateSql = `UPDATE public."${this.tableName}" SET ${setClause} ${whereClause} RETURNING *`;
        const res = await client.query(updateSql, params);

        if (this.isSingle || this.isMaybeSingle) {
          const row = res.rows[0] ?? null;
          return { data: row, error: null };
        }
        return { data: res.rows, error: null };
      }

      if (this.action === 'delete') {
        const whereClauses: string[] = [];
        for (const f of this.filters) {
          params.push(f.value);
          whereClauses.push(`"${f.column}" = $${paramIndex++}`);
        }
        for (const inF of this.inFilters) {
          if (!inF.values || inF.values.length === 0) {
            whereClauses.push('1 = 0');
          } else {
            const placeholders = inF.values
              .map((v) => {
                params.push(v);
                return `$${paramIndex++}`;
              })
              .join(', ');
            whereClauses.push(`"${inF.column}" IN (${placeholders})`);
          }
        }
        const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        const deleteSql = `DELETE FROM public."${this.tableName}" ${whereClause} RETURNING *`;
        const res = await client.query(deleteSql, params);

        if (this.isSingle || this.isMaybeSingle) {
          const row = res.rows[0] ?? null;
          return { data: row, error: null };
        }
        return { data: res.rows, error: null };
      }

      // Action: select
      const whereClauses: string[] = [];
      for (const f of this.filters) {
        params.push(f.value);
        whereClauses.push(`"${f.column}" = $${paramIndex++}`);
      }
      for (const inF of this.inFilters) {
        if (!inF.values || inF.values.length === 0) {
          whereClauses.push('1 = 0');
        } else {
          const placeholders = inF.values
            .map((v) => {
              params.push(v);
              return `$${paramIndex++}`;
            })
            .join(', ');
          whereClauses.push(`"${inF.column}" IN (${placeholders})`);
        }
      }
      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      let orderSql = '';
      if (this.orderClause) {
        orderSql = `ORDER BY "${this.orderClause.column}" ${this.orderClause.ascending ? 'ASC' : 'DESC'}`;
      }

      let paginationSql = '';
      if (this.limitCount !== undefined) {
        paginationSql += `LIMIT ${this.limitCount} `;
      }
      if (this.offsetCount !== undefined) {
        paginationSql += `OFFSET ${this.offsetCount} `;
      }

      const selectCols = this.selectColumns === '*' ? '*' : this.selectColumns;
      const selectSql = `SELECT ${selectCols} FROM public."${this.tableName}" ${whereSql} ${orderSql} ${paginationSql}`.trim();

      const res = await client.query(selectSql, params);

      if (this.isSingle) {
        if (res.rows.length === 0) {
          return {
            data: null,
            error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
          };
        }
        return { data: res.rows[0], error: null };
      }

      if (this.isMaybeSingle) {
        return { data: res.rows[0] ?? null, error: null };
      }

      return { data: res.rows, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { data: null, error: { message, code: 'QUERY_ERROR' } };
    }
  }
}

export function createPGliteClient() {
  return {
    from(tableName: string) {
      return new PGliteQueryBuilder(tableName);
    },
  };
}

export const pgliteClient = createPGliteClient();
