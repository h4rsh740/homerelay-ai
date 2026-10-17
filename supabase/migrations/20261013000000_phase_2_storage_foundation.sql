-- HomeRelay AI Phase 2 storage foundation
--
-- This migration is the canonical source of truth for the application data
-- tables.  It intentionally does not seed demo data; seed data belongs in a
-- separate, explicitly opt-in migration or deployment step.

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
END $$;

-- Keep mutable records' timestamps consistent even when callers omit
-- updated_at.  execution_logs is append-only and therefore has no updated_at.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

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

COMMENT ON TABLE public.demo_parcels IS
  '[SIMULATED DATA] Demo records only; no real carrier API data is stored.';

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

-- If the earlier prototype schema was applied, preserve its demo rows while
-- moving the application onto the canonical Phase 2 table names.  Both legacy
-- tables are optional, so this block is safe on a fresh Supabase project.
DO $$
BEGIN
  IF to_regclass('public.parcels') IS NOT NULL THEN
    INSERT INTO public.demo_parcels (
      tracking_number,
      carrier,
      status,
      description,
      estimated_delivery,
      simulated,
      created_at,
      updated_at
    )
    SELECT
      p.tracking_number,
      'SIMULATED',
      p.status,
      CASE
        WHEN COALESCE(p.description, '') LIKE '[SIMULATED DATA]%' THEN p.description
        ELSE '[SIMULATED DATA] ' || COALESCE(p.description, 'Legacy demo parcel')
      END,
      p.estimated_delivery,
      TRUE,
      p.created_at,
      COALESCE(p.last_updated, p.created_at)
    FROM public.parcels AS p
    ON CONFLICT (tracking_number) DO NOTHING;
  END IF;

  IF to_regclass('public.execution_history') IS NOT NULL THEN
    INSERT INTO public.execution_logs (
      id,
      session_id,
      prompt,
      plan_json,
      step_index,
      tool_name,
      tool_input,
      tool_output,
      status,
      error_message,
      duration_ms,
      created_at
    )
    SELECT
      h.id,
      h.session_id,
      h.prompt,
      h.plan_json,
      h.step_index,
      h.tool_name,
      h.tool_input,
      h.tool_output,
      h.status,
      h.error_message,
      h.duration_ms,
      h.created_at
    FROM public.execution_history AS h
    ON CONFLICT (id) DO NOTHING;
  END IF;
END
$$;

-- Query indexes support the primary list/filter/lookup paths.
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks (due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reminders_is_sent_remind_at
  ON public.reminders (is_sent, remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at
  ON public.reminders (remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_created_at
  ON public.reminders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_demo_parcels_status ON public.demo_parcels (status);
CREATE INDEX IF NOT EXISTS idx_demo_parcels_updated_at
  ON public.demo_parcels (updated_at DESC);
-- The UNIQUE constraint on tracking_number supplies the lookup index.

CREATE INDEX IF NOT EXISTS idx_execution_logs_session_id
  ON public.execution_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_created_at
  ON public.execution_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_execution_logs_status ON public.execution_logs (status);

DROP TRIGGER IF EXISTS tasks_set_updated_at ON public.tasks;
CREATE TRIGGER tasks_set_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS reminders_set_updated_at ON public.reminders;
CREATE TRIGGER reminders_set_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS demo_parcels_set_updated_at ON public.demo_parcels;
CREATE TRIGGER demo_parcels_set_updated_at
  BEFORE UPDATE ON public.demo_parcels
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- RLS is deny-by-default for both public API roles.  The service_role key
-- bypasses RLS and is used only from the server-side data access layer.  When
-- authentication is added, these policies must be replaced deliberately with
-- owner/household-scoped policies before authenticated data is exposed.
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execution_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_anon_no_access ON public.tasks;
CREATE POLICY tasks_anon_no_access
  ON public.tasks
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS reminders_anon_no_access ON public.reminders;
CREATE POLICY reminders_anon_no_access
  ON public.reminders
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS demo_parcels_anon_no_access ON public.demo_parcels;
CREATE POLICY demo_parcels_anon_no_access
  ON public.demo_parcels
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);

DROP POLICY IF EXISTS execution_logs_anon_no_access ON public.execution_logs;
CREATE POLICY execution_logs_anon_no_access
  ON public.execution_logs
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (FALSE)
  WITH CHECK (FALSE);
