-- Resource library — shared docs with tagging, sort and search.
--
-- A resource is either an uploaded FILE (Supabase Storage, private `resources`
-- bucket) or an external LINK (a Google Doc, a policy page). Tags are a plain
-- text[] — free tagging, filterable via GIN. Search is Postgres full-text over
-- title + description + tags via a generated tsvector column, so the search
-- box works at any library size without an extension.
--
-- Storage policy notes — three AcroPassport incidents distilled
-- (docs/RUNBOOK entries in the AP repo, 2026-08-15):
--   * The owner-folder path segment is compared as TEXT against
--     auth.uid()::text. NEVER cast a storage.foldername(name)[n] segment to
--     uuid — path input is attacker-controlled and `22P02` aborts the whole
--     policy evaluation.
--   * No AND/OR short-circuit guards in policies: Postgres may reorder
--     boolean expressions. If a branch guard is ever needed here, use CASE —
--     evaluation order of CASE is part of the SQL standard.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

-- ── Immutable tag flattener ────────────────────────────────────────────────
-- array_to_string(text[], text) is only STABLE, which a generated column
-- rejects. For text[] it is in fact deterministic, so wrap it.
CREATE OR REPLACE FUNCTION public.tags_to_text(tags text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_to_string(tags, ' '), '');
$$;

REVOKE EXECUTE ON FUNCTION public.tags_to_text(text[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tags_to_text(text[]) TO authenticated;

-- ── resources ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,

  -- CHECK-constraint enum: widen together with `ResourceKind` in
  -- lib/resources/types.ts, same migration/session.
  kind text NOT NULL
    CHECK (kind IN ('file', 'link')),

  -- kind='file' → storage_path set; kind='link' → url set.
  storage_path text,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  url          text,

  tags         text[] NOT NULL DEFAULT '{}',
  community_id uuid REFERENCES public.communities (id) ON DELETE SET NULL,
  created_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT resources_kind_payload CHECK (
    (kind = 'file' AND storage_path IS NOT NULL AND url IS NULL)
    OR (kind = 'link' AND url IS NOT NULL AND storage_path IS NULL)
  ),

  search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', public.tags_to_text(tags)), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED
);

COMMENT ON TABLE public.resources IS
  'Shared document library: uploaded files (resources bucket) and external links, '
  'tagged and full-text searchable. community_id is a filter tag, not a boundary.';

CREATE INDEX IF NOT EXISTS resources_search_idx ON public.resources USING gin (search);
CREATE INDEX IF NOT EXISTS resources_tags_idx   ON public.resources USING gin (tags);
CREATE INDEX IF NOT EXISTS resources_created_idx ON public.resources (created_at DESC);

DROP TRIGGER IF EXISTS resources_touch_updated_at ON public.resources;
CREATE TRIGGER resources_touch_updated_at
  BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS + GRANTs (resources table) ─────────────────────────────────────────
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.resources FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;

DROP POLICY IF EXISTS "resources member read" ON public.resources;
CREATE POLICY "resources member read" ON public.resources
  FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP POLICY IF EXISTS "resources member insert" ON public.resources;
CREATE POLICY "resources member insert" ON public.resources
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "resources update uploader or admin" ON public.resources;
CREATE POLICY "resources update uploader or admin" ON public.resources
  FOR UPDATE TO authenticated
  USING (
    public.is_portal_admin() OR public.is_portal_owner()
    OR (public.is_active_member() AND created_by = (SELECT auth.uid()))
  )
  WITH CHECK (
    public.is_portal_admin() OR public.is_portal_owner()
    OR (public.is_active_member() AND created_by = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "resources delete uploader or admin" ON public.resources;
CREATE POLICY "resources delete uploader or admin" ON public.resources
  FOR DELETE TO authenticated
  USING (
    public.is_portal_admin() OR public.is_portal_owner()
    OR (public.is_active_member() AND created_by = (SELECT auth.uid()))
  );

-- ── Storage bucket ─────────────────────────────────────────────────────────
-- Private bucket; the app serves files via short-lived signed URLs. Path
-- convention (enforced below): <uploader auth.uid()>/<uuid>-<filename>.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('resources', 'resources', false, 26214400)  -- 25 MB per file
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "resources bucket member read" ON storage.objects;
CREATE POLICY "resources bucket member read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'resources' AND public.is_active_member());

-- First path segment must be the uploader's own id — compared as TEXT.
DROP POLICY IF EXISTS "resources bucket own-folder insert" ON storage.objects;
CREATE POLICY "resources bucket own-folder insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'resources'
    AND public.is_active_member()
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "resources bucket delete own or admin" ON storage.objects;
CREATE POLICY "resources bucket delete own or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'resources'
    AND (
      public.is_portal_admin() OR public.is_portal_owner()
      OR (storage.foldername(name))[1] = (SELECT auth.uid())::text
    )
  );
-- No UPDATE policy: replacing a file is delete + re-upload, which keeps the
-- policies two instead of four (the duplicated-predicate trap AP hit).

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120600', 'resources_library', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT polname FROM pg_policy WHERE polrelid='public.resources'::regclass;
-- SELECT id, public, file_size_limit FROM storage.buckets WHERE id='resources';
-- SELECT polname FROM pg_policy WHERE polrelid='storage.objects'::regclass
--   AND polname LIKE 'resources bucket%';
-- Search sample test:
--   INSERT ... title='Safeguarding policy template', tags='{policy,template}';
--   SELECT id FROM resources WHERE search @@ websearch_to_tsquery('english','policy');
