'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  createInviteLink,
  inviteMember,
  removeMember,
  revokeInvite,
  setMemberActive,
  setMemberCommunity,
  setMemberRole,
  setSafeguardingLead,
} from '@/lib/actions/team'
import type { ActionResult } from '@/lib/actions/profile'
import type { TeamRole } from '@/lib/supabase/cached-server'
import { Button } from '@/components/ui/button'
import { Input, Select, Badge } from '@/components/ui/field'

const ROLES: TeamRole[] = ['owner', 'member']

/** `ROLES` is the source of truth for this map — widen both together. */
const ROLE_LABEL: Record<TeamRole, string> = {
  owner: 'Owner',
  member: 'Member',
}

export type CommunityOption = { id: string; name: string; is_active: boolean }

function useAction() {
  const [pending, startTransition] = useTransition()
  const run = (
    action: (fd: FormData) => Promise<ActionResult>,
    fd: FormData,
    done: string,
    after?: () => void
  ) =>
    startTransition(async () => {
      const result = await action(fd)
      if (result.ok) {
        toast.success(done)
        after?.()
      } else toast.error(result.error)
    })
  return { pending, run }
}

/**
 * Shared options list for every community picker. Active communities are
 * always selectable. A currently-assigned-but-now-inactive community is
 * still rendered (disabled, marked "(inactive)") so the control keeps
 * showing the true current value instead of silently looking unset.
 */
function CommunityOptions({
  communities,
  currentId,
}: {
  communities: CommunityOption[]
  currentId?: string | null
}) {
  return (
    <>
      <option value="">No community</option>
      {communities
        .filter((c) => c.is_active || c.id === currentId)
        .map((c) => (
          <option key={c.id} value={c.id} disabled={!c.is_active}>
            {c.name}
            {c.is_active ? '' : ' (inactive)'}
          </option>
        ))}
    </>
  )
}

export function InviteForm({ communities }: { communities: CommunityOption[] }) {
  const { pending, run } = useAction()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className="flex max-w-2xl flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(inviteMember, new FormData(e.currentTarget), 'Invite sent.', () =>
          formRef.current?.reset()
        )
      }}
    >
      <div className="min-w-56 flex-1">
        <label htmlFor="invite-email" className="mb-1.5 block font-medium">
          Email
        </label>
        <Input id="invite-email" name="email" type="email" required placeholder="them@example.com" />
      </div>
      <div>
        <label htmlFor="invite-role" className="mb-1.5 block font-medium">
          Role
        </label>
        <Select id="invite-role" name="role" defaultValue="member">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r] ?? r}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor="invite-community" className="mb-1.5 block font-medium">
          Community
        </label>
        <Select id="invite-community" name="community_id" defaultValue="">
          <CommunityOptions communities={communities} />
        </Select>
      </div>
      <label htmlFor="invite-is-admin" className="flex items-center gap-2 pb-2.5 font-medium">
        <input
          id="invite-is-admin"
          type="checkbox"
          name="is_admin"
          className="size-4 rounded border-input"
        />
        Admin
      </label>
      <Button type="submit" size="default" disabled={pending}>
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  )
}

/**
 * Manual delivery path for an invite (or a sign-in link for an existing
 * member). Generates the same one-time link the email would have carried and
 * puts it on the clipboard, so someone who never received the mail can still
 * get in.
 *
 * The URL is also rendered in a readonly input: clipboard access is refused
 * outright in some browsers and over plain HTTP, and a link the caller can see
 * and select by hand is the difference between a workaround and a dead end.
 */
export function InviteLinkButton({
  email,
  label = 'Copy invite link',
}: {
  email: string
  label?: string
}) {
  const [pending, startTransition] = useTransition()
  const [url, setUrl] = useState<string | null>(null)

  const generate = () =>
    startTransition(async () => {
      const fd = new FormData()
      fd.set('email', email)
      const result = await createInviteLink(fd)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setUrl(result.url)
      try {
        await navigator.clipboard.writeText(result.url)
        toast.success('Invite link copied — paste it to them directly.')
      } catch {
        toast.success('Invite link ready — copy it from the box below.')
      }
    })

  return (
    <>
      <Button size="xs" variant="outline" disabled={pending} onClick={generate}>
        {pending ? 'Creating…' : url ? 'New link' : label}
      </Button>
      {url && (
        <div className="basis-full space-y-1.5 pt-1">
          <Input
            readOnly
            aria-label={`Invite link for ${email}`}
            value={url}
            className="font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="text-xs text-muted-foreground">
            Safe to paste into a chat app — it opens a page with an Accept button rather
            than signing anyone in on sight. Works once, expires in 7 days, and creating a
            new one replaces any link sent earlier to this address.
          </p>
        </div>
      )}
    </>
  )
}

