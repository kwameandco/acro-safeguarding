'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/field'
import type { BoardCommunity } from '@/lib/board/types'

/**
 * Filter row: "Me" toggle + community Select. Both are thin wrappers over the
 * URL — the server page reads `?assignee=me&community=<id>` and does the
 * actual filtering, so this component only ever navigates, it never filters
 * client-side. Current values arrive as props (already parsed server-side)
 * rather than via `useSearchParams()`, which sidesteps that hook's Suspense
 * requirement entirely.
 */
export function BoardFilters({
  communities,
  activeMineOnly,
  activeCommunityId,
  communitiesUnavailable,
}: {
  communities: BoardCommunity[]
  activeMineOnly: boolean
  activeCommunityId: string
  communitiesUnavailable: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()

  function navigate(next: { mineOnly: boolean; communityId: string }) {
    const params = new URLSearchParams()
    if (next.mineOnly) params.set('assignee', 'me')
    if (next.communityId) params.set('community', next.communityId)
    const query = params.toString()
    router.push(query ? `${pathname}?${query}` : pathname)
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Button
        type="button"
        size="sm"
        variant={activeMineOnly ? 'default' : 'outline'}
        aria-pressed={activeMineOnly}
        onClick={() => navigate({ mineOnly: !activeMineOnly, communityId: activeCommunityId })}
      >
        My tasks
      </Button>

      <div className="min-w-48">
        <Label htmlFor="board-community-filter">Community</Label>
        <Select
          id="board-community-filter"
          value={activeCommunityId}
          disabled={communitiesUnavailable}
          onChange={(e) => navigate({ mineOnly: activeMineOnly, communityId: e.target.value })}
        >
          <option value="">All communities</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {communitiesUnavailable && (
        <p className="text-xs text-muted-foreground">Community list couldn&apos;t load.</p>
      )}
    </div>
  )
}
