import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DatabaseError } from './errors';
import type { Database } from './types';
import { pgliteClient } from './pglite';

// This module is SERVER-ONLY. Never import it in client components.
// The SERVICE_ROLE_KEY has full DB access and must stay server-side.

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const configuredAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Keep module imports safe during local builds where .env.local is not present.
// The service layer rejects these placeholders before making a request.
const supabaseUrl = configuredSupabaseUrl || 'https://placeholder-project.supabase.co';
const serviceRoleKey = configuredServiceRoleKey || 'placeholder-service-role-key';
const anonKey = configuredAnonKey || 'placeholder-anon-key';

const isPlaceholder = (value: string | undefined) =>
  !value ||
  value.includes('your-project') ||
  value.includes('placeholder-project') ||
  value.includes('your-service-role-key') ||
  value.includes('placeholder-service-role-key');

export const isSupabaseConfigured = Boolean(
  !isPlaceholder(configuredSupabaseUrl) && !isPlaceholder(configuredServiceRoleKey)
);

/**
 * Server-side Supabase client with service-role access.
 * Use this in API route handlers and server actions only.
 */
export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Return the configured privileged client or a stable configuration error.
 * Keeping this guard in the server-only module prevents accidental requests
 * with placeholder credentials in development and tests.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!isSupabaseConfigured) {
    if (process.env.STRICT_SUPABASE === 'true') {
      throw new DatabaseError(
        'configuration',
        'Supabase server credentials are not configured.',
        { operation: 'initialize Supabase admin client' }
      );
    }
    return pgliteClient as unknown as SupabaseClient<Database>;
  }
  return supabaseAdmin as unknown as SupabaseClient<Database>;
}

/**
 * Return the configured database client:
 * - Supabase service-role client if configured
 * - Embedded PGlite PostgreSQL client if Supabase is unconfigured
 */
export function getDatabaseClient(): SupabaseClient<Database> {
  try {
    return getSupabaseAdmin();
  } catch {
    return pgliteClient as unknown as SupabaseClient<Database>;
  }
}

/**
 * Public Supabase client using anon key.
 * Safe for read-only public operations.
 */
export const supabasePublic = createClient(supabaseUrl, anonKey);
