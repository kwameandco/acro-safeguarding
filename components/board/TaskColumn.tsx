'use client'

import { TASK_STATUS_LABELS, type BoardCommunity, type BoardProfile, type BoardTask, type TaskStatus } from '@/lib/board/types'
import { TaskCard } from './TaskCard'

/** One kanban column: header + droppable card list, sorted by position. */
export function TaskColumn({
  status,
  tasks,
  profiles,
  communities,
  currentProfileId,
  isAdminOrOwner,
  draggingId,
  onDragStartTask,
  onDragEndTask,
  onDropAtEnd,
  onDropBeforeCard,
  onMoveViaSelect,
}: {
  status: TaskStatus
  tasks: BoardTask[]
  profiles: BoardProfile[]
  communities: BoardCommunity[]
  currentProfileId: string
  isAdminOrOwner: boolean
  draggingId: string | null
  onDragStartTask: (taskId: string) => void
  onDragEndTask: () => void
  onDropAtEnd: (draggedTaskId: string, status: TaskStatus) => void
  onDropBeforeCard: (draggedTaskId: string, status: TaskStatus, targetTaskId: string) => void
  onMoveViaSelect: (task: BoardTask, status: TaskStatus) => void
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const draggedId = e.dataTransfer.getData('text/plain')
        if (draggedId) onDropAtEnd(draggedId, status)
      }}
      className="flex min-w-0 flex-col gap-3 rounded-lg border bg-muted/40 p-3"
    >
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">{TASK_STATUS_LABELS[status] ?? status}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </div>

      <div className="flex flex-col gap-2">
        {tasks.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
            No tasks
          </p>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              profiles={profiles}
              communities={communities}
              currentProfileId={currentProfileId}
              isAdminOrOwner={isAdminOrOwner}
              isDragging={draggingId === task.id}
              onDragStart={() => onDragStartTask(task.id)}
              onDragEnd={onDragEndTask}
              onDropBefore={(draggedId) => onDropBeforeCard(draggedId, status, task.id)}
              onMoveViaSelect={(nextStatus) => onMoveViaSelect(task, nextStatus)}
            />
          ))
        )}
      </div>
    </div>
  )
}
