'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { deleteTask } from '@/lib/actions/board'
import {
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  isTaskStatus,
  type BoardCommunity,
  type BoardProfile,
  type BoardTask,
  type TaskStatus,
} from '@/lib/board/types'
import { formatLondon, londonDateKey } from '@/lib/shared/time'
import { Badge, Select } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TaskForm } from './TaskForm'

export function TaskCard({
  task,
  profiles,
  communities,
  currentProfileId,
  isAdminOrOwner,
  isDragging,
  onDragStart,
  onDragEnd,
  onDropBefore,
  onMoveViaSelect,
}: {
  task: BoardTask
  profiles: BoardProfile[]
  communities: BoardCommunity[]
  currentProfileId: string
  isAdminOrOwner: boolean
  isDragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropBefore: (draggedTaskId: string) => void
  onMoveViaSelect: (status: TaskStatus) => void
}) {
  const [view, setView] = useState<'collapsed' | 'expanded' | 'editing'>('collapsed')
  const [deleting, startDelete] = useTransition()

  const assignee = task.assignee_id ? profiles.find((p) => p.id === task.assignee_id) : null
  const community = task.community_id ? communities.find((c) => c.id === task.community_id) : null
  const canDelete = isAdminOrOwner || task.created_by === currentProfileId

  const isOverdue =
    task.due_on !== null && task.status !== 'done' && task.due_on < londonDateKey(new Date().toISOString())

  function handleDelete() {
    if (!window.confirm(`Delete "${task.title}"? This can't be undone.`)) return
    const formData = new FormData()
    formData.set('id', task.id)
    startDelete(async () => {
      const result = await deleteTask(formData)
      if (result.ok) toast.success('Task deleted.')
      else toast.error(result.error)
    })
  }

  if (view === 'editing') {
    return (
      <div className="rounded-lg border bg-card p-3">
        <TaskForm
          mode="edit"
          task={task}
          profiles={profiles}
          communities={communities}
          onDone={() => setView('expanded')}
          onCancel={() => setView('expanded')}
        />
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={() => onDragEnd()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        const draggedId = e.dataTransfer.getData('text/plain')
        if (draggedId && draggedId !== task.id) onDropBefore(draggedId)
      }}
      className={cn(
        'rounded-lg border bg-card p-3 text-left shadow-sm transition-opacity',
        isDragging && 'opacity-50'
      )}
    >
      <button
        type="button"
        onClick={() => setView(view === 'expanded' ? 'collapsed' : 'expanded')}
        className="w-full cursor-grab text-left active:cursor-grabbing"
        aria-expanded={view === 'expanded'}
      >
        <p className="font-medium">{task.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {assignee && <span>{assignee.display_name ?? 'Member'}</span>}
          {task.due_on && (
            <span className={cn(isOverdue && 'font-medium text-destructive')}>
              {formatLondon(task.due_on, false)}
            </span>
          )}
          {community && <Badge>{community.name}</Badge>}
        </div>
      </button>

      {view === 'expanded' && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {task.detail && <p className="whitespace-pre-wrap text-muted-foreground">{task.detail}</p>}

          <div>
            <label htmlFor={`move-${task.id}`} className="mb-1.5 block text-xs text-muted-foreground">
              Move to
            </label>
            <Select
              id={`move-${task.id}`}
              value={task.status}
              className="h-8 text-xs"
              onChange={(e) => {
                if (isTaskStatus(e.target.value)) onMoveViaSelect(e.target.value)
              }}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s] ?? s}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex gap-2">
            <Button type="button" size="xs" variant="outline" onClick={() => setView('editing')}>
              Edit
            </Button>
            {canDelete && (
              <Button type="button" size="xs" variant="destructive" disabled={deleting} onClick={handleDelete}>
                {deleting ? 'Deleting…' : 'Delete'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
