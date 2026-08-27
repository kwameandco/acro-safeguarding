'use client'

import type { BoardCommunity, BoardProfile } from '@/lib/board/types'
import { TaskForm } from './TaskForm'

/** Inline "new task" panel. BoardBoard owns the open/closed toggle; this just renders the form. */
export function NewTaskPanel({
  profiles,
  communities,
  onDone,
}: {
  profiles: BoardProfile[]
  communities: BoardCommunity[]
  onDone: () => void
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold">New task</h2>
      <TaskForm
        mode="create"
        profiles={profiles}
        communities={communities}
        onDone={onDone}
        onCancel={onDone}
      />
    </div>
  )
}
