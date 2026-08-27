'use client'

import { useRef, useTransition } from 'react'
import { toast } from 'sonner'
import { createAnnouncement } from '@/lib/actions/announcements'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/field'

/** New-announcement form. Only ever rendered for an admin/owner by the page —
 *  RLS on public.announcements is what actually stops anyone else posting. */
export function AnnouncementComposer() {
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className="space-y-3 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault()
        const formData = new FormData(e.currentTarget)
        startTransition(async () => {
          const result = await createAnnouncement(formData)
          if (result.ok) {
            toast.success('Announcement posted.')
            formRef.current?.reset()
          } else {
            toast.error(result.error)
          }
        })
      }}
    >
      <div>
        <Label htmlFor="announcement-title">Title</Label>
        <Input id="announcement-title" name="title" required maxLength={200} placeholder="What's the update?" />
      </div>
      <div>
        <Label htmlFor="announcement-body">Body</Label>
        <Textarea
          id="announcement-body"
          name="body_md"
          required
          rows={5}
          placeholder="Supports **bold**, *italic*, [links](https://…), and - list items."
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="pinned" className="size-4 rounded border-input" />
        Pin to the top of the feed
      </label>
      <Button type="submit" size="default" disabled={pending}>
        {pending ? 'Posting…' : 'Post announcement'}
      </Button>
    </form>
  )
}
