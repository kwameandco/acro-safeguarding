-- Safeguarding incident log — GDPR-safe, community-scoped.
--
-- Ported from SLAC's 20260817120000 and adapted to the access model K chose
-- for the cross-community hub (2026-08-27): **community-scoped reads**.
--
--   * Any active member can RAISE a concern (INSERT) — reporting friction is
--     the enemy of safeguarding, so this stays the widest predicate here.
--   * Safeguarding leads and owners read and work EVERY incident (the global
--     case view).
--   * An ordinary member reads and works incidents tagged to THEIR OWN
--     community (profiles.community_id, settable only by admin RPC). The
--     members of this portal are their communities' safeguarding officers —
--     the community's incidents are their case load, so scoped read implies
--     scoped work: status updates and notes, within the same boundary.
--     ⚠ Consequence K should be aware of (flagged in the handover): unlike
--     SLAC, a reporter whose community matches CAN see their own report and
--     its follow-up trail. An incident too sensitive for its community's own
--     officer belongs to NO community (community_id NULL) → leads/owner only.
--   * An incident with community_id IS NULL is visible to leads/owners ONLY.
--     The report form says this out loud, so "which community?" is an
--     informed choice, not a metadata nicety.
--
-- Unchanged SLAC principles, deliberate then and deliberate now:
--   1. `incident_notes` is APPEND-ONLY — INSERT+SELECT grants, no UPDATE, no
--      DELETE, no policy for either. An editable audit trail is not an audit
--      trail.
--   2. NO DELETE policy or grant anywhere. Safeguarding records are not
--      deletable through the app, full stop. (Retention/erasure is a
--      documented manual process — docs/GDPR.md — not an app button.)
--   3. REVOKE ALL first on both tables: platform default privileges grant
--      anon/authenticated ALL on new relations, and a GRANT is checked
--      before RLS is evaluated.
--   4. Data minimisation is designed into the FORM (guidance copy, initials
--      not full names where possible), not bolted on: the columns below are
--      the maximum, not the target.
--
-- Future public anonymous form (K, 2026-08-27: same app, public route,
-- built later): the schema is shaped for it NOW —
--   * `reported_by` is nullable; `source` distinguishes 'team' from 'public'.
--   * The team INSERT policy pins source='team' AND reported_by=auth.uid(),
--     so the public path CANNOT ride through it: anonymous submissions will
--     arrive via a rate-limited SECURITY DEFINER RPC (with source='public',
--     reported_by NULL) added in that later migration. anon has NO grants
--     here today.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

-- ── Human-quotable reference ────────────────────────────────────────────────
-- 'ASH-IR-' + 6 hex chars — quotable in an email or phone call without
-- exposing a uuid, and visibly an incident reference at a glance.
CREATE OR REPLACE FUNCTION public.generate_incident_reference()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'ASH-IR-' || upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 6));
$$;

REVOKE EXECUTE ON FUNCTION public.generate_incident_reference() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.generate_incident_reference() TO authenticated;

