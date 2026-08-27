import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCurrentUserLead } from '@/lib/supabase/cached-server'
import { formatLondon } from '@/lib/shared/time'
import { buttonVariants } from '@/components/ui/button'
import { IncidentFilters } from '@/components/incidents/IncidentFilters'
import { SeverityBadge, StatusBadge } from '@/components/incidents/IncidentBadges'
import {
  CATEGORY_LABEL,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
  type CommunityOption,
  type IncidentListRow,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incidents/types'

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * The index. Three things this page has to get right, per the migration's
 * access model and the module's brief:
 *  1. Say who sees what, in plain language, before the list — an empty list
 *     here is a routine consequence of scoping, not evidence of a broken
 *     query or "nothing has happened".
 *  2. Filters are read from and written to the URL (see IncidentFilters) so
 *     a view is shareable and survives a refresh; the actual scoping is RLS,
 *     these `.eq()` calls only narrow within what RLS already allows back.
 *  3. Never throw a Supabase error into a blank route — degrade to a quiet
 *     message instead.
 */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const statusParam = firstParam(sp.status)
  const severityParam = firstParam(sp.severity)
  const communityParam = firstParam(sp.community)
  const submitted = firstParam(sp.submitted)

  const profile = await getCurrentProfile()
  const lead = await isCurrentUserLead()

  const supabase = await createClient()

  let query = supabase
    .from('incident_reports')
    .select(
      'id, reference, summary, severity, category, status, community_id, occurred_at, created_at, communities(name)'
    )
    .order('created_at', { ascending: false })

  if (statusParam && INCIDENT_STATUSES.includes(statusParam as IncidentStatus)) {
    query = query.eq('status', statusParam)
  }
  if (severityParam && INCIDENT_SEVERITIES.includes(severityParam as IncidentSeverity)) {
    query = query.eq('severity', severityParam)
  }
  if (communityParam === 'none') {
    query = query.is('community_id', null)
  } else if (communityParam) {
    query = query.eq('community_id', communityParam)
  }

  const [{ data: incidents, error }, { data: communities }] = await Promise.all([
    query.returns<IncidentListRow[]>(),
    supabase
      .from('communities')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .returns<CommunityOption[]>(),
  ])

  const filtered = Boolean(statusParam || severityParam || communityParam)
  const myCommunityName = communities?.find((c) => c.id === profile?.community_id)?.name

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold">Incidents</h1>
          <p className="text-muted-foreground">Safeguarding concerns and their follow-up.</p>
        </div>
        <Link
          href="/incidents/new"
          className={buttonVariants({ variant: 'default', size: 'default' })}
        >
          Report a concern
        </Link>
      </header>

      {submitted && (
        <div className="rounded-lg border border-success/40 bg-success/10 p-4">
          <p className="font-medium text-success">Report submitted — reference {submitted}</p>
          <p className="mt-1 text-muted-foreground">
            Save this reference somewhere safe. Depending on how it’s scoped, this report may
            not appear in the list below afterwards — that’s expected, not an error.
          </p>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 text-card-foreground">
        <h2 className="text-base font-semibold">Who can see what</h2>
        <p className="mt-2 text-muted-foreground">
          Safeguarding leads and the portal owner can see and work every incident here,
          whichever community it’s tagged to. Everyone else can see and work only the incidents
          tagged to their own community — an incident tagged “Leads only (no community)” is
          visible to leads and the owner alone.
        </p>
        <p className="mt-2 text-muted-foreground">
          {lead
            ? 'You’re a safeguarding lead, so the list below includes every incident, whatever it’s tagged to.'
            : profile?.community_id
              ? `The list below shows incidents tagged to your own community${myCommunityName ? ` (${myCommunityName})` : ''}.`
              : 'You don’t have a community assigned yet, so this list will usually be empty — ask an owner to set one.'}{' '}
          Anyone on the team can report a concern regardless of community, so a report you
          submit yourself may not go on to show up here.
        </p>
      </div>

      <section className="space-y-3">
        <IncidentFilters communities={communities ?? []} />

        {error ? (
          <p className="text-muted-foreground">Couldn’t load incidents right now.</p>
        ) : (incidents ?? []).length === 0 ? (
          <p className="text-muted-foreground">
            {filtered
              ? 'No incidents match these filters.'
              : lead
                ? 'No incidents logged yet.'
                : 'No incidents visible to you right now. That can mean there genuinely are none in your scope yet, or it can mean reports exist but are tagged to a different community, or to leads only — an empty list here doesn’t mean nothing has been reported.'}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {(incidents ?? []).map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/incidents/${row.id}`} className="font-medium hover:underline">
                      {row.reference}
                    </Link>
                    <SeverityBadge severity={row.severity} />
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="mt-1 truncate text-muted-foreground">{row.summary}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:flex-col sm:items-end">
                  <span>{CATEGORY_LABEL[row.category] ?? row.category}</span>
                  <span>{row.communities?.name ?? 'Leads only'}</span>
                  <span>{formatLondon(row.created_at, false)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
