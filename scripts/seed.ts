import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ReminderSeedSchema,
  SIMULATED_DATA_MARKER,
  SimulatedParcelSeedSchema,
  TaskSeedSchema,
  type ReminderSeed,
  type SimulatedParcelSeed,
  type TaskSeed,
} from '../lib/validators/schemas';

/** A visible marker shared by all non-parcel demo rows. */
export const DEMO_SEED_MARKER = '[DEMO]';

/**
 * These rows intentionally contain no credentials or carrier data. Stable
 * task/reminder IDs make the seed idempotent; parcels use their unique
 * tracking number as the conflict key.
 */
export const DEMO_TASKS: readonly TaskSeed[] = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    title: `${DEMO_SEED_MARKER} Restock pantry for Saturday dinner`,
    description: `${DEMO_SEED_MARKER} Simulated seed task for local development.`,
    priority: 'medium',
    status: 'pending',
    due_date: '2026-12-12T15:00:00Z',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    title: `${DEMO_SEED_MARKER} Replace the hallway light bulb`,
    description: `${DEMO_SEED_MARKER} Simulated seed task for local development.`,
    priority: 'low',
    status: 'in_progress',
    due_date: '2026-12-13T17:00:00Z',
  },
];

export const DEMO_REMINDERS: readonly ReminderSeed[] = [
  {
    id: '00000000-0000-4000-8000-000000000011',
    message: `${DEMO_SEED_MARKER} Set the table before Saturday dinner`,
    remind_at: '2026-12-12T17:00:00Z',
    is_sent: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000012',
    message: `${DEMO_SEED_MARKER} Water the herb garden`,
    remind_at: '2026-12-13T08:00:00Z',
    is_sent: false,
  },
];

export const DEMO_PARCELS: readonly SimulatedParcelSeed[] = [
  {
    tracking_number: 'DEMO-TRK-001',
    carrier: 'SIMULATED',
    status: 'in_transit',
    description: `${SIMULATED_DATA_MARKER} Demo package A - kitchen supplies.`,
    estimated_delivery: '2026-12-13T18:00:00Z',
  },
  {
    tracking_number: 'DEMO-TRK-002',
    carrier: 'SIMULATED',
    status: 'out_for_delivery',
    description: `${SIMULATED_DATA_MARKER} Demo package B - pantry items.`,
    estimated_delivery: '2026-12-12T20:00:00Z',
  },
  {
    tracking_number: 'DEMO-TRK-003',
    carrier: 'SIMULATED',
    status: 'delivered',
    description: `${SIMULATED_DATA_MARKER} Demo package C - household linens.`,
    estimated_delivery: '2026-12-11T16:00:00Z',
  },
  {
    tracking_number: 'DEMO-TRK-004',
    carrier: 'SIMULATED',
    status: 'processing',
    description: `${SIMULATED_DATA_MARKER} Demo package D - furniture sample.`,
    estimated_delivery: '2026-12-16T18:00:00Z',
  },
];

export type SeedPayload = {
  tasks: readonly TaskSeed[];
  reminders: readonly ReminderSeed[];
  demo_parcels: readonly SimulatedParcelSeed[];
};

export type SeedTable = keyof SeedPayload;

export type SeedClient = {
  from(table: SeedTable): {
    upsert(
      rows: readonly unknown[],
      options: { onConflict: string }
    ): PromiseLike<{ error: { message: string } | null }>;
  };
};

export type SupabaseSeedEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  [key: string]: string | undefined;
};

export type SeedOptions = {
  dryRun: boolean;
  allowUnconfigured: boolean;
  usePglite?: boolean;
  help: boolean;
};

export type SeedRunResult = {
  wrote: boolean;
  counts: { tasks: number; reminders: number; demo_parcels: number };
};

const PLACEHOLDER_VALUE_PATTERNS = [
  /^your[-_]/i,
  /your-project/i,
  /placeholder/i,
  /test(?:[-_.]|$)/i,
  /mock/i,
  /dummy/i,
  /example/i,
  /change[-_ ]?me/i,
  /replace[-_ ]?me/i,
];

