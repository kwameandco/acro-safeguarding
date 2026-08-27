'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EventForm } from './EventForm'
import type { CalendarCommunity } from '@/lib/calendar/types'

/** Collapsible "New event" panel — the create half of the spec's new/edit form. */
export function NewEventPanel({ communities }: { communities: CalendarCommunity[] }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">New event</h2>
        <Button
          type="button"
          size="sm"
          variant={open ? 'outline' : 'default'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? 'Close' : 'New event'}
        </Button>
      </div>
      {open && (
        <div className="mt-4">
          <EventForm communities={communities} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
        </div>
      )}
    </div>
  )
}
