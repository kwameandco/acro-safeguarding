import Link from 'next/link'
import { FileText, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCurrentUserLead } from '@/lib/supabase/cached-server'
import { formatLondon, londonDateKey } from '@/lib/shared/time'
import { Badge } from '@/components/ui/field'
import { DashboardSection } from '@/components/dashboard/DashboardSection'
import { StatCard } from '@/components/dashboard/StatCard'

/**
 * Dashboard feed — the team's front door. Five reads, each one independent:
 * next 5 calendar_events, my open board_tasks, latest 3 announcements,
 * latest 3 resources, and — leads/owners only — the open incident_reports
 * count + latest 3. Every read goes through `safeRead` below, so a single
 * failed table (permission error, a module's migration not yet applied,
 * whatever) degrades that one section to a quiet note instead of throwing
 * and blanking the whole page.
 *
 * Tone/label maps for the other modules' CHECK-constraint enums are
 * deliberately re-declared here rather than imported from their owning
 * lib/<module>/types.ts. This file has to stand on its own regardless of
 * those modules' state — keep these in sync with the CHECK constraints in
 * supabase/migrations/20260827{120400,120500,120800}*.sql if those enums
 * are ever widened.
 */

type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

const CALENDAR_KIND_TONE: Record<string, BadgeTone> = {
  meeting: 'blue',
  training: 'green',
  community_event: 'amber',
  deadline: 'red',
  other: 'neutral',
}

const BOARD_STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  doing: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
}

const SEVERITY_TONE: Record<string, BadgeTone> = {
  low: 'neutral',
  medium: 'amber',
  high: 'red',
  critical: 'red',
}

type UpcomingEvent = {
  id: string
  title: string
  starts_at: string
  kind: string
  all_day: boolean
}

type OpenTask = {
  id: string
  title: string
  status: string
  due_on: string | null
}

type AnnouncementRow = {
  id: string
  title: string
  pinned: boolean
  published_at: string
}

type ResourceRow = {
  id: string
  title: string
  kind: string
  created_at: string
}

type IncidentRow = {
  id: string
  reference: string
  summary: string
  severity: string
  status: string
  created_at: string
}

type QueryResult<T> = {
  data: T[] | null
  error: { message: string } | null
  count?: number | null
}

type Feed<T> = { rows: T[]; error: string | null; count: number | null }

/**
 * A Supabase query error resolves `{ data: null, error }` rather than
 * throwing, but a genuine network-level failure can still reject the
 * promise. Either way, nothing here may propagate past this wrapper —
 * one bad read must never blank the rest of the dashboard.
 */
async function safeRead<T>(query: PromiseLike<QueryResult<T>>): Promise<Feed<T>> {
  try {
    const { data, error, count } = await query
    return { rows: data ?? [], error: error?.message ?? null, count: count ?? null }
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : 'Something went wrong.',
      count: null,
    }
  }
}

