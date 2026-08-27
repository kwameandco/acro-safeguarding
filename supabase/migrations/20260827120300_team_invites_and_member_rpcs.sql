-- Invite-gated registration + member-management RPCs.
--
-- Ported from SLAC's 20260814200000 + 20260818180000 (invite link handoffs).
-- Nobody registers without an invite. The gate is enforced IN the database — a
-- trigger on auth.users — not by hiding the signup form: anyone can call
-- supabase.auth.signUp directly against the anon key, so a form is not a
-- boundary.
--
-- Adaptations for this portal:
--   * Invites carry role ('owner'|'member'), is_admin and community_id — the
--     community the newcomer will represent (gates their incident reads).
--     They deliberately do NOT carry is_safeguarding_lead: the lead flag is
--     handed out after arrival by the owner, eyes-open, via
--     admin_set_safeguarding_lead(). An invite email should never be the
--     thing that grants global incident access.
--   * Invite management is owner OR admin (SLAC: owner only) — admins run the
--     team page here. Role/active/removal and the lead flag stay owner-only.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_invites (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               text NOT NULL,
  role                text NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'member')),
  is_admin            boolean NOT NULL DEFAULT false,
  community_id        uuid REFERENCES public.communities (id) ON DELETE SET NULL,
  invited_by          uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at         timestamptz,
  accepted_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  revoked_at          timestamptz
);

