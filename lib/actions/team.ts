'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin-client'
import { getCurrentProfile, type TeamRole, type SharedProfile } from '@/lib/supabase/cached-server'
import { slugify } from '@/lib/utils'
import type { ActionResult } from './profile'

const ROLES: TeamRole[] = ['owner', 'member']

/** Active owner. Backs the four owner-only controls (role, active, remove, lead). */
function isActiveOwner(profile: SharedProfile | null): profile is SharedProfile {
  return Boolean(profile?.is_active && profile.role === 'owner')
}

/** Active owner OR admin. Backs invite management and community assignment. */
function isActiveManager(profile: SharedProfile | null): profile is SharedProfile {
  return Boolean(profile?.is_active && (profile.role === 'owner' || profile.is_admin))
}

/** Empty-string form value → NULL (used for the optional community pickers). */
function nullableId(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? '').trim()
  return raw === '' ? null : raw
}

/**
 * Where an invite link lands. Kept in one place because the value has to match
 * an entry in Supabase Auth's redirect allow-list — if NEXT_PUBLIC_SITE_URL is
 * unset in production, every invite silently points at localhost.
 */
function inviteRedirectTo() {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  return `${site}/auth/callback?next=${encodeURIComponent('/auth/accept-invite')}`
}

/**
 * Invite flow. Two moves, order load-bearing:
 *  1. Insert the team_invites row AS THE SIGNED-IN MANAGER (RLS-checked).
 *  2. auth.admin.inviteUserByEmail — service role, creates the auth user in an
 *     invited state and sends the email. The signup-gate trigger on auth.users
 *     checks for the invite row, so the row MUST exist first.
 *
 * The manager check here is a courtesy for error messages; the RLS policy on
 * team_invites ("invites managers all") is what actually refuses anyone else.
 *
 * Deliberately no is_safeguarding_lead field: an invite should never be the
 * thing that grants global incident access — that's handed out after arrival,
 * eyes-open, via setSafeguardingLead (owner-only).
 */
export async function inviteMember(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveManager(profile)) {
    return { ok: false, error: 'Only an owner or admin can invite members.' }
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const role = String(formData.get('role') ?? 'member') as TeamRole
  const is_admin = formData.get('is_admin') === 'on' || formData.get('is_admin') === 'true'
  const community_id = nullableId(formData, 'community_id')

  if (!email.includes('@')) return { ok: false, error: 'Enter a valid email address.' }
  if (!ROLES.includes(role)) return { ok: false, error: 'Unknown role.' }

  const supabase = await createClient()
  const { error: insertError } = await supabase
    .from('team_invites')
    .insert({ email, role, is_admin, community_id, invited_by: profile.id })
  if (insertError) {
    if (insertError.code === '23505') {
      return {
        ok: false,
        error:
          'That address already has a live invite — use "Copy invite link" on it below to hand them a fresh link, or revoke it first to start over.',
      }
    }
    return { ok: false, error: insertError.message }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return {
      ok: false,
      error:
        'Invite recorded, but the email could not be sent: SUPABASE_SERVICE_ROLE_KEY is not configured on the server.',
    }
  }

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectTo(),
  })
  if (inviteError) {
    // Leave the row live: the gate is open for this address, and the invite can
    // still be delivered by hand via "Copy invite link". Surface the reason
    // instead of half-pretending success.
    revalidatePath('/team')
    return {
      ok: false,
      error: `Invite recorded, but the email failed: ${inviteError.message} — use "Copy invite link" below and send it to them yourself.`,
    }
  }

  revalidatePath('/team')
  return { ok: true }
}

export type InviteLinkResult = { ok: true; url: string } | { ok: false; error: string }

