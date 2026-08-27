import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatLondon } from '@/lib/shared/time'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/field'
import { FileText } from 'lucide-react'
import {
  RESOURCE_KIND_ICON,
  RESOURCE_KIND_LABEL,
  type CommunityOption,
  type ResourceListItem,
} from '@/lib/resources/types'
import { buildResourceHref, type ResourceQueryState } from './ResourceFilters'
import { ResourceActions } from './ResourceControls'

/** One row in the library list. Server-rendered; only ResourceActions is interactive. */
export function ResourceCard({
  resource,
  canManage,
  communities,
  communitiesError,
  current,
}: {
  resource: ResourceListItem
  canManage: boolean
  communities: CommunityOption[]
  communitiesError?: boolean
  current: ResourceQueryState
}) {
  const Icon = RESOURCE_KIND_ICON[resource.kind] ?? FileText

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-label={RESOURCE_KIND_LABEL[resource.kind] ?? 'Resource'}
      />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {resource.kind === 'file' ? (
            <Link
              href={`/resources/${resource.id}/open`}
              target="_blank"
              className="font-medium hover:underline"
            >
              {resource.title}
            </Link>
          ) : (
            <a
              href={resource.url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              {resource.title}
            </a>
          )}
          {resource.community && <Badge>{resource.community.name}</Badge>}
        </div>

        {resource.description && (
          <p className="line-clamp-2 text-muted-foreground">{resource.description}</p>
        )}

        {resource.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {resource.tags.map((tag) => {
              const selected = current.tag === tag
              return (
                <Link
                  key={tag}
                  href={buildResourceHref(current, { tag: selected ? '' : tag })}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(buttonVariants({ variant: selected ? 'default' : 'outline', size: 'xs' }))}
                >
                  {tag}
                </Link>
              )
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Added by {resource.uploader?.display_name ?? 'Unknown'} ·{' '}
          {formatLondon(resource.created_at, false)}
        </p>
      </div>

      <div className="shrink-0">
        <ResourceActions
          resource={resource}
          canManage={canManage}
          communities={communities}
          communitiesError={communitiesError}
        />
      </div>
    </li>
  )
}
