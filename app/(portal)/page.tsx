import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { formatLondon } from '@/lib/events/time'
import { Badge } from '@/components/ui/field'

export default async function DashboardPage() {
  const profile = await getCurrentProfile()
  const supabase = await createClient()

  const nowIso = new Date().toISOString()
  const [upcoming, openTasks, memberCount] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, starts_at, status')
      .gte('starts_at', nowIso)
      .neq('status', 'cancelled')
      .order('starts_at')
      .limit(5),
    supabase
      .from('tasks_inbox')
      .select('id, slug, title, status, requires_approval, approved_by')
      .in('status', ['pending', 'in_progress', 'blocked'])
      .order('priority')
      .limit(8),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ])

  const needsApproval = (openTasks.data ?? []).filter(
    (t) => t.status === 'pending' && t.requires_approval && !t.approved_by
  ).length

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-base font-semibold">
          Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}
        </h1>
        <p className="text-muted-foreground">South London Acro — team portal.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Upcoming events</p>
          <p className="mt-1 text-2xl font-semibold">{upcoming.data?.length ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Open tasks</p>
          <p className="mt-1 text-2xl font-semibold">{openTasks.data?.length ?? 0}</p>
          {needsApproval > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">{needsApproval} awaiting approval</p>
          )}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Team members</p>
          <p className="mt-1 text-2xl font-semibold">{memberCount.count ?? 0}</p>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Next up</h2>
          <Link href="/events" className="text-primary hover:underline">
            All events
          </Link>
        </div>
        {(upcoming.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">
            Nothing scheduled.{' '}
            <Link href="/events/new" className="text-primary hover:underline">
              Add an event
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {(upcoming.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <Link href={`/events/${e.id}`} className="font-medium hover:underline">
                  {e.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatLondon(e.starts_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Task inbox</h2>
          <Link href="/tasks" className="text-primary hover:underline">
            All tasks
          </Link>
        </div>
        {(openTasks.data ?? []).length === 0 ? (
          <p className="text-muted-foreground">Inbox is clear.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {(openTasks.data ?? []).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <span className="truncate">{t.title}</span>
                {t.status === 'pending' && t.requires_approval && !t.approved_by ? (
                  <Badge tone="amber">needs approval</Badge>
                ) : (
                  <Badge tone={t.status === 'blocked' ? 'red' : 'blue'}>{t.status}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
