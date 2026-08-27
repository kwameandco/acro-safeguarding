'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { setIncidentStatus, addIncidentNote } from '@/lib/actions/incidents'
import { Button } from '@/components/ui/button'
import { Select, Label, Input, Textarea, FieldHint } from '@/components/ui/field'
import { formatLondon } from '@/lib/shared/time'
import { INCIDENT_STATUSES, STATUS_LABEL, type IncidentStatus, type IncidentNoteRow } from '@/lib/incidents/types'

/**
 * The two mutable things on a logged incident: its status/referral, and its
 * append-only notes trail. Everything else about the report is read-only
 * once submitted — there is no edit form anywhere in this module.
 */

export function IncidentStatusControl({
  incidentId,
  initialStatus,
  initialReferredTo,
}: {
  incidentId: string
  initialStatus: IncidentStatus
  initialReferredTo: string | null
}) {
  const [status, setStatus] = useState<IncidentStatus>(initialStatus)
  const [referredTo, setReferredTo] = useState(initialReferredTo ?? '')
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData()
    fd.set('id', incidentId)
    fd.set('status', status)
    fd.set('referred_to', referredTo)
    startTransition(async () => {
      const result = await setIncidentStatus(fd)
      if (result.ok) toast.success('Status updated.')
      else toast.error(result.error)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-base font-semibold">Status</h2>
      <div>
        <Label htmlFor="incident-status">Current status</Label>
        <Select
          id="incident-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as IncidentStatus)}
        >
          {INCIDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
      </div>
      {status === 'referred' && (
        <div>
          <Label htmlFor="incident-referred-to">Referred to</Label>
          <Input
            id="incident-referred-to"
            value={referredTo}
            onChange={(e) => setReferredTo(e.target.value)}
            placeholder="e.g. the community's own safeguarding officer, LADO, police"
            required
            maxLength={300}
          />
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? 'Updating…' : 'Update status'}
      </Button>
    </form>
  )
}

export function IncidentNotes({
  incidentId,
  notes,
}: {
  incidentId: string
  notes: IncidentNoteRow[]
}) {
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('incident_id', incidentId)
    startTransition(async () => {
      const result = await addIncidentNote(fd)
      if (result.ok) {
        toast.success('Note added.')
        formRef.current?.reset()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">Notes</h2>
      {notes.length === 0 ? (
        <p className="text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border bg-card p-3">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.profiles?.display_name ?? 'Unknown'} · {formatLondon(n.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <form ref={formRef} onSubmit={onSubmit} className="space-y-2">
        <Label htmlFor="note-body">Add a note</Label>
        <Textarea
          id="note-body"
          name="body"
          required
          maxLength={4000}
          placeholder="What happened, who was contacted, next steps…"
        />
        <FieldHint>Notes are permanent once added — there’s no editing or deleting them later.</FieldHint>
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : 'Add note'}
        </Button>
      </form>
    </div>
  )
}
