import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import type { BoardCommunity, BoardProfile, BoardTask } from '@/lib/board/types'
import { BoardBoard } from '@/components/board/BoardBoard'
import { BoardFilters } from '@/components/board/BoardFilters'

const TASK_COLUMNS =
  'id, title, detail, status, position, assignee_id, due_on, community_id, created_by, created_at, updated_at'

export default async function BoardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const mineOnly = params.assignee === 'me'
  const communityId = typeof params.community === 'string' ? params.community : ''

  const profile = await getCurrentProfile()
  // PortalLayout already requires a signed-in, active profile to reach here.
  if (!profile) return null

  const supabase = await createClient()

  let taskQuery = supabase.from('board_tasks').select(TASK_COLUMNS)
  if (mineOnly) taskQuery = taskQuery.eq('assignee_id', profile.id)
  if (communityId) taskQuery = taskQuery.eq('community_id', communityId)

  const [tasksRes, profilesRes, communitiesRes] = await Promise.all([
    taskQuery.order('position', { ascending: true }),
    supabase.from('profiles').select('id, display_name').order('display_name'),
    supabase.from('communities').select('id, name').eq('is_active', true).order('name'),
  ])

  const tasks: BoardTask[] = tasksRes.data ?? []
  const profiles: BoardProfile[] = profilesRes.data ?? []
  const communities: BoardCommunity[] = communitiesRes.data ?? []
  const isAdminOrOwner = Boolean(profile.is_admin || profile.role === 'owner')

  const degradedNote = tasksRes.error
    ? null // the whole board is replaced by a message below; no need to also note this here
    : profilesRes.error && communitiesRes.error
      ? "Couldn't load member or community details — names may be missing below."
      : profilesRes.error
        ? "Couldn't load member details — assignee names may be missing below."
        : communitiesRes.error
          ? "Couldn't load community details — community tags may be missing below."
          : null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-base font-semibold">Task board</h1>
        <p className="text-muted-foreground">
          Shared kanban for the whole safeguarding team — todo, in progress, blocked, done.
        </p>
      </header>

      <BoardFilters
        communities={communities}
        activeMineOnly={mineOnly}
        activeCommunityId={communityId}
        communitiesUnavailable={Boolean(communitiesRes.error)}
      />

      {degradedNote && <p className="text-xs text-muted-foreground">{degradedNote}</p>}

      {tasksRes.error ? (
        <p className="text-muted-foreground">Couldn&apos;t load the board right now. Try refreshing the page.</p>
      ) : (
        <BoardBoard
          initialTasks={tasks}
          profiles={profiles}
          communities={communities}
          currentProfileId={profile.id}
          isAdminOrOwner={isAdminOrOwner}
          hasActiveFilters={mineOnly || Boolean(communityId)}
        />
      )}
    </div>
  )
}
