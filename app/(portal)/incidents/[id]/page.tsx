import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatLondon } from '@/lib/shared/time'
import { Badge } from '@/components/ui/field'
import { SeverityBadge, StatusBadge } from '@/components/incidents/IncidentBadges'
import { IncidentStatusControl, IncidentNotes } from '@/components/incidents/IncidentWorkspace'
import { CATEGORY_LABEL, type IncidentDetailRow, type IncidentNoteRow } from '@/lib/incidents/types'

type ProfileNameRow = { id: string; display_name: string | null; email: string | null }

/**
 * Detail page for whoever RLS admits. A null fetch is rendered as a gentle,
 * honest message rather than `notFound()` — this repo has no `not-found.tsx`,
 * so a bare `notFound()` would fall through to Next's default 404 and drop
 * the portal chrome; a null row here is routine (wrong scope, not a broken
 * link) and deserves copy that says so.
 *
 * There is no separate "read-only viewer" tier: the SELECT and UPDATE
 * policies on incident_reports share the same `can_work_incident` predicate,
 * so anyone who can load this page at all can also change its status and add
 * a note to it.
 */
export default async function IncidentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: incident } = await supabase
    .from('incident_reports')
    .select(
      'id, reference, community_id, occurred_at, location, subject_name, subject_contact, involves_minor, severity, category, summary, detail, actions_taken, status, referred_to, resolved_at, resolved_by, reported_by, created_at, communities(name)'
    )
    .eq('id', id)
    .maybeSingle<IncidentDetailRow>()

  if (!incident) {
    return (
      <div className="max-w-xl space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        <h1 className="text-base font-semibold">Report not available</h1>
        <p className="text-muted-foreground">
          Either this report doesn’t exist, or it’s scoped to a community — or to leads and the
          owner — that doesn’t include you. That’s the access model working as intended, not an
          error.
        </p>
        <Link href="/incidents" className="inline-block text-primary hover:underline">
          Back to incidents
        </Link>
      </div>
    )
  }

  // Two FKs on incident_reports point at profiles (reported_by, resolved_by),
  // so an embedded `profiles(...)` select would be ambiguous without a
  // disambiguation hint. A plain follow-up lookup sidesteps that entirely —
  // there is no live project to verify embed-hint syntax against, so the
  // simpler, unambiguous query is the safer choice here.
  const peopleIds = [incident.reported_by, incident.resolved_by].filter(
    (v): v is string => Boolean(v)
  )
  const { data: people } = peopleIds.length
    ? await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', peopleIds)
        .returns<ProfileNameRow[]>()
    : { data: [] as ProfileNameRow[] }
  const nameById = new Map((people ?? []).map((p) => [p.id, p.display_name ?? p.email ?? 'Unknown']))

  const { data: notes } = await supabase
    .from('incident_notes')
    .select('id, body, created_at, author_id, profiles(display_name)')
    .eq('incident_id', id)
    .order('created_at')
    .returns<IncidentNoteRow[]>()

  return (
    <div className="max-w-2xl space-y-8">
      <header className="space-y-2">
        <Link href="/incidents" className="text-xs text-muted-foreground hover:underline">
          ← Back to incidents
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-semibold">{incident.reference}</h1>
          <SeverityBadge severity={incident.severity} />
          <StatusBadge status={incident.status} />
          {incident.involves_minor && <Badge tone="red">Involves a minor</Badge>}
        </div>
        <p className="text-xs text-muted-foreground">
          Logged {formatLondon(incident.created_at)}
          {incident.reported_by ? ` by ${nameById.get(incident.reported_by) ?? 'Unknown'}` : ''}
        </p>
      </header>

      <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Category</p>
          <p>{CATEGORY_LABEL[incident.category] ?? incident.category}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Community</p>
          <p>{incident.communities?.name ?? 'Leads only (no community)'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">When it happened</p>
          <p>{incident.occurred_at ? formatLondon(incident.occurred_at) : 'Not recorded'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Location</p>
          <p>{incident.location || 'Not recorded'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Subject</p>
          <p>{incident.subject_name || 'Not recorded'}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Subject contact</p>
          <p>{incident.subject_contact || 'Not recorded'}</p>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Summary</h2>
          <p className="mt-1 whitespace-pre-wrap">{incident.summary}</p>
        </div>
        {incident.detail && (
          <div>
            <h2 className="text-base font-semibold">Detail</h2>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{incident.detail}</p>
          </div>
        )}
        {incident.actions_taken && (
          <div>
            <h2 className="text-base font-semibold">Actions taken so far</h2>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {incident.actions_taken}
            </p>
          </div>
        )}
        {incident.referred_to && (
          <div>
            <h2 className="text-base font-semibold">Referred to</h2>
            <p className="mt-1 text-muted-foreground">{incident.referred_to}</p>
          </div>
        )}
        {incident.resolved_at && (
          <p className="text-xs text-muted-foreground">
            Resolved {formatLondon(incident.resolved_at)}
            {incident.resolved_by ? ` by ${nameById.get(incident.resolved_by) ?? 'Unknown'}` : ''}
          </p>
        )}
      </section>

      <IncidentStatusControl
        incidentId={incident.id}
        initialStatus={incident.status}
        initialReferredTo={incident.referred_to}
      />

      <IncidentNotes incidentId={incident.id} notes={notes ?? []} />
    </div>
  )
}
