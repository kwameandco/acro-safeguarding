import { FileText, Link2, type LucideIcon } from 'lucide-react'

/**
 * CHECK-constraint enum — widen together with the `kind` CHECK on
 * public.resources (supabase/migrations/20260827120600_resources_library.sql),
 * same migration/session.
 */
export type ResourceKind = 'file' | 'link'

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  file: 'File',
  link: 'Link',
}

/**
 * Read with `RESOURCE_KIND_ICON[kind] ?? FileText` inline at the JSX call
 * site — never a bare index (renders as `<undefined />`, throws React #130),
 * and deliberately not wrapped in a helper function either: the React
 * Compiler's `react-hooks/static-components` rule flags a component reference
 * returned from a function call as "created during render", even when the
 * function only ever returns one of these two stable, already-declared
 * components. A direct object lookup doesn't trip it.
 */
export const RESOURCE_KIND_ICON: Record<ResourceKind, LucideIcon> = {
  file: FileText,
  link: Link2,
}

/** Sort options for the library list — all server-side via searchParams. */
export type ResourceSort = 'newest' | 'title' | 'updated'

export const RESOURCE_SORT_LABEL: Record<ResourceSort, string> = {
  newest: 'Newest',
  title: 'Title A–Z',
  updated: 'Recently updated',
}

export const RESOURCE_SORT_OPTIONS: ResourceSort[] = ['newest', 'title', 'updated']

export function isResourceSort(value: string): value is ResourceSort {
  return (RESOURCE_SORT_OPTIONS as string[]).includes(value)
}

/** Mirrors the `resources` bucket's `file_size_limit` (26214400 bytes). */
export const RESOURCE_MAX_FILE_BYTES = 25 * 1024 * 1024

/** Row shape of `public.resources`, one-to-one with the migration's columns. */
export type ResourceRow = {
  id: string
  title: string
  description: string | null
  kind: ResourceKind
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  url: string | null
  tags: string[]
  community_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

/** A resources row plus the two embeds the list view joins in. */
export type ResourceListItem = ResourceRow & {
  uploader: { id: string; display_name: string | null } | null
  community: { id: string; name: string } | null
}

export type CommunityOption = { id: string; name: string }
