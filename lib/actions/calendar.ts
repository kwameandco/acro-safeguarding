'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { londonLocalToUtcIso } from '@/lib/shared/time'
import { isCalendarKind, type CalendarKind } from '@/lib/calendar/types'
import type { ActionResult } from './profile'

const TITLE_MAX = 200
const LOCATION_MAX = 200
const DESCRIPTION_MAX = 4000

/**
 * `local` is either a `YYYY-MM-DD` (all-day) or `YYYY-MM-DDTHH:mm`
 * (datetime-local) value, always read as Europe/London wall-clock time —
 * never `new Date(value)`, which would shift every summer entry by an hour.
 * All-day values are anchored to local midnight.
 */
function parseLondonInstant(raw: string, allDay: boolean): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const local = allDay ? `${trimmed}T00:00` : trimmed
  try {
    return londonLocalToUtcIso(local)
  } catch {
    return null
  }
}

type EventFields = {
  title: string
  description: string | null
  location: string | null
  kind: CalendarKind
  starts_at: string
  ends_at: string | null
  all_day: boolean
  community_id: string | null
}

/** Manual validation shared by create and update — see CLAUDE.md's server-action shape. */
function readEventFields(formData: FormData): EventFields | { error: string } {
  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Title is required.' }
  if (title.length > TITLE_MAX) return { error: `Title is capped at ${TITLE_MAX} characters.` }

  const kindRaw = String(formData.get('kind') ?? '')
  if (!isCalendarKind(kindRaw)) return { error: 'Unknown event kind.' }

  const all_day = formData.get('all_day') === 'on'

  const startRaw = String(formData.get(all_day ? 'start_date' : 'start_local') ?? '')
  const starts_at = parseLondonInstant(startRaw, all_day)
  if (!starts_at) return { error: 'A valid start date/time is required.' }

  const endRaw = String(formData.get(all_day ? 'end_date' : 'end_local') ?? '').trim()
  const ends_at = endRaw ? parseLondonInstant(endRaw, all_day) : null
  if (endRaw && !ends_at) return { error: 'End date/time is invalid.' }
  // Mirrors the calendar_events_ends_after_start CHECK constraint — caught here
  // for a friendly message rather than surfacing the raw Postgres error.
  if (ends_at && ends_at < starts_at) return { error: 'End must be on or after the start.' }

  const location = String(formData.get('location') ?? '').trim()
  if (location.length > LOCATION_MAX) {
    return { error: `Location is capped at ${LOCATION_MAX} characters.` }
  }

  const description = String(formData.get('description') ?? '').trim()
  if (description.length > DESCRIPTION_MAX) {
    return { error: `Description is capped at ${DESCRIPTION_MAX} characters.` }
  }

  const community_id = String(formData.get('community_id') ?? '').trim()

  return {
    title,
    description: description || null,
    location: location || null,
    kind: kindRaw,
    starts_at,
    ends_at,
    all_day,
    community_id: community_id || null,
  }
}

export async function createEvent(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const fields = readEventFields(formData)
  if ('error' in fields) return { ok: false, error: fields.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('calendar_events')
    .insert({ ...fields, created_by: profile.id })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/calendar')
  return { ok: true }
}

/**
 * RLS scopes UPDATE to the event's creator or an admin/owner. A member without
 * permission does not get a Postgres error here — the row simply isn't matched
 * by the policy's USING clause, so `.update()` succeeds with zero rows. Select
 * the row back and treat "nothing came back" as the friendly permission error
 * it actually is, rather than reporting success for a write that didn't happen.
 */
export async function updateEvent(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing event id.' }

  const fields = readEventFields(formData)
  if ('error' in fields) return { ok: false, error: fields.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('calendar_events')
    .update(fields)
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Couldn't save — the event may have been removed, or you don't have permission to edit it.",
    }
  }

  revalidatePath('/calendar')
  return { ok: true }
}

export async function deleteEvent(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing event id.' }

  const supabase = await createClient()
  // Same silent-zero-rows reasoning as updateEvent above.
  const { data, error } = await supabase
    .from('calendar_events')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Couldn't delete — the event may already be gone, or you don't have permission.",
    }
  }

  revalidatePath('/calendar')
  return { ok: true }
}