export default async function DashboardPage() {
  const [profile, isLead] = await Promise.all([getCurrentProfile(), isCurrentUserLead()])
  const supabase = await createClient()
  const meId = profile?.id ?? ''
  const nowIso = new Date().toISOString()
  const todayKey = londonDateKey(nowIso)

  const [events, tasks, announcements, resources, incidents] = await Promise.all([
    safeRead<UpcomingEvent>(
      supabase
        .from('calendar_events')
        .select('id, title, starts_at, kind, all_day', { count: 'exact' })
        .gte('starts_at', nowIso)
        .order('starts_at', { ascending: true })
        .limit(5)
    ),
    safeRead<OpenTask>(
      supabase
        .from('board_tasks')
        .select('id, title, status, due_on', { count: 'exact' })
        .eq('assignee_id', meId)
        .neq('status', 'done')
        .order('due_on', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true })
        .limit(5)
    ),
    safeRead<AnnouncementRow>(
      supabase
        .from('announcements')
        .select('id, title, pinned, published_at')
        .order('pinned', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(3)
    ),
    safeRead<ResourceRow>(
      supabase
        .from('resources')
        .select('id, title, kind, created_at')
        .order('created_at', { ascending: false })
        .limit(3)
    ),
    safeRead<IncidentRow>(
      isLead
        ? supabase
            .from('incident_reports')
            .select('id, reference, summary, severity, status, created_at', { count: 'exact' })
            .in('status', ['open', 'investigating'])
            .order('created_at', { ascending: false })
            .limit(3)
        : Promise.resolve({ data: null, error: null, count: null })
    ),
  ])

  // A failed read must never render as the number zero — on a safeguarding
  // dashboard "0 open incidents" reads as reassurance, and that is worse than
  // an honest "—" when the truth is "we don't know".
  const upcomingCount = events.error ? null : events.count
  const openTaskCount = tasks.error ? null : tasks.count
  const openIncidentCount = incidents.error ? null : incidents.count

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-base font-semibold">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}
        </h1>
        <p className="text-muted-foreground">Cross-community safeguarding team</p>
      </header>

      <section className={isLead ? 'grid gap-4 sm:grid-cols-3' : 'grid gap-4 sm:grid-cols-2'}>
        <StatCard label="Upcoming events" value={upcomingCount} />
        <StatCard label="My open tasks" value={openTaskCount} />
        {isLead && <StatCard label="Open incidents" value={openIncidentCount} />}
      </section>

      <DashboardSection title="Next up" href="/calendar">
        {events.error ? (
          <p className="text-muted-foreground">Couldn&apos;t load the calendar right now.</p>
        ) : events.rows.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing scheduled.{' '}
            <Link href="/calendar" className="text-primary hover:underline">
              Open the calendar
            </Link>{' '}
            to add something.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {events.rows.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium">{event.title}</span>
                  <Badge tone={CALENDAR_KIND_TONE[event.kind] ?? 'neutral'}>{event.kind}</Badge>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatLondon(event.starts_at, !event.all_day)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection title="My tasks" href="/board">
        {tasks.error ? (
          <p className="text-muted-foreground">Couldn&apos;t load your tasks right now.</p>
        ) : tasks.rows.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing open on the board for you.{' '}
            <Link href="/board" className="text-primary hover:underline">
              View the board
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {tasks.rows.map((task) => {
              const overdue = Boolean(task.due_on && task.due_on < todayKey)
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="truncate font-medium">{task.title}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {BOARD_STATUS_LABEL[task.status] ?? task.status}
                    </span>
                    <span className={overdue ? 'text-destructive' : 'text-muted-foreground'}>
                      {task.due_on ? formatLondon(task.due_on, false) : 'No due date'}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection title="Announcements" href="/announcements">
        {announcements.error ? (
          <p className="text-muted-foreground">Couldn&apos;t load announcements right now.</p>
        ) : announcements.rows.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing yet.{' '}
            <Link href="/announcements" className="text-primary hover:underline">
              See announcements
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {announcements.rows.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{a.title}</span>
                  {a.pinned && <Badge tone="amber">Pinned</Badge>}
                </span>
                <p className="text-xs text-muted-foreground">{formatLondon(a.published_at, false)}</p>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      <DashboardSection title="New resources" href="/resources">
        {resources.error ? (
          <p className="text-muted-foreground">Couldn&apos;t load resources right now.</p>
        ) : resources.rows.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing uploaded yet.{' '}
            <Link href="/resources" className="text-primary hover:underline">
              Browse resources
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {resources.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2">
                  {r.kind === 'file' ? (
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : (
                    <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="truncate font-medium">{r.title}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatLondon(r.created_at, false)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DashboardSection>

      {isLead && (
        <DashboardSection title="Open incidents" href="/incidents">
          {incidents.error ? (
            <p className="text-muted-foreground">Couldn&apos;t load incidents right now.</p>
          ) : incidents.rows.length === 0 ? (
            <p className="text-muted-foreground">
              No open or investigating cases.{' '}
              <Link href="/incidents" className="text-primary hover:underline">
                View all incidents
              </Link>
              .
            </p>
          ) : (
            <ul className="divide-y rounded-lg border bg-card">
              {incidents.rows.map((incident) => (
                <li key={incident.id}>
                  <Link
                    href={`/incidents/${incident.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-accent"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge tone={SEVERITY_TONE[incident.severity] ?? 'neutral'}>
                        {incident.severity}
                      </Badge>
                      <span className="truncate">{incident.summary}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {incident.reference}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      )}
    </div>
  )
}
