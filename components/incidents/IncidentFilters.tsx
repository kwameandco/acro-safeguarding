'use client'

import Link from 'next/link'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { buttonVariants } from '@/components/ui/button'
import { Select, Label } from '@/components/ui/field'
import {
  INCIDENT_STATUSES,
  STATUS_LABEL,
  INCIDENT_SEVERITIES,
  SEVERITY_LABEL,
  type CommunityOption,
} from '@/lib/incidents/types'

/**
 * Filters live in the URL, not component state — a filtered view is
 * shareable and survives a refresh, and the server page reads the same
 * params to run the actual RLS-scoped query. This component only edits the
 * URL; it has no say over what data comes back.
 */
export function IncidentFilters({ communities }: { communities: CommunityOption[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const status = searchParams.get('status') ?? ''
  const severity = searchParams.get('severity') ?? ''
  const community = searchParams.get('community') ?? ''
  const hasFilter = Boolean(status || severity || community)

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    // A fresh filter pass shouldn't keep re-showing a stale submission banner.
    params.delete('submitted')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="filter-status">Status</Label>
        <Select
          id="filter-status"
          className="h-8 w-auto text-xs"
          value={status}
          onChange={(e) => setParam('status', e.target.value)}
        >
          <option value="">All statuses</option>
          {INCIDENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="filter-severity">Severity</Label>
        <Select
          id="filter-severity"
          className="h-8 w-auto text-xs"
          value={severity}
          onChange={(e) => setParam('severity', e.target.value)}
        >
          <option value="">All severities</option>
          {INCIDENT_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s] ?? s}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="filter-community">Community</Label>
        <Select
          id="filter-community"
          className="h-8 w-auto text-xs"
          value={community}
          onChange={(e) => setParam('community', e.target.value)}
        >
          <option value="">All communities</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">Leads only (no community)</option>
        </Select>
      </div>
      {hasFilter && (
        <Link href={pathname} className={buttonVariants({ variant: 'outline', size: 'xs' })}>
          Clear filters
        </Link>
      )}
    </div>
  )
}
