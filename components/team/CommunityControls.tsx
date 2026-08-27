'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { createCommunity, renameCommunity, setCommunityActive } from '@/lib/actions/team'
import type { ActionResult } from '@/lib/actions/profile'
import { Button } from '@/components/ui/button'
import { Input, Badge } from '@/components/ui/field'

/*
 * Communities section of the Team page. Plain table writes through the
 * server client — RLS ("communities admin insert"/"communities admin
 * update", both owner OR admin) is the real enforcement, same as every other
 * control on this page.
 */

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

export function AddCommunityForm() {
  const { pending, run } = useAction()

  return (
    <form
      className="flex max-w-md flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const form = e.currentTarget
        run(createCommunity, new FormData(form), 'Community added.', () => form.reset())
      }}
    >
      <div className="min-w-56 flex-1">
        <label htmlFor="community-name" className="mb-1.5 block font-medium">
          Community name
        </label>
        <Input id="community-name" name="name" required placeholder="e.g. North London Acro" />
      </div>
      <Button type="submit" size="default" disabled={pending}>
        {pending ? 'Adding…' : 'Add community'}
      </Button>
    </form>
  )
}

export type CommunityRow = {
  id: string
  name: string
  slug: string
  is_active: boolean
}

export function CommunityListItem({
  community,
  memberCount,
}: {
  community: CommunityRow
  memberCount: number
}) {
  const { pending, run } = useAction()

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <form
        className="flex min-w-56 flex-1 items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          run(renameCommunity, new FormData(e.currentTarget), 'Community renamed.')
        }}
      >
        <input type="hidden" name="id" value={community.id} />
        <Input
          name="name"
          defaultValue={community.name}
          aria-label={`Name for ${community.name}`}
          disabled={pending}
          className="h-8 text-xs"
        />
        <Button type="submit" size="xs" variant="outline" disabled={pending}>
          Rename
        </Button>
      </form>

      <span className="font-mono text-xs text-muted-foreground">/{community.slug}</span>
      <Badge tone="neutral">
        {memberCount} {memberCount === 1 ? 'member' : 'members'}
      </Badge>
      {!community.is_active && <Badge tone="red">inactive</Badge>}

      <Button
        size="xs"
        variant="outline"
        className="ml-auto"
        disabled={pending}
        onClick={() => {
          const fd = new FormData()
          fd.set('id', community.id)
          fd.set('active', String(!community.is_active))
          run(
            setCommunityActive,
            fd,
            community.is_active ? 'Community deactivated.' : 'Community reactivated.'
          )
        }}
      >
        {community.is_active ? 'Deactivate' : 'Reactivate'}
      </Button>
    </li>
  )
}
