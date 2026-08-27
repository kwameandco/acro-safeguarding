'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createIncident } from '@/lib/actions/incidents'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Select, Label, FieldHint } from '@/components/ui/field'
import {
  INCIDENT_CATEGORIES,
  CATEGORY_LABEL,
  INCIDENT_SEVERITIES,
  SEVERITY_LABEL,
  type CommunityOption,
} from '@/lib/incidents/types'

/**
 * The report form. Field order matches the spec exactly: who should see it,
 * category, severity, when, where, who it's about, whether a minor is
 * involved, then the free-text summary/detail/actions.
 *
 * There is deliberately no edit path once this is submitted — see
 * lib/actions/incidents.ts and the migration header: incident records are
 * append-only territory. A correction after the fact is a note on the
 * detail page, not a re-opened form.
 */
export function NewIncidentForm({ communities }: { communities: CommunityOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [involvesMinor, setInvolvesMinor] = useState(false)

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await createIncident(fd)
      if (result.ok) {
        // Navigate rather than have the action redirect() itself: this way a
        // validation failure just re-renders the same form with a toast, and
        // only a genuine success ever leaves this page.
        router.push(`/incidents?submitted=${encodeURIComponent(result.reference)}`)
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <Label htmlFor="community_id">Who should see this report?</Label>
        <Select id="community_id" name="community_id" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">Leads only (no community)</option>
        </Select>
        <FieldHint>
          Tagging a community makes this report visible to that community’s own team members,
          not only to leads. Choose “Leads only” for anything about — or too close to — a
          community’s own officers.
        </FieldHint>
      </div>

      <div>
        <Label htmlFor="category">Category</Label>
        <Select id="category" name="category" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {INCIDENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c] ?? c}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="severity">Severity</Label>
        <Select id="severity" name="severity" required defaultValue="">
          <option value="" disabled>
            Choose…
          </option>
          {INCIDENT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="occurred_at">When did this happen? (optional)</Label>
        <Input id="occurred_at" name="occurred_at" type="datetime-local" />
        <FieldHint>
          Leave this blank if you’re not sure — an approximate time is fine in the summary
          below instead.
        </FieldHint>
      </div>

      <div>
        <Label htmlFor="location">Location (optional)</Label>
        <Input
          id="location"
          name="location"
          type="text"
          maxLength={300}
          placeholder="e.g. the venue, or online"
        />
      </div>

      <div>
        <Label htmlFor="subject_name">Who this is about (optional)</Label>
        <Input
          id="subject_name"
          name="subject_name"
          type="text"
          maxLength={200}
          placeholder="Initials or first name"
        />
        <FieldHint>
          Initials or first name — only add full identifying detail if the concern cannot be
          actioned without it.
        </FieldHint>
      </div>

      <div>
        <Label htmlFor="subject_contact">Their contact details, if you have them (optional)</Label>
        <Input
          id="subject_contact"
          name="subject_contact"
          type="text"
          maxLength={200}
          placeholder="Only if it's needed to follow this up"
        />
        <FieldHint>Same principle as above — only what’s actually needed to act on this.</FieldHint>
      </div>

      <div className="flex items-start gap-2">
        <input
          id="involves_minor"
          name="involves_minor"
          type="checkbox"
          className="mt-1 size-4 rounded border-input"
          onChange={(e) => setInvolvesMinor(e.target.checked)}
        />
        <Label htmlFor="involves_minor" className="mb-0 font-normal">
          This involves a child or young person under 18
        </Label>
      </div>
      {involvesMinor && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-warning-foreground dark:text-warning">
          <p>
            Also follow your own community’s child-safeguarding escalation process for this
            concern — this form logs a record here, it doesn’t replace that.
          </p>
        </div>
      )}

      <div>
        <Label htmlFor="summary">Summary (required, one line)</Label>
        <Input
          id="summary"
          name="summary"
          type="text"
          required
          maxLength={300}
          placeholder="A one-line summary of the concern"
        />
      </div>

      <div>
        <Label htmlFor="detail">Detail (optional)</Label>
        <Textarea
          id="detail"
          name="detail"
          maxLength={8000}
          placeholder="What happened, who was involved, what was said or seen…"
        />
      </div>

      <div>
        <Label htmlFor="actions_taken">Actions taken so far (optional)</Label>
        <Textarea
          id="actions_taken"
          name="actions_taken"
          maxLength={4000}
          placeholder="Anything already done in response"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Submitting…' : 'Submit report'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => router.push('/incidents')}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
