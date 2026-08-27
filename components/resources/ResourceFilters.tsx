import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { RESOURCE_SORT_LABEL, RESOURCE_SORT_OPTIONS, type ResourceSort } from '@/lib/resources/types'

export type ResourceQueryState = { q: string; tag: string; sort: ResourceSort }

/**
 * Builds a `/resources` href from the current filter state plus overrides,
 * dropping params at their default so the URL stays clean. Shared with
 * ResourceCard's per-tag chips so both places agree on the same query shape.
 */
export function buildResourceHref(current: ResourceQueryState, overrides: Partial<ResourceQueryState>) {
  const next = { ...current, ...overrides }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.tag) params.set('tag', next.tag)
  if (next.sort !== 'newest') params.set('sort', next.sort)
  const qs = params.toString()
  return qs ? `/resources?${qs}` : '/resources'
}

/**
 * Search box + sort links + tag cloud. Everything here is a plain GET —
 * server-rendered, no client JS needed, and it degrades to a normal page
 * navigation with no JavaScript at all.
 */
export function ResourceFilters({
  q,
  tag,
  sort,
  tags,
}: {
  q: string
  tag: string
  sort: ResourceSort
  tags: string[]
}) {
  const current: ResourceQueryState = { q, tag, sort }
  const hasFilters = Boolean(q || tag)

  return (
    <div className="space-y-3">
      <form action="/resources" method="get" className="flex flex-wrap items-center gap-2">
        {/* Preserve the other filters when a new search term is submitted. */}
        {tag && <input type="hidden" name="tag" value={tag} />}
        {sort !== 'newest' && <input type="hidden" name="sort" value={sort} />}
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search title, tags, description…"
          aria-label="Search resources"
          className="max-w-xs"
        />
        <Button type="submit" size="sm">
          Search
        </Button>
        {hasFilters && (
          <Link
            href="/resources"
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            Clear filters
          </Link>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Sort:</span>
        {RESOURCE_SORT_OPTIONS.map((option) => {
          const selected = sort === option
          return (
            <Link
              key={option}
              href={buildResourceHref(current, { sort: option })}
              aria-current={selected ? 'true' : undefined}
              className={cn(buttonVariants({ variant: selected ? 'default' : 'outline', size: 'xs' }))}
            >
              {RESOURCE_SORT_LABEL[option] ?? option}
            </Link>
          )
        })}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Tags:</span>
          {tags.map((t) => {
            const selected = tag === t
            return (
              <Link
                key={t}
                href={buildResourceHref(current, { tag: selected ? '' : t })}
                aria-current={selected ? 'true' : undefined}
                className={cn(buttonVariants({ variant: selected ? 'default' : 'outline', size: 'xs' }))}
              >
                {t}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
