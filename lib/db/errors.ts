import { z } from 'zod';

export type DatabaseErrorCode =
  | 'configuration'
  | 'validation'
  | 'not_found'
  | 'conflict'
  | 'query_failed';

export interface DatabaseErrorOptions {
  operation: string;
  supabaseCode?: string;
  details?: unknown;
  hint?: string | null;
}

/**
 * Stable error shape exposed by the server-side data access layer.
 * Callers do not need to know the PostgREST error object shape.
 */
export class DatabaseError extends Error {
  readonly code: DatabaseErrorCode;
  readonly operation: string;
  readonly supabaseCode?: string;
  readonly details?: unknown;
  readonly hint?: string | null;

  constructor(
    code: DatabaseErrorCode,
    message: string,
    options: DatabaseErrorOptions
  ) {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
    this.operation = options.operation;
    this.supabaseCode = options.supabaseCode;
    this.details = options.details;
    this.hint = options.hint;
  }
}

export function isDatabaseError(error: unknown): error is DatabaseError {
  return error instanceof DatabaseError;
}

export function validationDatabaseError(
  operation: string,
  error: z.ZodError
): DatabaseError {
  return new DatabaseError('validation', `Invalid input for ${operation}`, {
    operation,
    details: error.flatten(),
  });
}

/**
 * Convert Supabase/PostgREST failures into the stable error shape used by all
 * service functions.  Callers can branch on a small stable code union while
 * the provider code/details remain available for server-side diagnostics.
 */
export function normalizeSupabaseError(
  error: unknown,
  operation: string
): DatabaseError {
  if (isDatabaseError(error)) return error;

  const candidate = (error ?? {}) as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const supabaseCode = typeof candidate.code === 'string' ? candidate.code : undefined;
  const code: DatabaseErrorCode =
    supabaseCode === 'PGRST116'
      ? 'not_found'
      : supabaseCode === '23505'
        ? 'conflict'
        : 'query_failed';
  const providerMessage =
    typeof candidate.message === 'string' && candidate.message.length > 0
      ? candidate.message
      : 'The database operation failed.';

  return new DatabaseError(code, `Database ${operation} failed: ${providerMessage}`, {
    operation,
    supabaseCode,
    details: candidate.details,
    hint: typeof candidate.hint === 'string' ? candidate.hint : null,
  });
}
