import { createClient } from '@/lib/supabase/server'
import { isCurrentUserAdmin } from '@/lib/supabase/cached-server'
import { AnnouncementComposer } from '@/components/announcements/AnnouncementComposer'
import { AnnouncementCard } from '@/components/announcements/AnnouncementCard'
import type { Announcement } from '@/lib/announcements/types'

export default async function AnnouncementsPage() {
  const isAdmin = await isCurrentUserAdmin()
  const supabase = await createClient()

  // Two independent queries run in parallel rather than a PostgREST foreign-
  // table embed: this keeps the author lookup independent of how the FK
  // constraint happens to be named, and profiles is team-wide readable (see
  // 20260827120100) so fetching the whole list once is simpler than filtering
  // down to just the author ids used on this page.
  const [{ data: announcements, error: announcementsError }, { data: profiles }] = await Promise.all([
    supabase
      .from('announcements')
      .select('id, title, body_md, pinned, author_id, published_at, created_at, updated_at')
      .order('pinned', { ascending: false })
      .order('published_at', { ascending: false }),
    supabase.from('profiles').select('id, display_name, email'),
  ])

  const authorNames = new Map<string, string>()
  for (const p of profiles ?? []) {
    authorNames.set(p.id, p.display_name ?? p.email ?? 'Team member')
  }

  const items = (announcements ?? []) as Announcement[]

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-base font-semibold">Announcements</h1>
        <p className="text-muted-foreground">
          Team-wide updates from admins and owners — pinned items stay at the top.
        </p>
      </header>

      {isAdmin && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Post an announcement</h2>
          <AnnouncementComposer />
        </section>
      )}

      <section className="space-y-4">
        {announcementsError ? (
          <p className="text-muted-foreground">Couldn&apos;t load announcements.</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">
            {isAdmin
              ? "No announcements yet — post the first one above to let the team know what's new."
              : 'Nothing yet.'}
          </p>
        ) : (
          <ul className="space-y-4">
            {items.map((a) => (
              <li key={a.id}>
                <AnnouncementCard
                  announcement={a}
                  authorName={a.author_id ? (authorNames.get(a.author_id) ?? null) : null}
                  isAdmin={isAdmin}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
