import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { londonDateKey, londonDateKeysBetween, londonTime } from '@/lib/shared/time'
import {
  CALENDAR_KINDS,
  CALENDAR_KIND_LABEL,
  CALENDAR_KIND_TONE,
  type BadgeTone,
  type CalendarCommunity,
  type CalendarEvent,
} from '@/lib/calendar/types'
import { NewEventPanel } from '@/components/calendar/NewEventPanel'
import { AgendaItem } from '@/components/calendar/AgendaItem'

/**
 * Month calendar for the whole team. community_id is a filter TAG here, not a
 * boundary — RLS lets every active member read every row (see migration
 * 20260827120500's header), so this page shows everything and only uses
 * community for display/badges.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** Read with `?? TONE_DOT.neutral`, never a bare index. */
const TONE_DOT: Record<BadgeTone, string> = {
  blue: 'bg-primary',
  green: 'bg-success',
  amber: 'bg-warning',
  red: 'bg-destructive',
  neutral: 'bg-muted-foreground/50',
}

/** Parse ?month=YYYY-MM, falling back to the current London month. */
function resolveMonth(raw: string | undefined): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(raw ?? '')
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    if (month >= 1 && month <= 12) return { year, month }
  }
  const today = londonDateKey(new Date().toISOString())
  return { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }
}