/**
 * Mint a one-time sign-in link for an invited or existing address, for an
 * owner/admin to send by hand — WhatsApp, Signal, read out over the phone,
 * whatever works.
 *
 * This exists because Supabase Auth's own email is the single point of failure
 * in the invite flow: if the project's SMTP is unconfigured, rate-limited, or
 * the mail simply lands in spam, the invited person is stuck and the portal has
 * no other door. `generateLink` returns the same link the email would have
 * carried, without depending on the mail ever being delivered.
 *
 * Two link types, because which one is valid depends on whether the auth user
 * already exists — and it does as soon as an invite email is successfully sent,
 * not when the person actually signs in:
 *  - no auth user yet  → 'invite'    (creates it; the signup-gate trigger
 *                                     passes because the team_invites row is live)
 *  - auth user exists  → 'magiclink' ('invite' rejects an existing address)
 *
 * Scoped, not general-purpose: the address must have a live invite or an
 * existing profile, so this cannot mint a login for an arbitrary email.
 *
 * NOTE: generating a link supersedes any earlier token for that address —
 * including one sitting in an email that has not been clicked yet. That is the
 * intended trade (the point is that the email did not arrive) but it means the
 * newest link is the only working one.
 */
export async function createInviteLink(formData: FormData): Promise<InviteLinkResult> {
  const profile = await getCurrentProfile()
  if (!isActiveManager(profile)) {
    return { ok: false, error: 'Only an owner or admin can create invite links.' }
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  if (!email.includes('@')) return { ok: false, error: 'Enter a valid email address.' }

  // Read through the user's own client so RLS confirms the caller may see this
  // address at all, rather than trusting whatever arrived from the browser.
  //
  // eq, not ilike: LIKE patterns treat `_` and `%` as wildcards, and `_` is
  // legal in an email local-part — so `ilike` would let a request for
  // axb@x.com satisfy itself against a live invite for a_b@x.com. Both sides
  // are already lowercase (inviteMember lowercases, auth.users stores folded).
  const supabase = await createClient()
  const [{ data: invite }, { data: member }] = await Promise.all([
    supabase
      .from('team_invites')
      .select('id')
      .eq('email', email)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    supabase.from('profiles').select('id').eq('email', email).maybeSingle(),
  ])
  if (!invite && !member) {
    return { ok: false, error: 'No live invite or member for that address.' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return {
      ok: false,
      error:
        'Cannot create a link: SUPABASE_SERVICE_ROLE_KEY is not configured on the server. Set it in Netlify and redeploy.',
    }
  }

  const options = { redirectTo: inviteRedirectTo() }
  const asInvite = await admin.auth.admin.generateLink({ type: 'invite', email, options })
  const link = asInvite.error
    ? await admin.auth.admin.generateLink({ type: 'magiclink', email, options })
    : asInvite

  const actionLink = link.data?.properties?.action_link
  if (link.error || !actionLink) {
    return { ok: false, error: link.error?.message ?? 'Supabase returned no link.' }
  }

  // Never hand out the raw GoTrue /verify URL. Supabase consumes the one-time
  // token on GET, and every chat app — WhatsApp, Slack, iMessage, Signal —
  // fetches a pasted URL to build a link preview. That crawler burns the token
  // seconds after you paste, so the recipient clicks a dead link. So we stash
  // the real link server-side and hand out a pointer to an interstitial: a
  // crawler GETting /join renders a button and consumes nothing; only a human
  // POSTing that form redeems the token.
  const { data: handoff, error: handoffError } = await admin
    .from('invite_link_handoffs')
    .insert({ email, action_link: actionLink, created_by: profile.id })
    .select('id')
    .single()
  if (handoffError || !handoff) {
    return { ok: false, error: handoffError?.message ?? 'Could not store the invite link.' }
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const url = `${site}/join/${handoff.id}`

  // Deliberately NOT revalidatePath('/team'). Generating an 'invite' link
  // creates the auth user, which fires handle_new_user and marks the invite
  // accepted — so a refresh here would drop the pending-invite row, and the
  // freshly-rendered URL with it, the moment the link appeared. That is the
  // one case this feature exists for: the clipboard write failed and reading
  // the link off the screen is the only way to get it. The lists go stale
  // until the next navigation; that is the cheaper wrong.
  return { ok: true, url }
}

export async function revokeInvite(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveManager(profile)) {
    return { ok: false, error: 'Only an owner or admin can revoke invites.' }
  }

  const id = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase
    .from('team_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('accepted_at', null)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

/**
 * Role + portal-admin flag together, matching admin_set_member_role's
 * signature — the RPC always wants both, so a role-only change resubmits the
 * member's current is_admin and vice versa.
 */
export async function setMemberRole(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveOwner(profile)) return { ok: false, error: 'Only an owner can change roles.' }

  const target = String(formData.get('id') ?? '')
  const role = String(formData.get('role') ?? '') as TeamRole
  if (!ROLES.includes(role)) return { ok: false, error: 'Unknown role.' }
  const is_admin = String(formData.get('is_admin')) === 'true'

  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_member_role', {
    target,
    new_role: role,
    new_is_admin: is_admin,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

export async function setMemberActive(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveOwner(profile)) {
    return { ok: false, error: 'Only an owner can activate or deactivate members.' }
  }

  const target = String(formData.get('id') ?? '')
  const active = String(formData.get('active')) === 'true'
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_member_active', { target, active })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

export async function removeMember(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveOwner(profile)) return { ok: false, error: 'Only an owner can remove members.' }

  const target = String(formData.get('id') ?? '')
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_remove_member', { target })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

/**
 * Community affiliation gates incident visibility, but re-tagging a member is
 * routine org admin (new member lands in the wrong community, someone moves
 * city) — owner OR admin, unlike role/active/remove.
 */
export async function setMemberCommunity(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveManager(profile)) {
    return { ok: false, error: "Only an owner or admin can set a member's community." }
  }

  const target = String(formData.get('id') ?? '')
  const community = nullableId(formData, 'community_id')
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_member_community', { target, community })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

/**
 * Owner-only. Unlike the other owner-only controls this one is NOT disabled
 * for self-targeting in the UI — admin_set_safeguarding_lead() itself doesn't
 * refuse it, because an owner already passes every incident policy anyway, so
 * toggling their own lead flag changes nothing they can reach.
 */
export async function setSafeguardingLead(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveOwner(profile)) {
    return { ok: false, error: 'Only an owner can change safeguarding-lead status.' }
  }

  const target = String(formData.get('id') ?? '')
  const value = String(formData.get('value')) === 'true'
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_safeguarding_lead', { target, value })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

// ── Communities ──────────────────────────────────────────────────────────
// Plain table writes, not RPCs — RLS ("communities admin insert"/"communities
// admin update", both owner OR admin) is the actual enforcement. These checks
// are the same courtesy the invite actions above give: a friendly error
// instead of a raw Postgres one.

export async function createCommunity(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveManager(profile)) {
    return { ok: false, error: 'Only an owner or admin can add communities.' }
  }

  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { ok: false, error: 'Name is required.' }
  if (name.length > 200) return { ok: false, error: 'Name is capped at 200 characters.' }
  const slug = slugify(name)
  if (!slug) return { ok: false, error: 'That name has no usable characters for a slug.' }

  const supabase = await createClient()
  const { error } = await supabase.from('communities').insert({ name, slug })
  if (error) {
    if (error.code === '23505') {
      return {
        ok: false,
        error: 'A community with that name (or slug) already exists.',
      }
    }
    return { ok: false, error: error.message }
  }
  revalidatePath('/team')
  return { ok: true }
}

export async function renameCommunity(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveManager(profile)) {
    return { ok: false, error: 'Only an owner or admin can rename communities.' }
  }

  const id = String(formData.get('id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { ok: false, error: 'Name is required.' }
  if (name.length > 200) return { ok: false, error: 'Name is capped at 200 characters.' }

  const supabase = await createClient()
  // Slug is left untouched on rename — it may already be referenced elsewhere,
  // and only the name is what the task asked to make editable.
  const { error } = await supabase.from('communities').update({ name }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}

export async function setCommunityActive(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentProfile()
  if (!isActiveManager(profile)) {
    return { ok: false, error: 'Only an owner or admin can deactivate or reactivate a community.' }
  }

  const id = String(formData.get('id') ?? '')
  const active = String(formData.get('active')) === 'true'
  const supabase = await createClient()
  const { error } = await supabase.from('communities').update({ is_active: active }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/team')
  return { ok: true }
}
