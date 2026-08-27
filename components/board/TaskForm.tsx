'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { createTask, updateTask } from '@/lib/actions/board'
import type { BoardCommunity, BoardProfile, BoardTask } from '@/lib/board/types'
import { Button } from '@/components/ui/button'
import { Input, Label, Select, Textarea } from '@/components/ui/field'

/**
 * Shared field set for both creating and editing a card. Status is
 * deliberately not a field here — a card's column changes only via drag or
 * the move Select (see TaskCard), never through this form.
 */
export function TaskForm({
  mode,
  task,
  profiles,
  communities,
  onDone,
  onCancel,
}: {
  mode: 'create' | 'edit'
  task?: BoardTask
  profiles: BoardProfile[]
  communities: BoardCommunity[]
  onDone: () => void
  onCancel: () => void
}) {
  const [pending, startTransition] = useTransition()
  const fieldSuffix = `${mode}-${task?.id ?? 'new'}`

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(async () => {
          const action = mode === 'create' ? createTask : updateTask
          const result = await action(formData)
          if (result.ok) {
            toast.success(mode === 'create' ? 'Task added.' : 'Task updated.')
            onDone()
          } else {
            toast.error(result.error)
          }
        })
      }}
    >
      {mode === 'edit' && task && <input type="hidden" name="id" value={task.id} />}

      <div>
        <Label htmlFor={`task-title-${fieldSuffix}`}>Title</Label>
        <Input
          id={`task-title-${fieldSuffix}`}
          name="title"
          required
          maxLength={200}
          defaultValue={task?.title ?? ''}
          placeholder="What needs doing?"
        />
      </div>

      <div>
        <Label htmlFor={`task-detail-${fieldSuffix}`}>Detail</Label>
        <Textarea
          id={`task-detail-${fieldSuffix}`}
          name="detail"
          maxLength={4000}
          defaultValue={task?.detail ?? ''}
          placeholder="Optional — context, links, next steps"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`task-assignee-${fieldSuffix}`}>Assignee</Label>
          <Select
            id={`task-assignee-${fieldSuffix}`}
            name="assignee_id"
            defaultValue={task?.assignee_id ?? ''}
          >
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name ?? 'Member'}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor={`task-due-${fieldSuffix}`}>Due date</Label>
          <Input
            id={`task-due-${fieldSuffix}`}
            name="due_on"
            type="date"
            defaultValue={task?.due_on ?? ''}
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`task-community-${fieldSuffix}`}>Community</Label>
        <Select
          id={`task-community-${fieldSuffix}`}
          name="community_id"
          defaultValue={task?.community_id ?? ''}
        >
          <option value="">No community</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : mode === 'create' ? 'Add task' : 'Save changes'}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