const CREDENTIAL_FIELD_PATTERN = /(api[_-]?key|service[_-]?role|password|secret|access[_-]?token|authorization)/i;

/**
 * Return a fresh payload so callers cannot mutate the exported constants and
 * accidentally change a later seed operation in the same process.
 */
export function buildSeedPayload(): SeedPayload {
  return {
    tasks: DEMO_TASKS.map((task) => ({ ...task })),
    reminders: DEMO_REMINDERS.map((reminder) => ({ ...reminder })),
    demo_parcels: DEMO_PARCELS.map((parcel) => ({ ...parcel })),
  };
}

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  return PLACEHOLDER_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * The seed only needs the URL and service-role key. The anon key is not read
 * or required because all writes go through the server-only admin client.
 */
export function hasRealSupabaseEnv(env: SupabaseSeedEnv = process.env): boolean {
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (looksLikePlaceholder(url) || looksLikePlaceholder(serviceRoleKey)) return false;

  try {
    if (!url) return false;
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') return false;
  } catch {
    return false;
  }

  return true;
}

export function parseSeedArgs(args: readonly string[]): SeedOptions {
  const options: SeedOptions = {
    dryRun: false,
    allowUnconfigured: false,
    usePglite: false,
    help: false,
  };

  for (const arg of args) {
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--pglite':
      case '--local':
        options.usePglite = true;
        options.allowUnconfigured = true;
        break;
      case '--allow-unconfigured':
      case '--allow-placeholder':
      case '--allow-missing-env':
        options.allowUnconfigured = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown seed option: ${arg}`);
    }
  }

  return options;
}

export function assertSeedEnvironment(
  env: SupabaseSeedEnv,
  options: Pick<SeedOptions, 'dryRun' | 'allowUnconfigured'>
): void {
  if (hasRealSupabaseEnv(env) || options.dryRun || options.allowUnconfigured) return;

  throw new Error(
    'Refusing to seed without real NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY values. ' +
      'Set those variables or pass --pglite / --dry-run / --allow-unconfigured explicitly (no database writes are made without real values).'
  );
}

export function isSimulatedParcel(value: unknown): value is SimulatedParcelSeed {
  const parsed = SimulatedParcelSeedSchema.safeParse(value);
  return parsed.success && parsed.data.description.startsWith(SIMULATED_DATA_MARKER);
}

function containsCredentialField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsCredentialField);
  if (!value || typeof value !== 'object') return false;

  return Object.entries(value).some(([key, nestedValue]) => {
    return CREDENTIAL_FIELD_PATTERN.test(key) || containsCredentialField(nestedValue);
  });
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Demo ${label} must have unique conflict keys.`);
  }
}

/**
 * Validate the complete write set before touching Supabase. This protects the
 * simulation boundary as well as keeping credentials out of seed payloads.
 */
export function assertSeedPayloadSafety(payload: SeedPayload): void {
  if (containsCredentialField(payload)) {
    throw new Error('Seed payload contains a credential-like field. Refusing to write it.');
  }

  const configuredSecrets = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ].filter((secret): secret is string => Boolean(secret?.trim()));
  const serializedPayload = JSON.stringify(payload);
  if (configuredSecrets.some((secret) => serializedPayload.includes(secret))) {
    throw new Error('Seed payload contains a configured credential. Refusing to write it.');
  }

  assertUnique(payload.tasks.map((task) => task.id), 'task IDs');
  assertUnique(payload.reminders.map((reminder) => reminder.id), 'reminder IDs');
  assertUnique(payload.demo_parcels.map((parcel) => parcel.tracking_number), 'parcel tracking numbers');

  payload.tasks.forEach((task, index) => {
    if (!TaskSeedSchema.safeParse(task).success || !task.title.startsWith(DEMO_SEED_MARKER)) {
      throw new Error(`Demo task at index ${index} is not marked as simulated seed data.`);
    }
  });

  payload.reminders.forEach((reminder, index) => {
    if (
      !ReminderSeedSchema.safeParse(reminder).success ||
      !reminder.message.startsWith(DEMO_SEED_MARKER)
    ) {
      throw new Error(`Demo reminder at index ${index} is not marked as simulated seed data.`);
    }
  });

  payload.demo_parcels.forEach((parcel, index) => {
    if (!isSimulatedParcel(parcel)) {
      throw new Error(`Demo parcel at index ${index} is not clearly marked as simulated data.`);
    }
  });
}

