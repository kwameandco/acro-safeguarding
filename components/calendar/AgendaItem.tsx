'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/field'
import { Button } from '@/components/ui/button'
import { formatLondon, londonDateKey, londonTime } from '@/lib/shared/time'
import { deleteEvent } from '@/lib/actions/calendar'
import { EventForm } from './EventForm'
import {
  CALENDAR_KIND_LABEL,
  CALENDAR_KIND_TONE,
  type CalendarCommunity,
  type CalendarEvent,
} from '@/lib/calendar/types'

/** One "Next 30 days" row. Mirrors MemberRow's shape: read view + an inline edit toggle. */
export function AgendaItem({
  event,
  communityName,
  communities,
  canManage,
}: {
  event: CalendarEvent
  communityName: string | null
  communities: CalendarCommunity[]
  canManage: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  if (editing) {
    return (
      <li className="px-4 py-3">
        <EventForm
          event={event}
          communities={communities}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  const startDisplay = event.all_day
    ? formatLondon(event.starts_at, false)
    : `${formatLondon(event.starts_at, false)} · ${londonTime(event.starts_at)}`
  const endDisplay =
    event.ends_at && londonDateKey(event.ends_at) !== londonDateKey(event.starts_at)
      ? formatLondon(event.ends_at, false)
      : null

  function handleDelete() {
    if (!window.confirm(`Delete "${event.title}"? This can't be undone.`)) return
    startTransition(async () => {
      const fd = new FormData()
      fd.set('id', event.id)
      const result = await deleteEvent(fd)
      if (result.ok) toast.success('Event deleted.')
      else toast.error(result.error)
    })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{event.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {startDisplay}
          {endDisplay ? ` – ${endDisplay}` : ''}
          {event.location ? ` · ${event.location}` : ''}
        </p>
      </div>
      <Badge tone={CALENDAR_KIND_TONE[event.kind] ?? 'neutral'}>
        {CALENDAR_KIND_LABEL[event.kind] ?? event.kind}
      </Badge>
      {communityName && <Badge>{communityName}</Badge>}
      {canManage && (
        <div className="flex items-center gap-2">
          <Button type="button" size="xs" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            type="button"
            size="xs"
            variant="destructive"
            disabled={pending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </div>
      )}
    </li>
  )
}
