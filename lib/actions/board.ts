'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { isTaskStatus, midpointPosition, type TaskStatus } from '@/lib/board/types'

export type ActionResult = { ok: true } | { ok: false; error: string }

const BOARD_PATH = '/board'
const TITLE_MAX = 200
const DETAIL_MAX = 4000

function optionalId(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? '').trim()
  return raw || null
}

/**
 * New cards land at the end of their column — one extra read to find the
 * current max `position` in that status, same shape as `moveTask`'s
 * "append to end = max+1".
 */
async function nextPositionInColumn(
  supabase: Awaited<ReturnType<typeof createClient>>,
  status: TaskStatus
): Promise<number> {
  const { data } = await supabase
    .from('board_tasks')
    .select('position')
    .eq('status', status)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  return midpointPosition(data?.position ?? null, null)
}

export async function createTask(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { ok: false, error: 'Title is required.' }
  if (title.length > TITLE_MAX) return { ok: false, error: `Title is capped at ${TITLE_MAX} characters.` }

  const detail = String(formData.get('detail') ?? '').trim()
  if (detail.length > DETAIL_MAX) return { ok: false, error: `Detail is capped at ${DETAIL_MAX} characters.` }

  const dueOn = optionalId(formData, 'due_on')
  const assigneeId = optionalId(formData, 'assignee_id')
  const communityId = optionalId(formData, 'community_id')

  const supabase = await createClient()
  const position = await nextPositionInColumn(supabase, 'todo')

  const { error } = await supabase.from('board_tasks').insert({
    title,
    detail: detail || null,
    status: 'todo',
    position,
    assignee_id: assigneeId,
    due_on: dueOn,
    community_id: communityId,
    created_by: profile.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(BOARD_PATH)
  return { ok: true }
}

export async function updateTask(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { ok: false, error: 'Missing task id.' }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { ok: false, error: 'Title is required.' }
  if (title.length > TITLE_MAX) return { ok: false, error: `Title is capped at ${TITLE_MAX} characters.` }

  const detail = String(formData.get('detail') ?? '').trim()
  if (detail.length > DETAIL_MAX) return { ok: false, error: `Detail is capped at ${DETAIL_MAX} characters.` }

  const dueOn = optionalId(formData, 'due_on')
  const assigneeId = optionalId(formData, 'assignee_id')
  const communityId = optionalId(formData, 'community_id')

  const supabase = await createClient()
  const { error } = await supabase
    .from('board_tasks')
    .update({
      title,
      detail: detail || null,
      due_on: dueOn,
      assignee_id: assigneeId,
      community_id: communityId,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(BOARD_PATH)
  return { ok: true }
}

/**
 * RLS narrows this to the card's creator or a portal admin/owner — everyone
 * else's delete simply matches zero rows (no error). The UI only shows the
 * control to those the row policy would actually let through; this is the
 * enforcement, that is the render-time courtesy.
 */
export async function deleteTask(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const id = String(formData.get('id') ?? '').trim()
  if (!id) return { ok: false, error: 'Missing task id.' }

  const supabase = await createClient()
  const { error } = await supabase.from('board_tasks').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(BOARD_PATH)
  return { ok: true }
}

/**
 * Drag-and-drop and the per-card status Select both call this directly (not
 * via a `<form>` — there is no form for a drag gesture). `beforePos`/
 * `afterPos` are the neighbouring cards' positions in the destination column;
 * the new position is their midpoint, computed once here so drag and the
 * Select fallback can never disagree on the math.
 */
export async function moveTask(
  id: string,
  status: TaskStatus,
  beforePos: number | null,
  afterPos: number | null
): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }
  if (!id) return { ok: false, error: 'Missing task id.' }
  if (!isTaskStatus(status)) return { ok: false, error: 'Unknown status.' }

  const position = midpointPosition(beforePos, afterPos)

  const supabase = await createClient()
  const { error } = await supabase.from('board_tasks').update({ status, position }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(BOARD_PATH)
  return { ok: true }
}