async function upsertRows(
  client: SeedClient,
  table: SeedTable,
  rows: readonly unknown[],
  onConflict: string
): Promise<void> {
  const { error } = await client.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`Failed to seed ${table}: ${error.message}`);
}

/** Upsert all demo rows through the server-only Supabase service client. */
export async function seedDatabase(
  client: SeedClient,
  payload: SeedPayload = buildSeedPayload()
): Promise<SeedRunResult> {
  assertSeedPayloadSafety(payload);

  await upsertRows(client, 'tasks', payload.tasks, 'id');
  await upsertRows(client, 'reminders', payload.reminders, 'id');
  await upsertRows(client, 'demo_parcels', payload.demo_parcels, 'tracking_number');

  return {
    wrote: true,
    counts: {
      tasks: payload.tasks.length,
      reminders: payload.reminders.length,
      demo_parcels: payload.demo_parcels.length,
    },
  };
}

function loadLocalEnvironment(): void {
  // `tsx` does not load Next.js env files. Node 20+ provides the same small
  // loader needed for a local seed command without adding a dotenv dependency.
  if (typeof process.loadEnvFile !== 'function') return;

  // Load the more specific local file first because Node leaves an existing
  // process.env value untouched when a later file defines the same key.
  for (const fileName of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), fileName);
    if (existsSync(filePath)) process.loadEnvFile(filePath);
  }
}

function printSeedPayload(payload: SeedPayload): void {
  console.log(JSON.stringify(payload, null, 2));
}

function isDirectExecution(): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
}

export async function main(
  args: readonly string[] = process.argv.slice(2),
  env: SupabaseSeedEnv = process.env
): Promise<SeedRunResult> {
  const options = parseSeedArgs(args);
  const emptyResult: SeedRunResult = {
    wrote: false,
    counts: { tasks: 0, reminders: 0, demo_parcels: 0 },
  };

  if (options.help) {
    console.log(
      'Usage: npm run db:seed [--dry-run | --pglite | --allow-unconfigured]\n' +
        '  --pglite              Seed the local embedded PGlite PostgreSQL database.\n' +
        '  --dry-run             Print the validated demo payload without writing.\n' +
        '  --allow-unconfigured Explicitly allow no-write mode when Supabase env vars are placeholders.'
    );
    return emptyResult;
  }

  if (env === process.env && !options.dryRun) loadLocalEnvironment();

  const payload = buildSeedPayload();
  assertSeedEnvironment(env, options);

  if (options.dryRun) {
    assertSeedPayloadSafety(payload);
    printSeedPayload(payload);
    return emptyResult;
  }

  if (options.usePglite) {
    assertSeedPayloadSafety(payload);
    const { pgliteClient } = await import('../lib/db/pglite');
    const result = await seedDatabase(pgliteClient as unknown as SeedClient, payload);
    console.log(
      `[seed] PGlite: Upserted ${result.counts.tasks} tasks, ${result.counts.reminders} reminders, and ${result.counts.demo_parcels} simulated parcels.`
    );
    return result;
  }

  if (!hasRealSupabaseEnv(env)) {
    assertSeedPayloadSafety(payload);
    console.warn('[seed] Supabase is not configured; --allow-unconfigured was provided, so no writes were made.');
    printSeedPayload(payload);
    return emptyResult;
  }

  // Loaded only after the guard so an unconfigured invocation never creates a
  // client pointed at the placeholder defaults in lib/db/supabase.ts.
  const { getSupabaseAdmin } = await import('../lib/db/supabase');
  const result = await seedDatabase(getSupabaseAdmin() as unknown as SeedClient, payload);
  console.log(
    `[seed] Upserted ${result.counts.tasks} tasks, ${result.counts.reminders} reminders, and ${result.counts.demo_parcels} simulated parcels.`
  );
  return result;
}

if (isDirectExecution()) {
  void main()
    .then(() => {
      process.exit(0);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[seed] ${message}`);
      process.exit(1);
    });
}

