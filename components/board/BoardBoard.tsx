'use client'

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { moveTask } from '@/lib/actions/board'
import {
  TASK_STATUSES,
  computeDropPositions,
  midpointPosition,
  type BoardCommunity,
  type BoardProfile,
  type BoardTask,
  type TaskStatus,
} from '@/lib/board/types'
import { Button } from '@/components/ui/button'
import { NewTaskPanel } from './NewTaskPanel'
import { TaskColumn } from './TaskColumn'

/**
 * Kanban orchestrator: owns local task order for optimistic drag-and-drop,
 * everything else (create/edit/delete) just waits for the server action's
 * `revalidatePath` to bring fresh props down, same as TeamControls does.
 */
export function BoardBoard({
  initialTasks,
  profiles,
  communities,
  currentProfileId,
  isAdminOrOwner,
  hasActiveFilters,
}: {
  initialTasks: BoardTask[]
  profiles: BoardProfile[]
  communities: BoardCommunity[]
  currentProfileId: string
  isAdminOrOwner: boolean
  hasActiveFilters: boolean
}) {
  const [tasks, setTasks] = useState(initialTasks)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [, startTransition] = useTransition()

  // Resync whenever the server hands us fresh data — after any mutation's
  // revalidatePath, or simply a fresh visit. Adjusted during render (React's
  // recommended way to reset state from a changed prop — see NavDrawer.tsx
  // for the same pattern) rather than in an effect, so it applies before the
  // browser paints instead of causing an extra post-commit render. There is
  // no in-flight local edit this could clobber: a drag gesture never waits on
  // a render from the server mid-gesture, and create/edit/delete never touch
  // local state at all.
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks)
  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks)
    setTasks(initialTasks)
  }

  const byStatus = useMemo(() => {
    const map = new Map<TaskStatus, BoardTask[]>()
    for (const status of TASK_STATUSES) map.set(status, [])
    for (const task of tasks) {
      map.get(task.status)?.push(task)
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position)
    return map
  }, [tasks])

  function applyMove(taskId: string, status: TaskStatus, beforePos: number | null, afterPos: number | null) {
    const previous = tasks
    const position = midpointPosition(beforePos, afterPos)
    setTasks((current) => current.map((t) => (t.id === taskId ? { ...t, status, position } : t)))
    startTransition(async () => {
      const result = await moveTask(taskId, status, beforePos, afterPos)
      if (!result.ok) {
        setTasks(previous)
        toast.error(result.error)
      }
    })
  }

  function handleDropAtEnd(draggedTaskId: string, status: TaskStatus) {
    const columnTasks = (byStatus.get(status) ?? []).filter((t) => t.id !== draggedTaskId)
    const { beforePos, afterPos } = computeDropPositions(columnTasks, null)
    applyMove(draggedTaskId, status, beforePos, afterPos)
    setDraggingId(null)
  }

  function handleDropBeforeCard(draggedTaskId: string, status: TaskStatus, targetTaskId: string) {
    const columnTasks = (byStatus.get(status) ?? []).filter((t) => t.id !== draggedTaskId)
    const targetIndex = columnTasks.findIndex((t) => t.id === targetTaskId)
    const { beforePos, afterPos } = computeDropPositions(columnTasks, targetIndex === -1 ? null : targetIndex)
    applyMove(draggedTaskId, status, beforePos, afterPos)
    setDraggingId(null)
  }

  function handleMoveViaSelect(task: BoardTask, status: TaskStatus) {
    if (status === task.status) return
    const columnTasks = (byStatus.get(status) ?? []).filter((t) => t.id !== task.id)
    const { beforePos, afterPos } = computeDropPositions(columnTasks, null)
    applyMove(task.id, status, beforePos, afterPos)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Shared board — every active member can see and move any card. Sorted by position within
          each column; drag a card or use its move menu.
        </p>
        {!creating && (
          <Button type="button" onClick={() => setCreating(true)} className="shrink-0">
            Add task
          </Button>
        )}
      </div>

      {creating && (
        <NewTaskPanel profiles={profiles} communities={communities} onDone={() => setCreating(false)} />
      )}

      {tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {hasActiveFilters
            ? 'No tasks match these filters.'
            : 'Nothing on the board yet — use “Add task” above to get started.'}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <TaskColumn
            key={status}
            status={status}
            tasks={byStatus.get(status) ?? []}
            profiles={profiles}
            communities={communities}
            currentProfileId={currentProfileId}
            isAdminOrOwner={isAdminOrOwner}
            draggingId={draggingId}
            onDragStartTask={setDraggingId}
            onDragEndTask={() => setDraggingId(null)}
            onDropAtEnd={handleDropAtEnd}
            onDropBeforeCard={handleDropBeforeCard}
            onMoveViaSelect={handleMoveViaSelect}
          />
        ))}
      </div>
    </div>
  )
}
