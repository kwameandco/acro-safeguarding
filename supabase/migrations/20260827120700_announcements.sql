-- Internal announcements — one-to-team communication.
--
-- Admins and owners write; every active member reads. Pinned announcements
-- surface first (and on the dashboard feed). Body is markdown, rendered
-- read-only in the portal.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

CREATE TABLE IF NOT EXISTS public.announcements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  body_md      text NOT NULL,
  pinned       boolean NOT NULL DEFAULT false,
  author_id    uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.announcements IS
  'Internal team announcements. Written by admins/owners, read by all active members.';

CREATE INDEX IF NOT EXISTS announcements_feed_idx
  ON public.announcements (pinned DESC, published_at DESC);

DROP TRIGGER IF EXISTS announcements_touch_updated_at ON public.announcements;
CREATE TRIGGER announcements_touch_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS + GRANTs ───────────────────────────────────────────────────────────
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.announcements FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;

DROP POLICY IF EXISTS "announcements member read" ON public.announcements;
CREATE POLICY "announcements member read" ON public.announcements
  FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP POLICY IF EXISTS "announcements admin insert" ON public.announcements;
CREATE POLICY "announcements admin insert" ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.is_portal_admin() OR public.is_portal_owner())
    AND author_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "announcements admin update" ON public.announcements;
CREATE POLICY "announcements admin update" ON public.announcements
  FOR UPDATE TO authenticated
  USING (public.is_portal_admin() OR public.is_portal_owner())
  WITH CHECK (public.is_portal_admin() OR public.is_portal_owner());

DROP POLICY IF EXISTS "announcements admin delete" ON public.announcements;
CREATE POLICY "announcements admin delete" ON public.announcements
  FOR DELETE TO authenticated
  USING (public.is_portal_admin() OR public.is_portal_owner());

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120700', 'announcements', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT polname FROM pg_policy WHERE polrelid='public.announcements'::regclass;
-- As a non-admin authenticated member: INSERT → expect RLS rejection.
