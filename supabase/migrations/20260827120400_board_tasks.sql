-- Task board (kanban) — the team's shared coordination surface.
--
-- Shared-pool scoping (K, 2026-08-27): every active member sees and works the
-- whole board; `community_id` is a display/filter tag, not a boundary. This is
-- a HUMAN task board — deliberately not SLAC's tasks_inbox (an agent-approval
-- queue, a different thing this portal does not have).
--
-- Ordering: `position` is a float. Dropping a card between two others assigns
-- the midpoint — one row updated per drag, no renumbering transaction. Gaps
-- eventually exhaust float precision in theory; in practice a team board never
-- gets there, and a full renumber is a one-line UPDATE if it ever does.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27).

BEGIN;

CREATE TABLE IF NOT EXISTS public.board_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  detail       text,

  -- CHECK-constraint enum: widen together with `TaskStatus` in
  -- lib/board/types.ts, same migration/session.
  status text NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'blocked', 'done')),

  position     double precision NOT NULL DEFAULT 0,
  assignee_id  uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  due_on       date,
  community_id uuid REFERENCES public.communities (id) ON DELETE SET NULL,
  created_by   uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.board_tasks IS
  'Shared kanban board for the safeguarding team. community_id is a filter tag, not a boundary.';

CREATE INDEX IF NOT EXISTS board_tasks_status_position_idx
  ON public.board_tasks (status, position);
CREATE INDEX IF NOT EXISTS board_tasks_assignee_idx
  ON public.board_tasks (assignee_id);

DROP TRIGGER IF EXISTS board_tasks_touch_updated_at ON public.board_tasks;
CREATE TRIGGER board_tasks_touch_updated_at
  BEFORE UPDATE ON public.board_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── RLS + GRANTs ───────────────────────────────────────────────────────────
ALTER TABLE public.board_tasks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.board_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_tasks TO authenticated;
-- No anon grant: nothing on the board is public.

DROP POLICY IF EXISTS "board member read" ON public.board_tasks;
CREATE POLICY "board member read" ON public.board_tasks
  FOR SELECT TO authenticated
  USING (public.is_active_member());

DROP POLICY IF EXISTS "board member insert" ON public.board_tasks;
CREATE POLICY "board member insert" ON public.board_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_active_member() AND created_by = (SELECT auth.uid()));

-- Any active member may move/edit any card — it is a shared coordination
-- board, and "only the creator can drag it to done" would fight that.
DROP POLICY IF EXISTS "board member update" ON public.board_tasks;
CREATE POLICY "board member update" ON public.board_tasks
  FOR UPDATE TO authenticated
  USING (public.is_active_member())
  WITH CHECK (public.is_active_member());

-- Deleting is narrower: the creator taking back their own card, or an admin
-- tidying. Everyone else archives by dragging to done.
DROP POLICY IF EXISTS "board delete creator or admin" ON public.board_tasks;
CREATE POLICY "board delete creator or admin" ON public.board_tasks
  FOR DELETE TO authenticated
  USING (
    public.is_portal_admin() OR public.is_portal_owner()
    OR (public.is_active_member() AND created_by = (SELECT auth.uid()))
  );

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260827120400', 'board_tasks', ARRAY['-- see file'])
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- SELECT polname FROM pg_policy WHERE polrelid='public.board_tasks'::regclass;
-- SELECT indexname FROM pg_indexes WHERE tablename='board_tasks';
-- SELECT has_table_privilege('anon','public.board_tasks','SELECT'); -- expect f
