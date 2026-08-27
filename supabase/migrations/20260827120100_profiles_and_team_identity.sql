-- Acro Safeguarding Hub — team identity.
--
-- `profiles` is the app-side mirror of `auth.users`. Every gate in this portal
-- (RLS policies, the nav, the invite flow) reads from here, so it exists
-- before anything else.
--
-- Ported from SLAC's 20260812120000 with three deliberate changes:
--
--   1. Role model is `owner`/`member` + flags, per K 2026-08-27. Portal powers
--      compose via `is_admin` (team management, announcements) and
--      `is_safeguarding_lead` (global incident access) rather than job-title
--      roles — a cross-community safeguarding team has no coach/volunteer
--      split. The matching TS union is `TeamRole` in
--      lib/supabase/cached-server.ts: widen BOTH together, same migration,
--      or not at all.
--   2. Team-wide profile read for every active member, not admins only. This
--      portal is a collaboration hub (K, 2026-08-27: "collaboration and
--      resources sharing and communication and coordination primarily") —
--      assignee pickers, event authors and announcement bylines all need the
--      member list. SLAC hid it from non-admins; here that would fight the
--      product.
--   3. The column-grant hardening SLAC had to retrofit (its 20260817130000
--      CRITICAL fix: platform default privileges left `role`/`is_admin`
--      self-writable, a one-line privilege escalation) is baked in from the
--      start: REVOKE ALL first, then grant back exactly what the app uses.
--      A row policy constrains WHICH ROWS a member may write, never WHICH
--      COLUMNS — column scope is the GRANT's job, and only the GRANT's.
--
-- `is_safeguarding_lead` is defined here (not in the incidents migration)
-- because it is identity, and because the predicate vocabulary every later
-- policy uses should exist in one place. It is NOT in the self-update grant
-- and must never be added to it — only admin_set_safeguarding_lead()
-- (owner-only SECURITY DEFINER RPC, migration 20260827120300) sets it. If a
-- member could self-update this column, anyone could grant themselves access
-- to every community's incident reports.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email        text,
  display_name text,
  avatar_url   text,
  bio          text,

  -- CHECK-constraint enum: widen together with the `TeamRole` TS union in
  -- lib/supabase/cached-server.ts, in the same migration/session.
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'member')),

  -- Portal authority flags. Separate from `role` on purpose: powers compose.
  is_admin             boolean NOT NULL DEFAULT false,
  is_safeguarding_lead boolean NOT NULL DEFAULT false,

  -- Deactivation instead of deletion: a departed member keeps their audit
  -- trail (tasks created, incident notes authored) while losing all access.
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'Members of the cross-community safeguarding team. One row per auth.users row, created by trigger.';
COMMENT ON COLUMN public.profiles.is_admin IS
  'Portal management authority (team page, invites, announcements). Distinct from role.';
COMMENT ON COLUMN public.profiles.is_safeguarding_lead IS
  'Grants GLOBAL read/work access to incident_reports and incident_notes across every '
  'community. Settable only via admin_set_safeguarding_lead() (owner-only SECURITY DEFINER '
  'RPC) — NOT in the self-update column grant. Never widen that grant to include it.';

-- ── Row creation ───────────────────────────────────────────────────────────
-- The row is created by trigger on signup, never by the app. Application code
-- must therefore always UPDATE, never INSERT or UPSERT — an upsert races the
-- trigger and silently clobbers trigger-set defaults. (This function is
-- replaced in 20260827120300 to also consume the signup invite.)

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger functions need no EXECUTE grant to fire; Supabase's default
-- privileges hand one to anon/authenticated anyway. Remove the needless
-- surface now rather than after an advisor flags it (SLAC's 20260817090000).
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- ── updated_at ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── Predicate vocabulary ───────────────────────────────────────────────────
-- Every policy in this portal calls these rather than inlining the EXISTS.
--
-- SECURITY DEFINER is load-bearing: a policy on `profiles` that queries
-- `profiles` recurses, and Postgres raises "infinite recursion detected in
-- policy". A definer function runs with the owner's rights and does not
-- re-enter RLS, which breaks the cycle. Do not "simplify" these back inline.

CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_portal_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.is_admin = true
      AND profiles.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_portal_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.role = 'owner'
      AND profiles.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_safeguarding_lead()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = (SELECT auth.uid())
      AND profiles.is_safeguarding_lead = true
      AND profiles.is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_member()      FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_portal_admin()       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_portal_owner()       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_safeguarding_lead()  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_active_member()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_portal_admin()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_portal_owner()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_safeguarding_lead()   TO authenticated;

-- ── RLS + GRANTs ───────────────────────────────────────────────────────────
-- GRANTs are required ALONGSIDE RLS. Without them the policies evaluate and
-- the query still returns nothing, with no error — a silent empty result that
-- reads as "no data" rather than "no permission".

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- REVOKE ALL first: Supabase's platform default privileges grant
-- anon/authenticated ALL on every new relation, and a GRANT is checked before
-- RLS is ever evaluated. See header §3 for what that cost SLAC.
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url, bio) ON public.profiles TO authenticated;
-- No INSERT grant for anyone: rows come from the handle_new_user trigger
-- (SECURITY DEFINER) only. No DELETE: removal is admin_remove_member's job.
-- No grant to anon: nothing about the team is public.

DROP POLICY IF EXISTS "profiles self read" ON public.profiles;
CREATE POLICY "profiles self read" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

-- Change §2: every active member reads the team list, not admins only.
DROP POLICY IF EXISTS "profiles team read" ON public.profiles;
CREATE POLICY "profiles team read" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP POLICY IF EXISTS "profiles self update" ON public.profiles;
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
-- The column GRANT above is what stops a member editing their own
-- role/is_admin/is_safeguarding_lead/community_id. The row policy alone
-- would let them. Keep the column list.

DROP POLICY IF EXISTS "profiles admin update" ON public.profiles;
CREATE POLICY "profiles admin update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_portal_admin())
  WITH CHECK (public.is_portal_admin());
-- Largely inert for privileged columns (admins hold the same column grant),
-- by design: role/flags/community changes go through the SECURITY DEFINER
-- RPCs in 20260827120300, which re-check the caller inside the database.

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120100', 'profiles_and_team_identity', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify (run separately with execute_sql; do not trust "MCP succeeded") ──
-- SELECT column_name FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles' ORDER BY ordinal_position;
-- SELECT polname FROM pg_policy WHERE polrelid='public.profiles'::regclass;
-- SELECT proname FROM pg_proc WHERE proname IN
--   ('handle_new_user','touch_updated_at','is_active_member','is_portal_admin',
--    'is_portal_owner','is_safeguarding_lead');
-- SELECT grantee, privilege_type, column_name FROM information_schema.column_privileges
--   WHERE table_name='profiles' AND grantee='authenticated';
--   -- expect UPDATE rows for display_name, avatar_url, bio ONLY.
-- SELECT has_table_privilege('anon','public.profiles','SELECT'); -- expect f
