-- Communities — the "cross-community" in the hub's name.
--
-- Scoping decision (K, 2026-08-27): one team, one shared workspace. Tasks,
-- calendar entries and resources carry an OPTIONAL community tag used for
-- filtering and display only — every active member sees everything. The one
-- place the tag is load-bearing is incident_reports (20260827120800), where a
-- member's own `profiles.community_id` decides which incidents they can read.
--
-- Because community affiliation gates incident visibility, it is a PRIVILEGED
-- profile column: not in the self-update grant, settable only via
-- admin_set_member_community() (20260827120300). A member who could re-tag
-- themselves could walk into another community's incident log.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

CREATE TABLE IF NOT EXISTS public.communities (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  slug       text NOT NULL UNIQUE,
  -- Deactivate rather than delete: a community that leaves the network keeps
  -- its history (tagged tasks, incidents) intact.
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.communities IS
  'Member communities of the cross-community safeguarding network. Rows are '
  'deactivated, never deleted — incident scoping references them.';

DROP TRIGGER IF EXISTS communities_touch_updated_at ON public.communities;
CREATE TRIGGER communities_touch_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Profile affiliation ────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.community_id IS
  'The community this member represents. Gates community-scoped incident reads '
  '— privileged: settable only via admin_set_member_community(), NOT in the '
  'self-update column grant. Never widen that grant to include it.';

-- ── my_community_id() ──────────────────────────────────────────────────────
-- The community-scoped incident policies call this. SECURITY DEFINER for the
-- same profiles-recursion reason as the other predicates; returns NULL for a
-- deactivated member so scoped reads collapse to nothing.
CREATE OR REPLACE FUNCTION public.my_community_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_id FROM public.profiles
  WHERE profiles.id = (SELECT auth.uid())
    AND profiles.is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.my_community_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.my_community_id() TO authenticated;

-- ── RLS + GRANTs ───────────────────────────────────────────────────────────
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.communities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.communities TO authenticated;
-- No DELETE grant: deactivate instead (see table comment). No anon grant.

DROP POLICY IF EXISTS "communities member read" ON public.communities;
CREATE POLICY "communities member read" ON public.communities
  FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP POLICY IF EXISTS "communities admin insert" ON public.communities;
CREATE POLICY "communities admin insert" ON public.communities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_portal_admin() OR public.is_portal_owner());

DROP POLICY IF EXISTS "communities admin update" ON public.communities;
CREATE POLICY "communities admin update" ON public.communities
  FOR UPDATE TO authenticated
  USING (public.is_portal_admin() OR public.is_portal_owner())
  WITH CHECK (public.is_portal_admin() OR public.is_portal_owner());

-- ── Seed ───────────────────────────────────────────────────────────────────
-- South London Acro is the one founding community known today. Admins add the
-- rest from the Team page as the network firms up.
INSERT INTO public.communities (name, slug)
VALUES ('South London Acro', 'south-london-acro')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120200', 'communities', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT name, slug, is_active FROM public.communities;
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='profiles' AND column_name='community_id';
-- SELECT polname FROM pg_policy WHERE polrelid='public.communities'::regclass;
-- SELECT has_table_privilege('authenticated','public.communities','DELETE'); -- expect f
-- Column-grant probe (privilege escalation guard): as authenticated,
--   UPDATE public.profiles SET community_id = community_id WHERE id = auth.uid();
--   -- expect: permission denied (column not in the self-update grant)
