import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin-client'

/**
 * Redeems a hand-delivered invite link.
 *
 * POST only, and that is the security control rather than a style choice: the
 * whole point of the interstitial is that link-preview crawlers issue GETs and
 * never POST a form, so the one-time Supabase token is not spent until a human
 * presses the button.
 *
 * Marks the row redeemed BEFORE redirecting, so a double-submit cannot hand the
 * same token out twice.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const { origin } = new URL(request.url)

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.redirect(`${origin}/auth/error?reason=config`, { status: 303 })
  }

  const { data: handoff } = await admin
    .from('invite_link_handoffs')
    .select('id, action_link, expires_at, redeemed_at')
    .eq('id', token)
    .maybeSingle()

  if (!handoff || handoff.redeemed_at || new Date(handoff.expires_at) < new Date()) {
    return NextResponse.redirect(`${origin}/join/${token}`, { status: 303 })
  }

  // Claim it first: conditional on still being unredeemed, so two simultaneous
  // submits cannot both win.
  const { data: claimed } = await admin
    .from('invite_link_handoffs')
    .update({ redeemed_at: new Date().toISOString() })
    .eq('id', token)
    .is('redeemed_at', null)
    .select('id')
    .maybeSingle()

  if (!claimed) {
    return NextResponse.redirect(`${origin}/join/${token}`, { status: 303 })
  }

  // 303 so the browser follows with GET — this hop is the one that spends the
  // Supabase token, and it lands on /auth/callback via the link's redirect_to.
  return NextResponse.redirect(handoff.action_link, { status: 303 })
}
