import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { formatLondon } from '@/lib/events/time'
import { Badge } from '@/components/ui/field'
import {
  InviteForm,
  InviteLinkButton,
  MemberRow,
  RevokeInviteButton,
} from '@/components/team/TeamControls'

export default async function TeamPage() {
  const profile = await getCurrentProfile()
  // Render gate only — RLS on profiles/team_invites and the owner RPCs are the
  // actual enforcement for anything this page can do.
  if (profile?.role !== 'owner') redirect('/')

  const supabase = await createClient()
  const [{ data: members }, { data: invites }, { data: accountState }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, display_name, role, is_admin, is_active, created_at')
      .order('created_at'),
    supabase
      .from('team_invites')
      .select('id, email, role, created_at, expires_at, accepted_at, revoked_at')
      .order('created_at', { ascending: false })
      .limit(20),
    // Owner-only RPC: auth.users is not readable from `authenticated`, and the
    // sign-in timestamp is the only reliable way to tell a working invite from
    // one whose email was never delivered.
    supabase.rpc('owner_team_account_state'),
  ])

  // Fail quiet, not loud: if the RPC errored we know nothing about sign-in
  // state, and an empty set would otherwise read as "nobody has ever signed
  // in" — labelling every member, including the owner reading the page, as a
  // dropped invite. Absent data means show no claim at all.
  const accountStateKnown = Array.isArray(accountState)
  const signedIn = new Set(
    (accountState ?? [])
      .filter((a: { last_sign_in_at: string | null }) => a.last_sign_in_at !== null)
      .map((a: { id: string }) => a.id)
  )
  const hasSignedIn = (id: string) => !accountStateKnown || signedIn.has(id)

  const liveInvites = (invites ?? []).filter((i) => !i.accepted_at && !i.revoked_at)
  const neverSignedIn = (members ?? []).filter((m) => !hasSignedIn(m.id))

  // The invite email and the manual link both run through the service-role
  // client. Without the key nothing in this section works, and the only prior
  // signal was a toast that vanished — which is precisely how three invites
  // went out to nobody on 2026-08-18.
  const emailConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  const siteUrlConfigured = Boolean(process.env.NEXT_PUBLIC_SITE_URL)

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-base font-semibold">Team</h1>
        <p className="text-muted-foreground">
          Registration is invite-only — the database refuses signups without a live invite, so
          this page is the only door in.
        </p>
      </header>

      {!emailConfigured && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="font-medium text-destructive">Invite emails cannot be sent.</p>
          <p className="mt-1 text-muted-foreground">
            <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> is not set on
            this deployment, so nothing here can reach Supabase Auth — invites are recorded
            but no email goes out and no link can be generated. Add it in Netlify → Site
            configuration → Environment variables, then redeploy.
          </p>
        </div>
      )}

      {emailConfigured && !siteUrlConfigured && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <p className="font-medium">Invite links will point at localhost.</p>
          <p className="mt-1 text-muted-foreground">
            <code className="font-mono text-xs">NEXT_PUBLIC_SITE_URL</code> is not set, so
            every invite redirects to <code className="font-mono text-xs">http://localhost:3000</code>{' '}
            after sign-in. Set it to the portal&apos;s public URL in Netlify and redeploy.
          </p>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Invite a member</h2>
        <InviteForm />
        <p className="text-xs text-muted-foreground">
          Supabase sends the invite email. If it doesn&apos;t arrive — spam filter, rate
          limit, unconfigured SMTP — use <strong>Copy invite link</strong> on the invite
          below and send it to them yourself.
        </p>
      </section>

      {liveInvites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Pending invites</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {liveInvites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="font-medium">{i.email}</span>
                <Badge>{i.role}</Badge>
                <span className="text-xs text-muted-foreground">
                  expires {formatLondon(i.expires_at, false)}
                </span>
                <span className="ml-auto flex flex-wrap items-center gap-2">
                  <InviteLinkButton email={i.email} />
                  <RevokeInviteButton id={i.id} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Members</h2>
        {neverSignedIn.length > 0 && (
          <p className="text-muted-foreground">
            {neverSignedIn.length === 1 ? '1 member has' : `${neverSignedIn.length} members have`}{' '}
            an account but have never signed in — usually a dropped invite email. Use{' '}
            <strong>Copy invite link</strong> on their row.
          </p>
        )}
        <ul className="divide-y rounded-lg border bg-card">
          {(members ?? []).map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              isSelf={m.id === profile.id}
              hasSignedIn={hasSignedIn(m.id)}
            />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Deactivate keeps the member&apos;s history and blocks access; Remove deletes the account
          outright. You cannot change your own role or remove yourself — the database refuses both.
        </p>
      </section>
    </div>
  )
}
