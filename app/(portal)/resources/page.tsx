import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import {
  isResourceSort,
  type CommunityOption,
  type ResourceListItem,
  type ResourceSort,
} from '@/lib/resources/types'
import { ResourceFilters, type ResourceQueryState } from '@/components/resources/ResourceFilters'
import { ResourceCard } from '@/components/resources/ResourceCard'
import { AddResourceForm } from '@/components/resources/ResourceControls'

const RESOURCE_COLUMNS = `
  id, title, description, kind, storage_path, file_name, mime_type, size_bytes, url,
  tags, community_id, created_by, created_at, updated_at,
  uploader:profiles!created_by(id, display_name),
  community:communities!community_id(id, name)
`

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const q = firstParam(params.q).trim()
  const tag = firstParam(params.tag).trim().toLowerCase()
  const sortRaw = firstParam(params.sort).trim()
  const sort: ResourceSort = isResourceSort(sortRaw) ? sortRaw : 'newest'
  const openFailed = firstParam(params.error) === 'open-failed'

  const profile = await getCurrentProfile()
  const supabase = await createClient()

  let query = supabase.from('resources').select(RESOURCE_COLUMNS)
  if (q) query = query.textSearch('search', q, { type: 'websearch', config: 'english' })
  if (tag) query = query.contains('tags', [tag])
  query =
    sort === 'title'
      ? query.order('title', { ascending: true })
      : sort === 'updated'
        ? query.order('updated_at', { ascending: false })
        : query.order('created_at', { ascending: false })

  // Independent per-query error degradation: a broken communities read should
  // never blank the resource list, and vice versa.
  const [{ data: resourcesData, error: resourcesError }, { data: communitiesData, error: communitiesError }] =
    await Promise.all([
      query,
      supabase.from('communities').select('id, name').eq('is_active', true).order('name'),
    ])

  // Without generated Database types, postgrest-js can't resolve embed
  // cardinality from the select string alone and defaults every embed to an
  // array shape — even for created_by/community_id, which are genuinely
  // to-one FKs. Cast through `unknown`, as TS's own error for this exact
  // mismatch recommends, rather than reshaping the type to match a compile-time
  // artifact that doesn't reflect what PostgREST actually returns.
  const rows = (resourcesData ?? []) as unknown as ResourceListItem[]
  const communities = (communitiesData ?? []) as CommunityOption[]
  const communitiesFailed = Boolean(communitiesError)

  // Tag cloud is derived straight from the fetched rows — cheap, and it
  // always keeps the active tag selectable even if it's now the only row
  // carrying it.
  const cloudTags = new Set<string>(tag ? [tag] : [])
  for (const row of rows) for (const t of row.tags) cloudTags.add(t)
  const tags = Array.from(cloudTags).sort()

  const current: ResourceQueryState = { q, tag, sort }

  function canManage(resource: ResourceListItem): boolean {
    if (!profile) return false
    return Boolean(profile.is_admin || profile.role === 'owner' || resource.created_by === profile.id)
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-base font-semibold">Resources</h1>
        <p className="text-muted-foreground">
          Shared documents and links for the safeguarding team — policies, templates, guidance.
        </p>
      </header>

      {openFailed && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-destructive">
          Couldn&apos;t open that file — it may have been removed, or you may not have access to it.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Add a resource</h2>
        <AddResourceForm
          communities={communities}
          communitiesError={communitiesFailed}
          currentUserId={profile?.id ?? ''}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">Library</h2>

        <ResourceFilters q={q} tag={tag} sort={sort} tags={tags} />

        {resourcesError ? (
          <p className="text-muted-foreground">Couldn&apos;t load resources — try refreshing.</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">
            {q || tag
              ? 'No resources match that search.'
              : 'Nothing here yet — add the first policy, template or link above.'}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {rows.map((resource) => (
              <ResourceCard
                key={resource.id}
                resource={resource}
                canManage={canManage(resource)}
                communities={communities}
                communitiesError={communitiesFailed}
                current={current}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
