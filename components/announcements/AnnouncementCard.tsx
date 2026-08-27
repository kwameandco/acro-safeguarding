'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  deleteAnnouncement,
  setAnnouncementPinned,
  updateAnnouncement,
} from '@/lib/actions/announcements'
import { formatLondon } from '@/lib/shared/time'
import { renderMarkdownLite } from '@/lib/announcements/markdown'
import { Button } from '@/components/ui/button'
import { Badge, Input, Label, Textarea } from '@/components/ui/field'
import type { Announcement } from '@/lib/announcements/types'

/**
 * One announcement: display mode (title, pinned badge, author/date, rendered
 * body) or — for an admin/owner — an inline edit form in place of the same
 * card. Pin/unpin and delete are one click from display mode; RLS on
 * public.announcements is the real authority, `isAdmin` only decides what
 * this card renders.
 */
export function AnnouncementCard({
  announcement,
  authorName,
  isAdmin,
}: {
  announcement: Announcement
  authorName: string | null
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [pending, startTransition] = useTransition()

  const togglePin = () => {
    const fd = new FormData()
    fd.set('id', announcement.id)
    fd.set('pinned', String(!announcement.pinned))
    startTransition(async () => {
      const result = await setAnnouncementPinned(fd)
      if (result.ok) toast.success(announcement.pinned ? 'Unpinned.' : 'Pinned to top.')
      else toast.error(result.error)
    })
  }

  const remove = () => {
    if (!window.confirm(`Delete "${announcement.title}"? This can't be undone.`)) return
    const fd = new FormData()
    fd.set('id', announcement.id)
    startTransition(async () => {
      const result = await deleteAnnouncement(fd)
      if (!result.ok) toast.error(result.error)
      // No success toast: the row disappears from the revalidated feed, which
      // is confirmation enough, and avoids a toast outliving the card it named.
    })
  }

  if (editing) {
    return (
      <form
        className="space-y-3 rounded-lg border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault()
          const formData = new FormData(e.currentTarget)
          formData.set('id', announcement.id)
          startTransition(async () => {
            const result = await updateAnnouncement(formData)
            if (result.ok) {
              toast.success('Announcement updated.')
              setEditing(false)
            } else {
              toast.error(result.error)
            }
          })
        }}
      >
        <div>
          <Label htmlFor={`edit-title-${announcement.id}`}>Title</Label>
          <Input
            id={`edit-title-${announcement.id}`}
            name="title"
            defaultValue={announcement.title}
            required
            maxLength={200}
          />
        </div>
        <div>
          <Label htmlFor={`edit-body-${announcement.id}`}>Body</Label>
          <Textarea
            id={`edit-body-${announcement.id}`}
            name="body_md"
            defaultValue={announcement.body_md}
            required
            rows={5}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="default" disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="default"
            disabled={pending}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </form>
    )
  }

  return (
    <article className="space-y-2 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{announcement.title}</h3>
            {announcement.pinned && <Badge tone="amber">Pinned</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            {authorName ?? 'Team member'} · {formatLondon(announcement.published_at, false)}
          </p>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={pending} onClick={togglePin}>
              {announcement.pinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button size="xs" variant="outline" disabled={pending} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="xs" variant="destructive" disabled={pending} onClick={remove}>
              Delete
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-2 text-sm">{renderMarkdownLite(announcement.body_md)}</div>
    </article>
  )
}
