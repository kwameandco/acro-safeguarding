/**
 * Shared calendar types. Mirrors migration 20260827120500_calendar_events.sql —
 * the `kind` CHECK constraint and this union widen together, in the same
 * migration/session (see CLAUDE.md §Architecture decisions).
 */

export const CALENDAR_KINDS = [
  'meeting',
  'training',
  'community_event',
  'deadline',
  'other',
] as const

export type CalendarKind = (typeof CALENDAR_KINDS)[number]

export function isCalendarKind(value: string): value is CalendarKind {
  return (CALENDAR_KINDS as readonly string[]).includes(value)
}

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  meeting: 'Meeting',
  training: 'Training',
  community_event: 'Community event',
  deadline: 'Deadline',
  other: 'Other',
}

/** Matches `keyof typeof badgeTones` in components/ui/field.tsx exactly. */
export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

/**
 * Read with `?? 'neutral'` at every call site, never a bare index — an
 * unhandled kind would otherwise render `<undefined />` and throw React #130.
 */
export const CALENDAR_KIND_TONE: Record<CalendarKind, BadgeTone> = {
  meeting: 'blue',
  training: 'green',
  community_event: 'amber',
  deadline: 'red',
  other: 'neutral',
}

export type CalendarEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  kind: CalendarKind
  starts_at: string
  ends_at: string | null
  all_day: boolean
  community_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/**
 * Carries `is_active` so a form editing an event tagged to a since-deactivated
 * community can still show that tag (labelled) instead of silently reassigning
 * the event to whatever option happens to be first in the list.
 */
export type CalendarCommunity = { id: string; name: string; is_active: boolean }
