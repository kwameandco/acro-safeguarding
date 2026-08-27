import { Badge } from '@/components/ui/field'
import {
  SEVERITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  STATUS_TONE,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incidents/types'

/*
 * Small presentational wrappers so every list/detail render reads the same
 * label + tone maps the same way — `?? fallback`, never a bare index, per the
 * shared contract. No 'use client': these have no hooks and render fine from
 * a Server Component (same as <Badge> itself).
 */

export function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  return (
    <Badge tone={SEVERITY_TONE[severity] ?? 'neutral'}>{SEVERITY_LABEL[severity] ?? severity}</Badge>
  )
}

export function StatusBadge({ status }: { status: IncidentStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{STATUS_LABEL[status] ?? status}</Badge>
}
