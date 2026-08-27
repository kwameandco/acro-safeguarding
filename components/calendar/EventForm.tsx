'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Select, Label, FieldHint } from '@/components/ui/field'
import { createEvent, updateEvent } from '@/lib/actions/calendar'
import type { ActionResult } from '@/lib/actions/profile'
import { londonDateKey, utcToLondonLocal } from '@/lib/shared/time'
import {
  CALENDAR_KINDS,
  CALENDAR_KIND_LABEL,
  type CalendarCommunity,
  type CalendarEvent,
} from '@/lib/calendar/types'

/**
 * Create AND edit share this one form — pass `event` to pre-fill and switch
 * the submit action to updateEvent. Start/end use `type="date"` while All day
 * is checked, `type="datetime-local"` otherwise; the two field sets are
 * mounted/unmounted (not just hidden) so FormData never carries a stray value
 * from the inactive set.
 */
export function EventForm({
  communities,
  event,
  onDone,
  onCancel,
}: {
  communities: CalendarCommunity[]
  event?: CalendarEvent
  onDone?: () => void
  onCancel?: () => void
}) {
  const uid = useId()
  const formRef = useRef<HTMLFormElement>(null)
  const [pending, startTransition] = useTransition()
  const [allDay, setAllDay] = useState(event?.all_day ?? false)

  const initialStart = event
    ? event.all_day
      ? londonDateKey(event.starts_at)
      : utcToLondonLocal(event.starts_at)
    : ''
  const initialEnd = event?.ends_at
    ? event.all_day
      ? londonDateKey(event.ends_at)
      : utcToLondonLocal(event.ends_at)
    : ''

  // Keep an event's own (possibly since-deactivated) community selectable, so
  // saving other edits never silently reassigns it to whatever option sorts
  // first — see CalendarCommunity's comment in lib/calendar/types.ts.
  const activeCommunities = communities.filter((c) => c.is_active)
  const currentCommunity = event?.community_id
    ? communities.find((c) => c.id === event.community_id)
    : undefined
  const communityOptions =
    currentCommunity && !currentCommunity.is_active
      ? [...activeCommunities, currentCommunity]
      : activeCommunities

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const action = event ? updateEvent : createEvent
      const result: ActionResult = await action(formData)
      if (result.ok) {
        toast.success(event ? 'Event updated.' : 'Event added.')
        formRef.current?.reset()
        onDone?.()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {event && <input type="hidden" name="id" value={event.id} />}

      <div>
        <Label htmlFor={`${uid}-title`}>Title</Label>
        <Input
          id={`${uid}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={event?.title}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${uid}-kind`}>Kind</Label>
          <Select id={`${uid}-kind`} name="kind" defaultValue={event?.kind ?? 'meeting'}>
            {CALENDAR_KINDS.map((k) => (
              <option key={k} value={k}>
                {CALENDAR_KIND_LABEL[k] ?? k}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor={`${uid}-community`}>Community</Label>
          <Select
            id={`${uid}-community`}
            name="community_id"
            defaultValue={event?.community_id ?? ''}
          >
            <option value="">No community</option>
            {communityOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.is_active ? ' (inactive)' : ''}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id={`${uid}-all-day`}
          type="checkbox"
          name="all_day"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-4 rounded border-input"
        />
        <Label htmlFor={`${uid}-all-day`} className="mb-0">
          All day
        </Label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${uid}-start`}>Starts</Label>
          {allDay ? (
            <Input
              id={`${uid}-start`}
              name="start_date"
              type="date"
              required
              defaultValue={initialStart}
            />
          ) : (
            <Input
              id={`${uid}-start`}
              name="start_local"
              type="datetime-local"
              required
              defaultValue={initialStart}
            />
          )}
        </div>
        <div>
          <Label htmlFor={`${uid}-end`}>Ends (optional)</Label>
          {allDay ? (
            <Input id={`${uid}-end`} name="end_date" type="date" defaultValue={initialEnd} />
          ) : (
            <Input
              id={`${uid}-end`}
              name="end_local"
              type="datetime-local"
              defaultValue={initialEnd}
            />
          )}
          <FieldHint>For a multi-day entry, e.g. a weekend intensive.</FieldHint>
        </div>
      </div>

      <div>
        <Label htmlFor={`${uid}-location`}>Location</Label>
        <Input
          id={`${uid}-location`}
          name="location"
          maxLength={200}
          defaultValue={event?.location ?? ''}
        />
      </div>

      <div>
        <Label htmlFor={`${uid}-description`}>Description</Label>
        <Textarea
          id={`${uid}-description`}
          name="description"
          maxLength={4000}
          defaultValue={event?.description ?? ''}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : event ? 'Save changes' : 'Add event'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
