import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from './server'
import type { User } from '@supabase/supabase-js'

/**
 * Request-scoped Supabase helpers.
 *
 * NEVER call `supabase.auth.getUser()` directly in a server component or layout,
 * and NEVER re-`select` the current member's profile in more than one place.
 * Use these instead — `cache()` dedupes within a single request, so the layout,
 * the nav and the page share one auth round-trip and one `profiles` select.
 *
 * AcroPassport learned this the expensive way: pre-cache, its layout chain made
 * four trans-region auth round-trips per render. Start correct rather than
 * retrofit it.
 */

export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Touching cookies() marks this path dynamic. Without it, Next cannot see
  // through the React.cache() wrapper and may try to prerender auth-dependent
  // pages, which then hang against Supabase with no session cookie.
  try {
    await cookies()
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user
  } catch {
    // Request aborted (backgrounded tab, timeout). Render as signed-out; the
    // next navigation self-corrects.
    return null
  }
})

/**
 * The union of every profile field any layout-level consumer reads, so they all
 * share one select. Widen this list rather than adding a second query.
 */
export type SharedProfile = {
  id: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  role: TeamRole
  is_admin: boolean
  is_safeguarding_lead: boolean
  is_active: boolean
  community_id: string | null
}

/**
 * Mirrors the `role` CHECK constraint in migration 0002. Deliberately minimal:
 * portal powers compose via the `is_admin` and `is_safeguarding_lead` flags,
 * not via job-title roles. Widen this union and the CHECK constraint together,
 * in the same migration/session — never one without the other.
 */
export type TeamRole = 'owner' | 'member'

export const getCurrentProfile = cache(async (): Promise<SharedProfile | null> => {
  const user = await getCurrentUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select(
      'id, email, display_name, avatar_url, bio, role, is_admin, is_safeguarding_lead, is_active, community_id'
    )
    .eq('id', user.id)
    .maybeSingle<SharedProfile>()

  return data ?? null
})

/**
 * True only for an active member flagged `is_admin`.
 *
 * This is a convenience for rendering decisions — show or hide a nav item, pick
 * a redirect. It is NOT the security boundary: RLS in the database is. Never
 * let this be the only thing standing between a member and data they should not
 * see, because a missed call site is then a silent data leak rather than a
 * visual bug.
 */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  const profile = await getCurrentProfile()
  return Boolean(profile?.is_admin && profile.is_active)
})

/**
 * True for an active safeguarding lead (or an owner, who sees everything by
 * design — mirroring the `is_safeguarding_lead() OR is_portal_owner()` shape
 * every incident RLS policy uses). Rendering convenience only; RLS decides
 * what an incidents query actually returns.
 */
export const isCurrentUserLead = cache(async (): Promise<boolean> => {
  const profile = await getCurrentProfile()
  return Boolean(
    profile?.is_active && (profile.is_safeguarding_lead || profile.role === 'owner')
  )
})
