import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { formatLondon } from '@/lib/shared/time'
import { Badge } from '@/components/ui/field'
import { InviteForm, InviteLinkButton, MemberRow, RevokeInviteButton } from '@/components/team/TeamControls'
import { AddCommunityForm, CommunityListItem } from '@/components/team/CommunityControls'

export default async function TeamPage() {
  const profile = await getCurrentProfile()
  // Render gate only — RLS on profiles/team_invites/communities and the owner
  // RPCs are the actual enforcement for anything this page can do. Mirrors the
  // nav's own visibility check in PortalNav.
  const viewerIsOwner = profile?.role === 'owner'
  const viewerIsManager = viewerIsOwner || Boolean(profile?.is_admin)
  if (!viewerIsManager) redirect('/')

  const supabase = await createClient()
  const [
    { data: members, error: membersError },
    { data: invites, error: invitesError },
    { data: communities, error: communitiesError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, display_name, role, is_admin, is_safeguarding_lead, is_active, community_id, created_at'
      )
      .order('created_at'),
    supabase
      .from('team_invites')
      .select('id, email, role, is_admin, community_id, created_at, expires_at, accepted_at, revoked_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('communities').select('id, name, slug, is_active').order('name'),
  ])

  const communityList = communities ?? []
  const communityName = (id: string | null) =>
    (id && communityList.find((c) => c.id === id)?.name) || 'No community'

  // "Cheap" per the spec: derived from the member list already fetched above,
  // not a second round-trip per community.
  const memberCountByCommunity = new Map<string, number>()
  for (const m of members ?? []) {
    if (m.community_id) {
      memberCountByCommunity.set(m.community_id, (memberCountByCommunity.get(m.community_id) ?? 0) + 1)
    }
  }

  const liveInvites = (invites ?? []).filter((i) => !i.accepted_at && !i.revoked_at)

  // The invite email and the manual link both run through the service-role
  // client. Without the key nothing in this section works, and the only prior
  // signal would otherwise be a toast that vanished.
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
        <InviteForm communities={communityList} />
        <p className="text-xs text-muted-foreground">
          Supabase sends the invite email. If it doesn&apos;t arrive — spam filter, rate
          limit, unconfigured SMTP — use <strong>Copy invite link</strong> on the invite
          below and send it to them yourself.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Pending invites</h2>
        {invitesError ? (
          <p className="text-muted-foreground">Couldn&apos;t load pending invites.</p>
        ) : liveInvites.length === 0 ? (
          <p className="text-muted-foreground">No pending invites right now.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {liveInvites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="font-medium">{i.email}</span>
                <Badge tone={i.role === 'owner' ? 'blue' : 'neutral'}>{i.role}</Badge>
                {i.is_admin && <Badge tone="green">Admin</Badge>}
                <Badge tone="neutral">{communityName(i.community_id)}</Badge>
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
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Members</h2>
        {membersError ? (
          <p className="text-muted-foreground">Couldn&apos;t load the member list.</p>
        ) : (members ?? []).length === 0 ? (
          <p className="text-muted-foreground">No members yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {(members ?? []).map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isSelf={m.id === profile?.id}
                viewerIsOwner={viewerIsOwner}
                communities={communityList}
              />
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {viewerIsOwner
            ? 'Deactivate keeps the member’s history and blocks access; Remove deletes the account outright. You cannot change your own role, deactivate, or remove yourself — the database refuses all three.'
            : 'Role, admin access, safeguarding-lead access, deactivation and removal are owner-only — an owner can make those changes.'}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Communities</h2>
        <p className="text-muted-foreground">
          Tasks, the calendar and resources tag a community for filtering only — every member
          sees everything there. Incidents are the exception: a member&apos;s community decides
          which incident reports they can read.
        </p>
        <AddCommunityForm />
        {communitiesError ? (
          <p className="text-muted-foreground">Couldn&apos;t load communities.</p>
        ) : communityList.length === 0 ? (
          <p className="text-muted-foreground">No communities yet — add the first one above.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {communityList.map((c) => (
              <CommunityListItem
                key={c.id}
                community={c}
                memberCount={memberCountByCommunity.get(c.id) ?? 0}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
