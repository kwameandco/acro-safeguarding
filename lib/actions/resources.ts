'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { RESOURCE_MAX_FILE_BYTES } from '@/lib/resources/types'
import type { ActionResult } from './profile'

const TITLE_MAX = 200
const DESCRIPTION_MAX = 1000
const MAX_TAGS = 20
const MAX_TAG_LENGTH = 40

/** Comma-separated text → trimmed, lowercased, de-duplicated tag array. */
function parseTags(raw: FormDataEntryValue | null): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const part of String(raw ?? '').split(',')) {
    const tag = part.trim().toLowerCase()
    if (tag && tag.length <= MAX_TAG_LENGTH && !seen.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
  }
  return tags.slice(0, MAX_TAGS)
}

/** Empty select value → NULL ("No community"). */
function normaliseCommunityId(raw: FormDataEntryValue | null): string | null {
  const value = String(raw ?? '').trim()
  return value === '' ? null : value
}

type SharedFields = {
  title: string
  description: string | null
  tags: string[]
  community_id: string | null
}

/** Shared validation for title/description/tags/community — every action uses this. */
function readSharedFields(formData: FormData): SharedFields | { error: string } {
  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()

  if (!title) return { error: 'Title is required.' }
  if (title.length > TITLE_MAX) return { error: `Title is capped at ${TITLE_MAX} characters.` }
  if (description.length > DESCRIPTION_MAX) {
    return { error: `Description is capped at ${DESCRIPTION_MAX} characters.` }
  }

  return {
    title,
    description: description || null,
    tags: parseTags(formData.get('tags')),
    community_id: normaliseCommunityId(formData.get('community_id')),
  }
}

/** Link mode: inserts a `kind='link'` row. No storage involved. */
export async function createLinkResource(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const shared = readSharedFields(formData)
  if ('error' in shared) return { ok: false, error: shared.error }

  const url = String(formData.get('url') ?? '').trim()
  if (!url) return { ok: false, error: 'URL is required.' }
  try {
    new URL(url)
  } catch {
    return { ok: false, error: 'Enter a valid URL, including https://.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('resources').insert({
    ...shared,
    kind: 'link',
    url,
    created_by: profile.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/resources')
  return { ok: true }
}

/**
 * File mode: the browser has already uploaded the object straight to Storage
 * (own-folder policy checked there); this only inserts the metadata row.
 */
export async function createFileResource(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const shared = readSharedFields(formData)
  if ('error' in shared) return { ok: false, error: shared.error }

  const storagePath = String(formData.get('storage_path') ?? '').trim()
  const fileName = String(formData.get('file_name') ?? '').trim()
  const mimeType = String(formData.get('mime_type') ?? '').trim() || null
  const sizeBytesRaw = formData.get('size_bytes')
  const sizeBytes = sizeBytesRaw ? Number(sizeBytesRaw) : null

  if (!storagePath || !fileName) {
    return { ok: false, error: 'Upload did not complete — try again.' }
  }
  // Defence in depth: the storage policy already enforces the own-folder rule
  // at upload time. A mismatch here only happens via a client bug, but it
  // would otherwise insert a row pointing at a path this account could not
  // have written — reject rather than record it.
  if (!storagePath.startsWith(`${profile.id}/`)) {
    return { ok: false, error: 'Upload path does not match your account — try again.' }
  }
  if (sizeBytes !== null && (!Number.isFinite(sizeBytes) || sizeBytes > RESOURCE_MAX_FILE_BYTES)) {
    return { ok: false, error: 'That file is too large — the limit is 25 MB.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('resources').insert({
    ...shared,
    kind: 'file',
    storage_path: storagePath,
    file_name: fileName,
    mime_type: mimeType,
    size_bytes: sizeBytes,
    created_by: profile.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/resources')
  return { ok: true }
}

/** Title/description/tags/community only — kind, url and file fields never change. */
export async function updateResource(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing resource id.' }

  const shared = readSharedFields(formData)
  if ('error' in shared) return { ok: false, error: shared.error }

  const supabase = await createClient()
  // `.select().maybeSingle()` after the update, not just checking `error`: RLS
  // makes an update to a row you can't touch match zero rows rather than
  // error, and skipping this check would report false success to a member
  // trying to edit someone else's resource.
  const { data, error } = await supabase
    .from('resources')
    .update(shared)
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: "Resource not found, or you don't have permission to edit it." }

  revalidatePath('/resources')
  return { ok: true }
}

/** Uploader or admin only. Storage object first, then the row. */
export async function deleteResource(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!profile) return { ok: false, error: 'Not signed in.' }

  const id = String(formData.get('id') ?? '')
  if (!id) return { ok: false, error: 'Missing resource id.' }

  const supabase = await createClient()
  const { data: resource, error: fetchError } = await supabase
    .from('resources')
    .select('id, kind, storage_path, created_by')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!resource) return { ok: false, error: 'Resource not found.' }

  // Courtesy check mirroring the RLS policy — RLS is still what actually
  // enforces this, but failing here gives a clearer message than a silent
  // zero-row delete would.
  const canManage =
    profile.is_admin || profile.role === 'owner' || resource.created_by === profile.id
  if (!canManage) {
    return { ok: false, error: 'Only the uploader or an admin can delete this resource.' }
  }

  if (resource.kind === 'file' && resource.storage_path) {
    const { error: storageError } = await supabase.storage
      .from('resources')
      .remove([resource.storage_path])
    if (storageError) {
      return { ok: false, error: `Could not delete the file: ${storageError.message}` }
    }
  }

  const { data: deleted, error: deleteError } = await supabase
    .from('resources')
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (deleteError) return { ok: false, error: deleteError.message }
  if (!deleted) return { ok: false, error: "Couldn't delete — it may already be gone." }

  revalidatePath('/resources')
  return { ok: true }
}