function shiftMonth(year: number, month: number, delta: number): string {
  const zero = year * 12 + (month - 1) + delta
  return `${String(Math.floor(zero / 12)).padStart(4, '0')}-${String((zero % 12) + 1).padStart(2, '0')}`
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const { month: monthParam } = await searchParams
  const { year, month } = resolveMonth(monthParam)
  const monthKey = `${year}-${String(month).padStart(2, '0')}`

  // The grid runs Monday-first and spills into neighbouring months, so the
  // query window is padded a week each side rather than being the month
  // exactly — otherwise an event in a visible spill-over cell would be missing.
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1))
  const windowStart = new Date(firstOfMonth)
  windowStart.setUTCDate(windowStart.getUTCDate() - 7)
  const windowEnd = new Date(Date.UTC(year, month, 1))
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 7)

  const now = new Date()
  const nowIso = now.toISOString()
  const in30Days = new Date(now)
  in30Days.setUTCDate(in30Days.getUTCDate() + 30)
  const in30DaysIso = in30Days.toISOString()

  const supabase = await createClient()
  const EVENT_COLS =
    'id, title, description, location, kind, starts_at, ends_at, all_day, community_id, created_by, created_at, updated_at'

  const [profile, monthResult, agendaResult, { data: communityRows }] = await Promise.all([
    getCurrentProfile(),
    supabase
      .from('calendar_events')
      .select(EVENT_COLS)
      .gte('starts_at', windowStart.toISOString())
      .lt('starts_at', windowEnd.toISOString())
      .order('starts_at'),
    supabase
      .from('calendar_events')
      .select(EVENT_COLS)
      .gte('starts_at', nowIso)
      .lte('starts_at', in30DaysIso)
      .order('starts_at'),
    supabase.from('communities').select('id, name, is_active').order('name'),
  ])

  const monthEvents = (monthResult.data ?? []) as CalendarEvent[]
  const agendaEvents = (agendaResult.data ?? []) as CalendarEvent[]
  const communities = (communityRows ?? []) as CalendarCommunity[]
  const communityName = new Map(communities.map((c) => [c.id, c.name]))

  function canManageEvent(e: CalendarEvent): boolean {
    if (!profile) return false
    return profile.role === 'owner' || profile.is_admin || e.created_by === profile.id
  }

  // Bucket by London day — a multi-day event lands on every day it covers.
  const byDay = new Map<string, CalendarEvent[]>()
  for (const e of monthEvents) {
    for (const key of londonDateKeysBetween(e.starts_at, e.ends_at)) {
      const bucket = byDay.get(key)
      if (bucket) bucket.push(e)
      else byDay.set(key, [e])
    }
  }

  // Grid: back up to the Monday on or before the 1st, then run whole weeks
  // until the month is covered.
  const gridStart = new Date(firstOfMonth)
  const weekdayOfFirst = (gridStart.getUTCDay() + 6) % 7 // Mon = 0
  gridStart.setUTCDate(gridStart.getUTCDate() - weekdayOfFirst)

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const cellCount = Math.ceil((weekdayOfFirst + daysInMonth) / 7) * 7

  const cells = Array.from({ length: cellCount }, (_, i) => {
    const d = new Date(gridStart)
    d.setUTCDate(d.getUTCDate() + i)
    const key = d.toISOString().slice(0, 10)
    return { key, dayNumber: d.getUTCDate(), inMonth: key.slice(0, 7) === monthKey }
  })

  const todayKey = londonDateKey(new Date().toISOString())
  const monthLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(firstOfMonth)
  const inMonthCount = monthEvents.filter(
    (e) => londonDateKey(e.starts_at).slice(0, 7) === monthKey
  ).length

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-base font-semibold">Calendar</h1>
        <p className="text-muted-foreground">
          Shared team calendar — meetings, training, community events and deadlines. Every
          active member sees every entry; the community tag is for filtering and display only.
        </p>
      </header>

      <NewEventPanel communities={communities} />

      {/* Month grid — a desktop overview. Mobile gets the agenda below instead
          of a squeezed grid; editing lives there too. */}
      <section className="hidden space-y-3 md:block">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-semibold">{monthLabel}</h2>
          <nav className="flex items-center gap-1" aria-label="Change month">
            <Link
              href={`/calendar?month=${shiftMonth(year, month, -1)}`}
              aria-label="Previous month"
              className={buttonVariants({ variant: 'outline', size: 'xs' })}
            >
              <ChevronLeft className="size-3.5" />
            </Link>
            <Link href="/calendar" className={buttonVariants({ variant: 'outline', size: 'xs' })}>
              Today
            </Link>
            <Link
              href={`/calendar?month=${shiftMonth(year, month, 1)}`}
              aria-label="Next month"
              className={buttonVariants({ variant: 'outline', size: 'xs' })}
            >
              <ChevronRight className="size-3.5" />
            </Link>
          </nav>
          <span className="text-xs text-muted-foreground">
            {inMonthCount === 0
              ? 'Nothing scheduled this month.'
              : `${inMonthCount} event${inMonthCount === 1 ? '' : 's'} this month.`}
          </span>
        </div>

        {monthResult.error ? (
          <p className="text-muted-foreground">Couldn&apos;t load the calendar grid.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-3xl">
                <div className="grid grid-cols-7 gap-px rounded-t-lg border border-b-0 bg-border">
                  {WEEKDAYS.map((d) => (
                    <div
                      key={d}
                      className="bg-card px-2 py-1.5 text-xs font-medium text-muted-foreground"
                    >
                      {d}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-px rounded-b-lg border bg-border">
                  {cells.map((cell) => {
                    const dayEvents = byDay.get(cell.key) ?? []
                    const isToday = cell.key === todayKey
                    return (
                      <div
                        key={cell.key}
                        className={cn(
                          'min-h-28 bg-card p-1.5 align-top',
                          !cell.inMonth && 'bg-muted/40'
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <span
                            className={cn(
                              'inline-flex size-5 items-center justify-center rounded-full text-xs',
                              cell.inMonth ? 'text-foreground' : 'text-muted-foreground',
                              isToday && 'bg-primary font-semibold text-primary-foreground'
                            )}
                          >
                            {cell.dayNumber}
                          </span>
                        </div>

                        <ul className="space-y-1">
                          {dayEvents.map((e) => {
                            const tone = CALENDAR_KIND_TONE[e.kind] ?? 'neutral'
                            const label = CALENDAR_KIND_LABEL[e.kind] ?? e.kind
                            const cName = e.community_id ? communityName.get(e.community_id) : undefined
                            return (
                              <li
                                key={`${cell.key}-${e.id}`}
                                title={`${e.title} — ${label}${cName ? ` — ${cName}` : ''}${
                                  e.location ? ` — ${e.location}` : ''
                                }`}
                                className="rounded px-1 py-0.5 text-xs"
                              >
                                <span className="flex items-center gap-1">
                                  <span
                                    aria-hidden="true"
                                    className={cn('size-1.5 shrink-0 rounded-full', TONE_DOT[tone] ?? TONE_DOT.neutral)}
                                  />
                                  <span className="truncate">{e.title}</span>
                                </span>
                                {!e.all_day && (
                                  <span className="block truncate pl-2.5 text-muted-foreground">
                                    {londonTime(e.starts_at)}
                                  </span>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span>Key:</span>
              {CALENDAR_KINDS.map((k) => (
                <span key={k} className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className={cn('size-1.5 rounded-full', TONE_DOT[CALENDAR_KIND_TONE[k] ?? 'neutral'])}
                  />
                  {CALENDAR_KIND_LABEL[k] ?? k}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Agenda — always visible; this is the whole calendar on mobile. */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold">Next 30 days</h2>
        {agendaResult.error ? (
          <p className="text-muted-foreground">Couldn&apos;t load the agenda.</p>
        ) : agendaEvents.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing in the next 30 days. Use New event above to add one.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {agendaEvents.map((e) => (
              <AgendaItem
                key={e.id}
                event={e}
                communityName={e.community_id ? (communityName.get(e.community_id) ?? null) : null}
                communities={communities}
                canManage={canManageEvent(e)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
