/**
 * Task board (kanban) types.
 *
 * `TaskStatus`/`TASK_STATUSES` mirror the CHECK constraint on
 * `public.board_tasks.status` in migration 20260827120400 exactly. Widen the
 * constraint and this union together, in the same migration/session — never
 * one without the other (see CLAUDE.md "A CHECK-constraint enum and its TS
 * union widen together").
 */

export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const

export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Fixed column order + labels. Read with `?? fallback`, never a bare index. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  doing: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

export function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

export type BoardProfile = {
  id: string
  display_name: string | null
}

export type BoardCommunity = {
  id: string
  name: string
}

export type BoardTask = {
  id: string
  title: string
  detail: string | null
  status: TaskStatus
  position: number
  assignee_id: string | null
  due_on: string | null
  community_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * One row updated per drag, no renumbering transaction (see the migration's
 * header comment). `beforePos`/`afterPos` are the positions of the cards
 * immediately above/below the drop point in the DESTINATION column; `null` at
 * either end means "top of column" / "bottom of column".
 */
export function midpointPosition(beforePos: number | null, afterPos: number | null): number {
  if (beforePos == null && afterPos == null) return 1
  if (beforePos == null) return (afterPos as number) - 1
  if (afterPos == null) return beforePos + 1
  return (beforePos + afterPos) / 2
}

/**
 * Given a column's tasks sorted ascending by position (with the task being
 * moved already excluded from the list), resolve the {beforePos, afterPos}
 * pair that brackets `targetIndex` — the index the dropped task should land
 * at. `null` means "append to the end" (max position + 1).
 */
export function computeDropPositions(
  columnTasks: BoardTask[],
  targetIndex: number | null
): { beforePos: number | null; afterPos: number | null } {
  if (targetIndex === null || targetIndex >= columnTasks.length) {
    const last = columnTasks.at(-1)
    return { beforePos: last ? last.position : null, afterPos: null }
  }
  const before = targetIndex > 0 ? columnTasks[targetIndex - 1] : null
  const after = columnTasks[targetIndex] ?? null
  return { beforePos: before ? before.position : null, afterPos: after ? after.position : null }
}
