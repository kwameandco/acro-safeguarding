-- Shared calendar — meetings, training, community events, deadlines.
--
-- Shared-pool scoping (K, 2026-08-27): the whole team sees the whole calendar;
-- `community_id` tags an entry to a community for filtering and display only.
-- Timestamps are stored UTC and rendered Europe/London via lib/shared/time.ts
-- — the datetime-local inputs go through londonLocalToUtcIso/utcToLondonLocal,
-- never `new Date(value)` (which would shift every summer entry by an hour).
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  location     text,

  -- CHECK-constraint enum: widen together with `CalendarKind` in
  -- lib/calendar/types.ts, same migration/session.
  kind text NOT NULL DEFAULT 'meeting'
    CHECK (kind IN ('meeting', 'training', 'community_event', 'deadline', 'other')),

  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz,
  all_day      boolean NOT NULL DEFAULT false,
  community_id uuid REFERENCES public.communities (id) ON DELETE SET NULL,
  created_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT calendar_events_ends_after_start
    CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

COMMENT ON TABLE public.calendar_events IS
  'Shared team calendar. community_id is a filter tag, not a boundary.';

CREATE INDEX IF NOT EXISTS calendar_events_starts_idx
  ON public.calendar_events (starts_at);

DROP TRIGGER IF EXISTS calendar_events_touch_updated_at ON public.calendar_events;
CREATE TRIGGER calendar_events_touch_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS + GRANTs ───────────────────────────────────────────────────────────
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;

DROP POLICY IF EXISTS "calendar member read" ON public.calendar_events;
CREATE POLICY "calendar member read" ON public.calendar_events
  FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP POLICY IF EXISTS "calendar member insert" ON public.calendar_events;
CREATE POLICY "calendar member insert" ON public.calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = (SELECT auth.uid()));

-- Edits and removals stay with the entry's creator or an admin — a calendar
-- rewrite is more disruptive than a board-card edit, so this is narrower than
-- board_tasks' any-member update.
DROP POLICY IF EXISTS "calendar update creator or admin" ON public.calendar_events;
CREATE POLICY "calendar update creator or admin" ON public.calendar_events
  FOR UPDATE TO authenticated
  USING (
    public.is_portal_admin() OR public.is_portal_owner()
    OR (public.is_active_member() AND created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_portal_admin() OR public.is_portal_owner()
    OR (public.is_active_member() AND created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "calendar delete creator or admin" ON public.calendar_events;
CREATE POLICY "calendar delete creator or admin" ON public.calendar_events
  FOR DELETE TO authenticated
  USING (
    public.is_portal_admin() OR public.is_portal_owner()
    OR (public.is_active_member() AND created_by = (SELECT auth.uid()))
  );

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120500', 'calendar_events', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT polname FROM pg_policy WHERE polrelid='public.calendar_events'::regclass;
-- INSERT a probe row as authenticated with ends_at < starts_at → expect
--   calendar_events_ends_after_start violation.
