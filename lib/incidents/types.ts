/**
 * Mirrors the CHECK constraints in
 * supabase/migrations/20260827120800_incident_reports.sql. Widen a union here
 * in the same migration/session that widens its constraint — never one
 * without the other (see that file's header + CLAUDE.md's CHECK-enum rule).
 */

export type IncidentSource = 'team' | 'public'

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'

export type IncidentCategory =
  | 'welfare'
  | 'conduct'
  | 'injury'
  | 'boundary'
  | 'disclosure'
  | 'other'

export type IncidentStatus = 'open' | 'investigating' | 'referred' | 'resolved' | 'closed'

export const INCIDENT_SEVERITIES: IncidentSeverity[] = ['low', 'medium', 'high', 'critical']

export const INCIDENT_CATEGORIES: IncidentCategory[] = [
  'welfare',
  'conduct',
  'injury',
  'boundary',
  'disclosure',
  'other',
]

export const INCIDENT_STATUSES: IncidentStatus[] = [
  'open',
  'investigating',
  'referred',
  'resolved',
  'closed',
]

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

export const CATEGORY_LABEL: Record<IncidentCategory, string> = {
  welfare: 'Welfare',
  conduct: 'Conduct',
  injury: 'Injury',
  boundary: 'Boundary',
  disclosure: 'Disclosure',
  other: 'Other',
}

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  referred: 'Referred',
  resolved: 'Resolved',
  closed: 'Closed',
}

/** Matches the tone keys `components/ui/field.tsx`'s <Badge> accepts. */
export type BadgeTone = 'neutral' | 'green' | 'amber' | 'red' | 'blue'

// Spec: low = neutral, medium = amber, high/critical = red.
export const SEVERITY_TONE: Record<IncidentSeverity, BadgeTone> = {
  low: 'neutral',
  medium: 'amber',
  high: 'red',
  critical: 'red',
}

// Not specified by the spec beyond "a status Badge" — chosen so the trail
// reads at a glance: amber while it needs eyes, blue while in motion, green
// once put down, neutral once archived.
export const STATUS_TONE: Record<IncidentStatus, BadgeTone> = {
  open: 'amber',
  investigating: 'blue',
  referred: 'blue',
  resolved: 'green',
  closed: 'neutral',
}

export type CommunityOption = {
  id: string
  name: string
}

/** Row shape for the /incidents list select — only what the list renders. */
export type IncidentListRow = {
  id: string
  reference: string
  summary: string
  severity: IncidentSeverity
  category: IncidentCategory
  status: IncidentStatus
  community_id: string | null
  occurred_at: string | null
  created_at: string
  communities: { name: string } | null
}

/** Full row shape for the /incidents/[id] detail select. */
export type IncidentDetailRow = {
  id: string
  reference: string
  community_id: string | null
  occurred_at: string | null
  location: string | null
  subject_name: string | null
  subject_contact: string | null
  involves_minor: boolean
  severity: IncidentSeverity
  category: IncidentCategory
  summary: string
  detail: string | null
  actions_taken: string | null
  status: IncidentStatus
  referred_to: string | null
  resolved_at: string | null
  resolved_by: string | null
  reported_by: string | null
  created_at: string
  communities: { name: string } | null
}

export type IncidentNoteRow = {
  id: string
  body: string
  created_at: string
  author_id: string | null
  profiles: { display_name: string | null } | null
}