-- ── Visibility predicate ────────────────────────────────────────────────────
-- One definition shared by every policy on both tables (the
-- duplicated-predicate trap: AP fixed a storage bug in one of four copies of
-- the same clause and shipped the other three broken).
CREATE OR REPLACE FUNCTION public.can_work_incident(incident_community uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_safeguarding_lead()
      OR public.is_portal_owner()
      OR (
        incident_community IS NOT NULL
        AND incident_community = public.my_community_id()
        AND public.is_active_member()
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_work_incident(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_work_incident(uuid) TO authenticated;

-- ── incident_reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference    text NOT NULL UNIQUE DEFAULT public.generate_incident_reference(),

  -- Nullable for the future public anonymous form; the team INSERT policy
  -- below pins it to the reporter for source='team'.
  reported_by  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,

  -- CHECK-constraint enum: widen together with `IncidentSource` in
  -- lib/incidents/types.ts, same migration/session. Same rule for severity,
  -- category and status below.
  source text NOT NULL DEFAULT 'team'
    CHECK (source IN ('team', 'public')),

  -- Which community the incident concerns. RESTRICT, not SET NULL: silently
  -- nulling this on a community delete would silently WIDEN nothing and
  -- NARROW reads to leads-only — either way a scoping change nobody chose.
  -- Communities deactivate instead of deleting (20260827120200).
  community_id uuid REFERENCES public.communities (id) ON DELETE RESTRICT,

  occurred_at  timestamptz,
  location     text,

  -- Free text: the person a concern is about is very often not a profiles
  -- row. The form asks for initials or first name + context, not full
  -- identifying detail, unless genuinely needed (data minimisation).
  subject_name    text,
  subject_contact text,
  involves_minor  boolean NOT NULL DEFAULT false,

  severity text NOT NULL
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  category text NOT NULL
    CHECK (category IN ('welfare', 'conduct', 'injury', 'boundary', 'disclosure', 'other')),

  summary       text NOT NULL,
  detail        text,
  actions_taken text,

  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'investigating', 'referred', 'resolved', 'closed')),
  referred_to  text,
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.incident_reports IS
  'Safeguarding incident log. Reads/updates: leads + owners everywhere, members '
  'within their own community (can_work_incident). NULL community = leads/owner '
  'only. No deletes through the app. See migration 20260827120800 header.';

CREATE INDEX IF NOT EXISTS incident_reports_status_idx
  ON public.incident_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS incident_reports_community_idx
  ON public.incident_reports (community_id, created_at DESC);

DROP TRIGGER IF EXISTS incident_reports_touch_updated_at ON public.incident_reports;
CREATE TRIGGER incident_reports_touch_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── incident_notes — append-only follow-up trail ────────────────────────────
CREATE TABLE IF NOT EXISTS public.incident_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incident_reports (id) ON DELETE CASCADE,
  author_id   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.incident_notes IS
  'Append-only follow-up trail on an incident_reports row. INSERT+SELECT only — '
  'no UPDATE, no DELETE, no policy for either. An editable audit trail is not '
  'an audit trail.';

CREATE INDEX IF NOT EXISTS incident_notes_incident_idx
  ON public.incident_notes (incident_id, created_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_notes   ENABLE ROW LEVEL SECURITY;

-- Any active member may raise a concern. Widest predicate in this migration,
-- deliberately. source and reported_by are pinned so the team path cannot
-- impersonate the future public one (or another member).
DROP POLICY IF EXISTS "incident insert active member" ON public.incident_reports;
CREATE POLICY "incident insert active member" ON public.incident_reports
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_active_member()
    AND source = 'team'
    AND reported_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "incident select scoped" ON public.incident_reports;
CREATE POLICY "incident select scoped" ON public.incident_reports
  FOR SELECT TO authenticated
  USING (public.can_work_incident(community_id));

-- WITH CHECK re-runs the predicate against the NEW row, so a member cannot
-- move an incident out of their own scope (e.g. re-tag it to another
-- community or clear the tag) — that direction is leads/owner only.
DROP POLICY IF EXISTS "incident update scoped" ON public.incident_reports;
CREATE POLICY "incident update scoped" ON public.incident_reports
  FOR UPDATE TO authenticated
  USING (public.can_work_incident(community_id))
  WITH CHECK (public.can_work_incident(community_id));

-- No DELETE policy on incident_reports. Not deletable through the app.

DROP POLICY IF EXISTS "incident notes insert scoped" ON public.incident_notes;
CREATE POLICY "incident notes insert scoped" ON public.incident_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id = incident_id AND public.can_work_incident(r.community_id)
    )
  );

DROP POLICY IF EXISTS "incident notes select scoped" ON public.incident_notes;
CREATE POLICY "incident notes select scoped" ON public.incident_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incident_reports r
      WHERE r.id = incident_id AND public.can_work_incident(r.community_id)
    )
  );

-- No UPDATE/DELETE policy on incident_notes. Append-only.

-- ── GRANTs ──────────────────────────────────────────────────────────────────
REVOKE ALL ON public.incident_reports FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.incident_notes   FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.incident_reports TO authenticated;
GRANT SELECT, INSERT         ON public.incident_notes   TO authenticated;
-- Deliberately: no UPDATE/DELETE grant on incident_notes (append-only), no
-- DELETE grant on either table, and NOTHING for anon — the future public form
-- goes through its own SECURITY DEFINER RPC, not table grants.

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120800', 'incident_reports', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT polname FROM pg_policy WHERE polrelid='public.incident_reports'::regclass;
-- SELECT polname FROM pg_policy WHERE polrelid='public.incident_notes'::regclass;
--   -- expect exactly the five policies above; nothing FOR DELETE.
-- SELECT has_table_privilege('authenticated','public.incident_reports','DELETE'),
--        has_table_privilege('authenticated','public.incident_notes','UPDATE'),
--        has_table_privilege('anon','public.incident_reports','SELECT');
--   -- expect f, f, f
-- Scoping round-trip once live (SET LOCAL request.jwt.claims per role):
--   member of community A: SELECT sees A-tagged incidents only, not B, not NULL;
--   lead: sees all three; member UPDATE re-tagging A→B → expect RLS rejection.
