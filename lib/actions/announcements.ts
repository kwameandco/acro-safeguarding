'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile, isCurrentUserAdmin } from '@/lib/supabase/cached-server'
import type { ActionResult } from './profile'

const TITLE_MAX = 200
const BODY_MAX = 20000

/** Native checkbox semantics: present+"on" when checked, absent when not —
 *  but a value we set ourselves (the pin-toggle button) sends "true"/"false" */
function readPinned(formData: FormData): boolean {
  const raw = formData.get('pinned')
  return raw === 'on' || raw === 'true'
}

function validateFields(formData: FormData): { title: string; body_md: string } | { error: string } {
  const title = String(formData.get('title') ?? '').trim()
  const body_md = String(formData.get('body_md') ?? '').trim()

  if (!title) return { error: 'Title is required.' }
  if (title.length > TITLE_MAX) return { error: `Title is capped at ${TITLE_MAX} characters.` }
  if (!body_md) return { error: 'Body is required.' }
  if (body_md.length > BODY_MAX) return { error: `Body is capped at ${BODY_MAX} characters.` }

  return { title, body_md }
}

/**
 * Admins/owners write, everyone reads — RLS on public.announcements is the
 * real enforcement (see migration 20260827120700). The isCurrentUserAdmin()
 * check here is a courtesy for a clean error message, same shape as
 * lib/actions/team.ts's inviteMember.
 */
export async function createAnnouncement(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }
  if (!(await isCurrentUserAdmin())) {
    return { ok: false, error: 'Only an admin or owner can post an announcement.' }
  }

  const fields = validateFields(formData)
  if ('error' in fields) return { ok: false, error: fields.error }

  const supabase = await createClient()
  const { error } = await supabase.from('announcements').insert({
    title: fields.title,
    body_md: fields.body_md,
    pinned: readPinned(formData),
    author_id: profile.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/announcements')
  revalidatePath('/')
  return { ok: true }
}

export async function updateAnnouncement(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }
  if (!(await isCurrentUserAdmin())) {
    return { ok: false, error: 'Only an admin or owner can edit an announcement.' }
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing announcement id.' }

  const fields = validateFields(formData)
  if ('error' in fields) return { ok: false, error: fields.error }

  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({ title: fields.title, body_md: fields.body_md })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/announcements')
  revalidatePath('/')
  return { ok: true }
}

/** One-click pin/unpin from the feed — separate from updateAnnouncement so
 *  toggling pin state never requires opening the edit form. */
export async function setAnnouncementPinned(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }
  if (!(await isCurrentUserAdmin())) {
    return { ok: false, error: 'Only an admin or owner can pin an announcement.' }
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing announcement id.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('announcements')
    .update({ pinned: readPinned(formData) })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/announcements')
  revalidatePath('/')
  return { ok: true }
}

export async function deleteAnnouncement(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }
  if (!(await isCurrentUserAdmin())) {
    return { ok: false, error: 'Only an admin or owner can delete an announcement.' }
  }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing announcement id.' }

  const supabase = await createClient()
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/announcements')
  revalidatePath('/')
  return { ok: true }
}
