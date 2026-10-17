import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pgliteClient } from '../../lib/db/pglite';
import type { Database } from '../../lib/db/types';

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isPlaceholder = (value: string | undefined) =>
  !value ||
  process.env.USE_PGLITE === 'true' ||
  value.includes('your-project') ||
  value.includes('placeholder-project') ||
  value.includes('your-service-role-key') ||
  value.includes('placeholder-service-role-key') ||
  value.includes('test.supabase.co') ||
  value.includes('test-service-role-key');

export const isSupabaseConfigured = Boolean(
  !isPlaceholder(configuredSupabaseUrl) && !isPlaceholder(configuredServiceRoleKey)
);

class HttpQueryBuilder {
  private tableName: string;
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private selectColumns = '*';
  private filters: Array<{ column: string; value: unknown }> = [];
  private inFilters: Array<{ column: string; values: unknown[] }> = [];
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const secret = process.env.MCP_SERVER_SECRET;

    const payload = {
      tableName: this.tableName,
      action: this.action,
      selectColumns: this.selectColumns,
      data: this.action === 'update' ? this.updateData : this.insertData,
      filters: this.filters,
      inFilters: this.inFilters,
      orderClause: this.orderClause,
      limitCount: this.limitCount,
      offsetCount: this.offsetCount,
      conflictKey: this.conflictKey,
      isSingle: this.isSingle,
      isMaybeSingle: this.isMaybeSingle,
    };

    try {
      const res = await fetch(`${appUrl}/api/internal/db`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { data: null, error: { message: `Internal DB error ${res.status}: ${errorText}` } };
      }

      const json = await res.json();
      return json;
    } catch {
      // If HTTP proxy fails (e.g. Next.js server not running in standalone mode), fall back directly to local PGlite
      try {
        const fallback = pgliteClient.from(this.tableName);
        if (this.action === 'insert') fallback.insert(this.insertData!);
        else if (this.action === 'update') fallback.update(this.updateData ?? {});
        else if (this.action === 'delete') fallback.delete();
        else if (this.action === 'upsert') fallback.upsert(this.insertData!, { onConflict: this.conflictKey });
        else fallback.select(this.selectColumns);

        for (const f of this.filters) fallback.eq(f.column, f.value);
        for (const inF of this.inFilters) fallback.in(inF.column, inF.values);
        if (this.orderClause) fallback.order(this.orderClause.column, { ascending: this.orderClause.ascending });
        if (this.limitCount !== undefined) fallback.limit(this.limitCount);
        if (this.offsetCount !== undefined) fallback.range(this.offsetCount, this.offsetCount + (this.limitCount ?? 10) - 1);

        if (this.isSingle) return await fallback.single();
        if (this.isMaybeSingle) return await fallback.maybeSingle();
        return await fallback.execute();
      } catch (fallbackErr: unknown) {
        const message = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        return { data: null, error: { message, code: 'FETCH_AND_FALLBACK_ERROR' } };
      }
    }
  }
}

export function createHttpDbClient() {
  return {
    from(tableName: string) {
      return new HttpQueryBuilder(tableName);
    },
  };
}

/**
 * Returns a Supabase-compatible client:
 * - Real Supabase client if configured with non-placeholder credentials
 * - In-memory PGlite client in tests (PG_IN_MEMORY=true)
 * - HTTP DB proxy client talking to Next.js in local multi-process development
 */
export function getMcpDbClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key && !isPlaceholder(url) && !isPlaceholder(key)) {
    return createClient<Database>(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  if (process.env.PG_IN_MEMORY === 'true') {
    return pgliteClient as unknown as SupabaseClient<Database>;
  }

  return createHttpDbClient() as unknown as SupabaseClient<Database>;
}