export function RevokeInviteButton({ id }: { id: string }) {
  const { pending, run } = useAction()
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={pending}
      onClick={() => {
        const fd = new FormData()
        fd.set('id', id)
        run(revokeInvite, fd, 'Invite revoked.')
      }}
    >
      Revoke
    </Button>
  )
}

export type Member = {
  id: string
  email: string | null
  display_name: string | null
  role: TeamRole
  is_admin: boolean
  is_safeguarding_lead: boolean
  is_active: boolean
  community_id: string | null
}

export function MemberRow({
  member,
  isSelf,
  viewerIsOwner,
  communities,
}: {
  member: Member
  isSelf: boolean
  /**
   * Whoever is looking at this page is already an owner or admin (that's the
   * page-level gate) — this only distinguishes the owner-only controls
   * (role, admin flag, lead flag, active state, remove) from the ones an
   * admin may also use (community, sign-in link). The database re-checks
   * every one of these regardless of what's rendered here.
   */
  viewerIsOwner: boolean
  communities: CommunityOption[]
}) {
  const { pending, run } = useAction()

  const withId = (extra: Record<string, string>) => {
    const fd = new FormData()
    fd.set('id', member.id)
    Object.entries(extra).forEach(([k, v]) => fd.set(k, v))
    return fd
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {member.display_name ?? member.email}
          {isSelf && <span className="text-muted-foreground"> (you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>

      <Badge tone={member.role === 'owner' ? 'blue' : 'neutral'}>
        {ROLE_LABEL[member.role] ?? member.role}
      </Badge>
      {member.is_admin && <Badge tone="green">Admin</Badge>}
      {member.is_safeguarding_lead && <Badge tone="amber">Lead</Badge>}
      <Badge tone="neutral">
        {communities.find((c) => c.id === member.community_id)?.name ?? 'No community'}
      </Badge>
      {!member.is_active && <Badge tone="red">deactivated</Badge>}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {!isSelf && member.email && (
          <InviteLinkButton email={member.email} label="Copy sign-in link" />
        )}

        {/* Community assignment: owner OR admin — anyone who can reach this page. */}
        <Select
          aria-label={`Community for ${member.display_name ?? member.email}`}
          className="h-8 w-auto text-xs"
          value={member.community_id ?? ''}
          disabled={pending}
          onChange={(e) =>
            run(
              setMemberCommunity,
              withId({ community_id: e.target.value }),
              'Community updated.'
            )
          }
        >
          <CommunityOptions communities={communities} currentId={member.community_id} />
        </Select>

        {viewerIsOwner && (
          <>
            <Select
              aria-label={`Role for ${member.display_name ?? member.email}`}
              className="h-8 w-auto text-xs"
              value={member.role}
              disabled={isSelf || pending}
              onChange={(e) =>
                run(
                  setMemberRole,
                  withId({ role: e.target.value, is_admin: String(member.is_admin) }),
                  'Role updated.'
                )
              }
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </Select>
            <Button
              size="xs"
              variant={member.is_admin ? 'default' : 'outline'}
              aria-pressed={member.is_admin}
              disabled={isSelf || pending}
              onClick={() =>
                run(
                  setMemberRole,
                  withId({ role: member.role, is_admin: String(!member.is_admin) }),
                  member.is_admin ? 'Admin access removed.' : 'Admin access granted.'
                )
              }
            >
              Admin
            </Button>
            <Button
              size="xs"
              variant={member.is_safeguarding_lead ? 'default' : 'outline'}
              aria-pressed={member.is_safeguarding_lead}
              disabled={pending}
              onClick={() =>
                run(
                  setSafeguardingLead,
                  withId({ value: String(!member.is_safeguarding_lead) }),
                  member.is_safeguarding_lead
                    ? 'Safeguarding-lead access removed.'
                    : 'Safeguarding-lead access granted.'
                )
              }
            >
              Lead
            </Button>
            {!isSelf && (
              <>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(
                      setMemberActive,
                      withId({ active: String(!member.is_active) }),
                      member.is_active ? 'Member deactivated.' : 'Member reactivated.'
                    )
                  }
                >
                  {member.is_active ? 'Deactivate' : 'Reactivate'}
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${member.display_name ?? member.email} entirely? This deletes their account. Deactivating is usually the better choice.`
                      )
                    ) {
                      run(removeMember, withId({}), 'Member removed.')
                    }
                  }}
                >
                  Remove
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </li>
  )
}