-- One live invite per address: dupes are confusing and the gate query wants
-- an unambiguous row.
CREATE UNIQUE INDEX IF NOT EXISTS team_invites_live_email_idx
  ON public.team_invites (lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.team_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_invites TO authenticated;

DROP POLICY IF EXISTS "invites managers all" ON public.team_invites;
CREATE POLICY "invites managers all" ON public.team_invites
  FOR ALL TO authenticated
  USING (public.is_portal_owner() OR public.is_portal_admin())
  WITH CHECK (public.is_portal_owner() OR public.is_portal_admin());

-- ── The signup gate ────────────────────────────────────────────────────────
-- BEFORE INSERT on auth.users: no live invite, no account. The first user on
-- a completely fresh database is allowed through (bootstrap — someone has to
-- be able to become the owner), which is safe because at that point there is
-- nothing in the database to protect. docs/SUPABASE_SETUP.md step 5 promotes
-- that first account to role='owner'.
CREATE OR REPLACE FUNCTION public.enforce_invited_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (SELECT count(*) FROM auth.users) = 0 THEN
    RETURN NEW;  -- bootstrap: very first account
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_invites i
    WHERE lower(i.email) = lower(NEW.email)
      AND i.accepted_at IS NULL
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'signup for % requires a team invite', NEW.email
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'An owner or admin can send one from the portal Team page.';
END;
$$;

DROP TRIGGER IF EXISTS enforce_invited_signup_trg ON auth.users;
CREATE TRIGGER enforce_invited_signup_trg
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invited_signup();

REVOKE EXECUTE ON FUNCTION public.enforce_invited_signup() FROM anon, authenticated, public;

-- ── Consume the invite on signup ───────────────────────────────────────────
-- handle_new_user (v2, replaces 20260827120100's) applies the invited
-- role/flags/community to the new profile and marks the invite accepted so it
-- cannot be reused.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.team_invites%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.team_invites i
  WHERE lower(i.email) = lower(NEW.email)
    AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()
  ORDER BY i.created_at DESC
  LIMIT 1;

  INSERT INTO public.profiles (id, email, display_name, role, is_admin, community_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(inv.role, 'member'),
    COALESCE(inv.is_admin, false),
    inv.community_id
  )
  ON CONFLICT (id) DO NOTHING;

  IF inv.id IS NOT NULL THEN
    UPDATE public.team_invites
    SET accepted_at = now(), accepted_profile_id = NEW.id
    WHERE id = inv.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- ── Invite link handoffs ───────────────────────────────────────────────────
-- Supabase's one-time action link is spent on GET, and every chat app fetches
-- pasted URLs to build previews — SLAC lost three invites in one evening to
-- preview bots. So the real GoTrue link is stashed here and members hand out
-- /join/<id>, which renders an Accept button on GET and redeems only on POST.
-- Crawlers do not POST forms.
--
-- Holds live auth tokens ⇒ service-role-only: RLS on, no policies, no grants.
CREATE TABLE IF NOT EXISTS public.invite_link_handoffs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email        text NOT NULL,
  action_link  text NOT NULL,
  created_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  redeemed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS invite_link_handoffs_email_idx
  ON public.invite_link_handoffs (email);

ALTER TABLE public.invite_link_handoffs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invite_link_handoffs FROM PUBLIC, anon, authenticated;

-- ── Member-management RPCs ─────────────────────────────────────────────────
-- Privileged profile columns (role, is_admin, is_active, community_id,
-- is_safeguarding_lead) are outside every column grant; these SECURITY
-- DEFINER functions are the only write path, and each re-checks the caller
-- inside the database — the enforcement is here, not in a server action
-- someone forgets.

CREATE OR REPLACE FUNCTION public.admin_set_member_role(
  target uuid, new_role text, new_is_admin boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_portal_owner() THEN
    RAISE EXCEPTION 'only an active owner can change roles' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'you cannot change your own role' USING ERRCODE = 'check_violation';
  END IF;
  IF new_role NOT IN ('owner', 'member') THEN
    RAISE EXCEPTION 'unknown role %', new_role USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.profiles SET role = new_role, is_admin = new_is_admin WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such member' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_member_active(target uuid, active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_portal_owner() THEN
    RAISE EXCEPTION 'only an active owner can activate or deactivate members' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'you cannot deactivate yourself' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.profiles SET is_active = active WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such member' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Removal deletes the auth.users row; the profile follows by FK cascade.
-- Deactivation is the default farewell (keeps the audit trail) — removal is
-- for mistakes and genuine never-should-have-existed accounts.
CREATE OR REPLACE FUNCTION public.admin_remove_member(target uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_portal_owner() THEN
    RAISE EXCEPTION 'only an active owner can remove members' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target = (SELECT auth.uid()) THEN
    RAISE EXCEPTION 'you cannot remove yourself' USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM auth.users WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such member' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Community affiliation gates incident visibility, so changing it is a
-- deliberate act — but it is routine org admin (new member lands in the wrong
-- community, someone moves city), so owner OR admin, unlike role changes.
CREATE OR REPLACE FUNCTION public.admin_set_member_community(target uuid, community uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_portal_owner() OR public.is_portal_admin()) THEN
    RAISE EXCEPTION 'only an active owner or admin can set a member''s community' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF community IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.communities c WHERE c.id = community AND c.is_active
  ) THEN
    RAISE EXCEPTION 'no such active community' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.profiles SET community_id = community WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such member' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Owner-only, and deliberately does NOT refuse self-targeting: an owner
-- already passes every incident policy via the is_portal_owner() OR-clause,
-- so toggling their own lead flag changes nothing they can reach — blocking
-- it would only add friction to the normal owner-who-is-also-lead case.
-- (SLAC's 20260817120000 reasons this through in full.)
CREATE OR REPLACE FUNCTION public.admin_set_safeguarding_lead(target uuid, value boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_portal_owner() THEN
    RAISE EXCEPTION 'only an active owner can change safeguarding-lead status'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.profiles SET is_safeguarding_lead = value WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such member' USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_member_role(uuid, text, boolean)   FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_member_active(uuid, boolean)       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_remove_member(uuid)                    FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_member_community(uuid, uuid)       FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_set_safeguarding_lead(uuid, boolean)   FROM anon, public;
GRANT EXECUTE ON FUNCTION public.admin_set_member_role(uuid, text, boolean)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_active(uuid, boolean)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_member(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_member_community(uuid, uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_safeguarding_lead(uuid, boolean)    TO authenticated;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120300', 'team_invites_and_member_rpcs', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT proname FROM pg_proc WHERE proname LIKE 'admin_%' ORDER BY proname;
--   -- expect the five RPCs above
-- SELECT tgname FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND NOT tgisinternal;
--   -- expect enforce_invited_signup_trg + on_auth_user_created
-- SELECT count(*) FROM pg_policy WHERE polrelid='public.invite_link_handoffs'::regclass;
--   -- expect 0 (service-role only by design)
-- Sample test once live: sign up an uninvited address → expect
--   'signup ... requires a team invite'.
