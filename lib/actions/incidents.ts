'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { londonLocalToUtcIso } from '@/lib/shared/time'
import type { ActionResult } from './profile'
import {
  INCIDENT_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_STATUSES,
  type IncidentCategory,
  type IncidentSeverity,
  type IncidentSource,
  type IncidentStatus,
} from '@/lib/incidents/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 'ASH-IR-' + 6 uppercase hex chars — mirrors public.generate_incident_reference()
 * in migration 20260827120800 exactly (same prefix, same shape). Generated
 * here in TypeScript, explicitly, rather than by calling that function as an
 * RPC: there is no live project to confirm how a scalar-returning RPC's
 * response is actually shaped when called through an (unavoidably, until the
 * project exists) untyped Supabase client, and getting that assumption wrong
 * is exactly the kind of thing that only shows up once real traffic hits it.
 * Keep this in step by hand if the DB-side format ever changes.
 */
function generateReference(): string {
  return `ASH-IR-${crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

export type CreateIncidentResult = { ok: true; reference: string } | { ok: false; error: string }

/**
 * Raise a concern. Two things here are load-bearing, both straight from
 * migration 20260827120800's header:
 *
 *  - The reference is minted HERE, client-side of the DB, and passed into
 *    the insert explicitly — it is never read back off the inserted row.
 *    `INSERT … RETURNING` is filtered by the table's SELECT policy, and a
 *    report tagged "Leads only" (or to a community other than the
 *    reporter's own) can land OUTSIDE the reporter's own read scope.
 *    `.insert().select().single()` would then come back as "0 rows" —
 *    reported to the reporter as a FAILED submission — even though the row
 *    saved perfectly well. Minting the reference up front sidesteps that
 *    trap entirely: we never need to read the row back to know what to show
 *    the reporter.
 *  - `source` and `reported_by` are set explicitly even though the INSERT
 *    policy pins both server-side anyway (`source = 'team' AND reported_by =
 *    auth.uid()`) — belt and braces, and it keeps this payload
 *    self-documenting rather than relying on a silent DB default.
 */
export async function createIncident(formData: FormData): Promise<CreateIncidentResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const communityRaw = String(formData.get('community_id') ?? '')
  if (!communityRaw) {
    return { ok: false, error: 'Choose who this report should be visible to.' }
  }
  const community_id = communityRaw === 'none' ? null : communityRaw
  if (community_id !== null && !UUID_RE.test(community_id)) {
    return { ok: false, error: 'Unrecognised community.' }
  }

  const category = String(formData.get('category') ?? '') as IncidentCategory
  if (!INCIDENT_CATEGORIES.includes(category)) {
    return { ok: false, error: 'Choose a category.' }
  }

  const severity = String(formData.get('severity') ?? '') as IncidentSeverity
  if (!INCIDENT_SEVERITIES.includes(severity)) {
    return { ok: false, error: 'Choose a severity.' }
  }

  const occurredLocal = String(formData.get('occurred_at') ?? '').trim()
  let occurred_at: string | null = null
  if (occurredLocal) {
    try {
      occurred_at = londonLocalToUtcIso(occurredLocal)
    } catch {
      return { ok: false, error: 'That date/time doesn’t look valid.' }
    }
  }

  const location = String(formData.get('location') ?? '').trim()
  if (location.length > 300) return { ok: false, error: 'Location is capped at 300 characters.' }

  const subject_name = String(formData.get('subject_name') ?? '').trim()
  if (subject_name.length > 200) {
    return { ok: false, error: 'That field is capped at 200 characters.' }
  }

  const subject_contact = String(formData.get('subject_contact') ?? '').trim()
  if (subject_contact.length > 200) {
    return { ok: false, error: 'Contact details are capped at 200 characters.' }
  }

  const involves_minor = formData.get('involves_minor') === 'on'

  const summary = String(formData.get('summary') ?? '').trim()
  if (!summary) return { ok: false, error: 'Summary is required.' }
  if (summary.length > 300) {
    return { ok: false, error: 'Summary is capped at 300 characters — put more detail below.' }
  }

  const detail = String(formData.get('detail') ?? '').trim()
  if (detail.length > 8000) return { ok: false, error: 'Detail is capped at 8,000 characters.' }

  const actions_taken = String(formData.get('actions_taken') ?? '').trim()
  if (actions_taken.length > 4000) {
    return { ok: false, error: 'Actions taken is capped at 4,000 characters.' }
  }

  const source: IncidentSource = 'team'
  const supabase = await createClient()

  const basePayload = {
    source,
    reported_by: profile.id,
    community_id,
    occurred_at,
    location: location || null,
    subject_name: subject_name || null,
    subject_contact: subject_contact || null,
    involves_minor,
    severity,
    category,
    summary,
    detail: detail || null,
    actions_taken: actions_taken || null,
  }

  let reference = generateReference()
  let insertError = (
    await supabase.from('incident_reports').insert({ reference, ...basePayload })
  ).error

  if (insertError?.code === '23505') {
    // Reference collision — vanishingly unlikely (36^6 hex combinations) but
    // cheap to recover from: mint a fresh one and try exactly once more
    // rather than surfacing a scary error for something this rare.
    reference = generateReference()
    insertError = (
      await supabase.from('incident_reports').insert({ reference, ...basePayload })
    ).error
  }

  if (insertError) {
    if (insertError.code === '23503') {
      return { ok: false, error: 'That community no longer exists — refresh and try again.' }
    }
    return { ok: false, error: insertError.message }
  }

  revalidatePath('/incidents')
  return { ok: true, reference }
}

/**
 * Status workflow. Moving INTO resolved/closed stamps resolved_at/resolved_by;
 * moving to anything else clears them, so a reopened case never carries a
 * stale resolution timestamp forward.
 *
 * The update is followed by `.select('id')` rather than a bare `.update()`.
 * UPDATE's RLS USING clause silently excludes rows the caller can't work —
 * Postgres just updates zero rows, no error — so without reading a row back
 * we cannot tell "nothing changed because you're out of scope" from "saved".
 * Unlike the create-flow's RETURNING trap above, this read-back is safe: the
 * UPDATE and SELECT policies on incident_reports share the exact same
 * predicate (`can_work_incident`), so anything the UPDATE touches is also
 * something its own RETURNING is allowed to show us.
 */
export async function setIncidentStatus(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing incident id.' }

  const status = String(formData.get('status') ?? '') as IncidentStatus
  if (!INCIDENT_STATUSES.includes(status)) return { ok: false, error: 'Unknown status.' }

  const referred_to = String(formData.get('referred_to') ?? '').trim()
  if (referred_to.length > 300) {
    return { ok: false, error: 'Referred-to is capped at 300 characters.' }
  }

  const patch: Record<string, unknown> = { status }
  if (status === 'referred') {
    if (!referred_to) return { ok: false, error: 'Enter who this was referred to.' }
    patch.referred_to = referred_to
  }
  if (status === 'resolved' || status === 'closed') {
    patch.resolved_at = new Date().toISOString()
    patch.resolved_by = profile.id
  } else {
    patch.resolved_at = null
    patch.resolved_by = null
  }

  const supabase = await createClient()
  const { data: updated, error } = await supabase
    .from('incident_reports')
    .update(patch)
    .eq('id', id)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) return { ok: false, error: error.message }
  if (!updated) {
    return { ok: false, error: 'Could not update this incident — it may not be visible to you.' }
  }

  revalidatePath(`/incidents/${id}`)
  revalidatePath('/incidents')
  return { ok: true }
}

/**
 * Append-only: there is deliberately no matching update/delete action.
 * `incident_notes` has no UPDATE/DELETE grant or policy at all — a correction
 * is a new note, never an edit to an old one.
 */
export async function addIncidentNote(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const incident_id = String(formData.get('incident_id') ?? '')
  if (!incident_id) return { ok: false, error: 'Missing incident id.' }

  const body = String(formData.get('body') ?? '').trim()
  if (!body) return { ok: false, error: 'Write something before adding a note.' }
  if (body.length > 4000) return { ok: false, error: 'Notes are capped at 4,000 characters.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('incident_notes')
    .insert({ incident_id, author_id: profile.id, body })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/incidents/${incident_id}`)
  return { ok: true }
}
