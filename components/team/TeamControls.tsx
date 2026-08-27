'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  createInviteLink,
  inviteMember,
  revokeInvite,
  setMemberRole,
  setMemberActive,
  removeMember,
} from '@/lib/actions/team'
import type { ActionResult } from '@/lib/actions/profile'
import { Button } from '@/components/ui/button'
import { Input, Select, Badge } from '@/components/ui/field'

const ROLES = ['owner', 'admin', 'coach', 'volunteer'] as const

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

export function InviteForm() {
  const { pending, run } = useAction()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className="flex max-w-xl flex-wrap items-end gap-3"
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
        <Select id="invite-role" name="role" defaultValue="volunteer">
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </div>
      <Button type="submit" size="default" disabled={pending}>
        {pending ? 'Sending…' : 'Send invite'}
      </Button>
    </form>
  )
}

/**
 * Manual delivery path for an invite. Generates the same one-time link the
 * email would have carried and puts it on the clipboard, so a member who never
 * received the mail can still be let in.
 *
 * The URL is also rendered in a readonly input: clipboard access is refused
 * outright in some browsers and over plain HTTP, and a link the owner can see
 * and select by hand is the difference between a workaround and a dead end.
 */
export function InviteLinkButton({ email, label = 'Copy invite link' }: { email: string; label?: string }) {
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

type Member = {
  id: string
  email: string | null
  display_name: string | null
  role: string
  is_admin: boolean
  is_active: boolean
}

export function MemberRow({
  member,
  isSelf,
  hasSignedIn = true,
}: {
  member: Member
  isSelf: boolean
  hasSignedIn?: boolean
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
      {!member.is_active && <Badge tone="red">deactivated</Badge>}
      {/* An account that exists but has never been signed into is the exact
          shape of a dropped invite email — surface it, and offer the link. */}
      {hasSignedIn === false && <Badge tone="amber">never signed in</Badge>}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {/* Offered for every member, not just never-signed-in ones. Gating on
            sign-in state was wrong: a consumed link sets last_sign_in_at even
            when the person never got in (a preview crawler redeeming it does
            exactly that), which hid the re-send button from precisely the
            people who needed it. An owner can already re-role, deactivate and
            delete any account, so issuing a sign-in link is no new authority. */}
        {!isSelf && member.email && (
          <InviteLinkButton
            email={member.email}
            label={hasSignedIn ? 'Copy sign-in link' : 'Copy invite link'}
          />
        )}
        <Select
          aria-label={`Role for ${member.display_name ?? member.email}`}
          className="h-8 w-auto text-xs"
          value={member.role}
          disabled={isSelf || pending}
          onChange={(e) =>
            run(setMemberRole, withId({ role: e.target.value }), 'Role updated.')
          }
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
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
      </div>
    </li>
  )
}
