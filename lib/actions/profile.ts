'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/cached-server'

export type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Self-service profile edit. Runs as the signed-in member, so RLS and the
 * column grant (display_name, avatar_url, bio) decide what is writable —
 * role/is_admin are not in the grant and cannot be smuggled through here.
 */
export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const display_name = String(formData.get('display_name') ?? '').trim()
  const bio = String(formData.get('bio') ?? '').trim()
  if (!display_name) return { ok: false, error: 'Display name is required.' }
  if (bio.length > 500) return { ok: false, error: 'Bio is capped at 500 characters.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ display_name, bio: bio || null })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/', 'layout')
  return { ok: true }
}

/** New email — Supabase sends a confirmation link before anything changes. */
export async function updateEmail(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email.includes('@')) return { ok: false, error: 'Enter a valid email address.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ email })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const password = String(formData.get('password') ?? '')
  if (password.length < 10) {
    return { ok: false, error: 'Use at least 10 characters.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
