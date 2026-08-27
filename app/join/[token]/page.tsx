import { createAdminClient } from '@/lib/supabase/admin-client'
import { Button } from '@/components/ui/button'

/**
 * Invite landing for a hand-delivered link.
 *
 * This page exists for one reason: the raw Supabase link cannot survive being
 * pasted into a chat app. GoTrue consumes the one-time token on GET, and every
 * messenger fetches a pasted URL to build a preview — so the preview bot
 * redeems the invite and the human gets a dead link. (Not hypothetical: three
 * invites died this way on 2026-08-18, each consumed 4–6s after being pasted.)
 *
 * A GET here is inert. It reads the row, renders a button, and redeems
 * nothing. Only the POST to ./redeem exchanges the token — and link-preview
 * crawlers do not POST forms.
 *
 * Deliberately a plain <form>, not an onClick handler: it works before hydration
 * and with JS disabled, which matters for a link someone opens from a message
 * on an unfamiliar phone.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  let state: 'ready' | 'used' | 'expired' | 'unknown' = 'unknown'
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('invite_link_handoffs')
      .select('id, expires_at, redeemed_at')
      .eq('id', token)
      .maybeSingle()

    if (data) {
      if (data.redeemed_at) state = 'used'
      else if (new Date(data.expires_at) < new Date()) state = 'expired'
      else state = 'ready'
    }
  } catch {
    // Missing service-role key. Nothing useful to say to the recipient beyond
    // "ask again" — the detail belongs in the owner's dashboard, not here.
    state = 'unknown'
  }

  const message = {
    used: 'This invite link has already been used. If that wasn’t you, ask for a fresh one.',
    expired: 'This invite link has expired. Ask for a fresh one.',
    unknown: 'This invite link isn’t valid. Ask for a fresh one.',
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        <div className="space-y-1">
          <h1 className="text-base font-semibold">Join the Acro Safeguarding Hub</h1>
          <p className="text-muted-foreground">
            {state === 'ready'
              ? 'You’ve been invited to the cross-community safeguarding team’s portal. Continue to finish setting up your account.'
              : message[state]}
          </p>
        </div>
        {state === 'ready' && (
          <form action={`/join/${token}/redeem`} method="post">
            <Button type="submit" size="default" className="w-full">
              Accept invite
            </Button>
          </form>
        )}
        {state === 'ready' && (
          <p className="text-xs text-muted-foreground">
            This link works once. Opening it signs you in and asks you to choose a password.
          </p>
        )}
      </div>
    </main>
  )
}
