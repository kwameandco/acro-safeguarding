/**
 * Row shape for `public.announcements` (migration 20260827120700).
 *
 * No CHECK-constraint enum columns on this table, so there is no TS union to
 * widen in lockstep with the schema — this file exists only so the page and
 * its components share one type instead of redeclaring the shape three times.
 */
export type Announcement = {
  id: string
  title: string
  body_md: string
  pinned: boolean
  author_id: string | null
  published_at: string
  created_at: string
  updated_at: string
}
