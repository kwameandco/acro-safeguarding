'use client'

import { useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import {
  createFileResource,
  createLinkResource,
  deleteResource,
  updateResource,
} from '@/lib/actions/resources'
import type { ActionResult } from '@/lib/actions/profile'
import {
  RESOURCE_MAX_FILE_BYTES,
  type CommunityOption,
  type ResourceListItem,
} from '@/lib/resources/types'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Select, Label, FieldHint } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

/*
 * Client-side pieces of the resource library: the add form (Link/File tabs)
 * and the per-row edit/delete controls. Bundled in one file, same shape as
 * TeamControls.tsx — related client islands for one module, one place.
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

/** Title/description/tags/community — the fields every form here shares. */
function ResourceFormFields({
  idPrefix,
  communities,
  communitiesError,
  defaults,
  disabled,
}: {
  idPrefix: string
  communities: CommunityOption[]
  communitiesError?: boolean
  defaults?: { title?: string; description?: string; tags?: string; community_id?: string | null }
  disabled?: boolean
}) {
  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          name="title"
          required
          maxLength={200}
          defaultValue={defaults?.title}
          disabled={disabled}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-description`}>Description</Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          maxLength={1000}
          defaultValue={defaults?.description}
          disabled={disabled}
        />
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-tags`}>Tags</Label>
        <Input
          id={`${idPrefix}-tags`}
          name="tags"
          placeholder="policy, template"
          defaultValue={defaults?.tags}
          disabled={disabled}
        />
        <FieldHint>Comma-separated — lowercased and de-duplicated automatically.</FieldHint>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-community`}>Community</Label>
        <Select
          id={`${idPrefix}-community`}
          name="community_id"
          defaultValue={defaults?.community_id ?? ''}
          disabled={disabled || communitiesError}
        >
          <option value="">No community</option>
          {communities.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        {communitiesError && (
          <FieldHint>Couldn&apos;t load communities right now — leave this unset.</FieldHint>
        )}
      </div>
    </>
  )
}

function AddLinkForm({
  communities,
  communitiesError,
}: {
  communities: CommunityOption[]
  communitiesError?: boolean
}) {
  const { pending, run } = useAction()
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        run(createLinkResource, new FormData(e.currentTarget), 'Link added.', () =>
          formRef.current?.reset()
        )
      }}
    >
      <ResourceFormFields idPrefix="link" communities={communities} communitiesError={communitiesError} disabled={pending} />
      <div>
        <Label htmlFor="link-url">URL</Label>
        <Input id="link-url" name="url" type="url" required placeholder="https://…" disabled={pending} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? 'Adding…' : 'Add link'}
      </Button>
    </form>
  )
}

/** Keep storage keys predictable: strip any path and anything outside a safe charset. */
function sanitiseFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || 'file'
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-')
  return cleaned.slice(-150) || 'file'
}

function AddFileForm({
  communities,
  communitiesError,
  currentUserId,
}: {
  communities: CommunityOption[]
  communitiesError?: boolean
  currentUserId: string
}) {
  const [pending, setPending] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFileError(null)

    if (!currentUserId) {
      setFileError('You must be signed in to upload a file.')
      return
    }

    const form = e.currentTarget
    const fileField = form.elements.namedItem('file')
    const file = fileField instanceof HTMLInputElement ? fileField.files?.[0] : undefined
    if (!file) {
      setFileError('Choose a file to upload.')
      return
    }
    if (file.size > RESOURCE_MAX_FILE_BYTES) {
      setFileError('That file is too large — the limit is 25 MB.')
      return
    }

    const formData = new FormData(form)
    const supabase = createClient()
    const path = `${currentUserId}/${crypto.randomUUID()}-${sanitiseFileName(file.name)}`

    setPending(true)
    try {
      const { error: uploadError } = await supabase.storage.from('resources').upload(path, file)
      if (uploadError) {
        setFileError(uploadError.message)
        return
      }

      formData.set('storage_path', path)
      formData.set('file_name', file.name)
      formData.set('mime_type', file.type || 'application/octet-stream')
      formData.set('size_bytes', String(file.size))

      const result = await createFileResource(formData)
      if (!result.ok) {
        setFileError(result.error)
        // Best-effort: don't leave an orphaned object behind for a row that
        // never got created.
        await supabase.storage.from('resources').remove([path])
        return
      }

      toast.success('File added.')
      form.reset()
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div>
        <Label htmlFor="file-input">File</Label>
        <Input
          id="file-input"
          name="file"
          type="file"
          required
          disabled={pending}
          className="file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-secondary-foreground"
        />
        <FieldHint>Up to 25 MB.</FieldHint>
      </div>
      <ResourceFormFields idPrefix="file" communities={communities} communitiesError={communitiesError} disabled={pending} />
      {fileError && <p className="text-destructive">{fileError}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Uploading…' : 'Add file'}
      </Button>
    </form>
  )
}

export function AddResourceForm({
  communities,
  communitiesError,
  currentUserId,
}: {
  communities: CommunityOption[]
  communitiesError?: boolean
  currentUserId: string
}) {
  const [tab, setTab] = useState<'link' | 'file'>('link')

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v === 'file' ? 'file' : 'link')}>
        <TabsList>
          <TabsTrigger value="link">Link</TabsTrigger>
          <TabsTrigger value="file">File</TabsTrigger>
        </TabsList>
        <TabsContent value="link">
          <AddLinkForm communities={communities} communitiesError={communitiesError} />
        </TabsContent>
        <TabsContent value="file">
          <AddFileForm
            communities={communities}
            communitiesError={communitiesError}
            currentUserId={currentUserId}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EditResourceForm({
  resource,
  communities,
  communitiesError,
  onDone,
}: {
  resource: ResourceListItem
  communities: CommunityOption[]
  communitiesError?: boolean
  onDone: () => void
}) {
  const { pending, run } = useAction()

  return (
    <form
      className="w-full min-w-56 space-y-3 rounded-md border bg-background p-3 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        fd.set('id', resource.id)
        run(updateResource, fd, 'Resource updated.', onDone)
      }}
    >
      <ResourceFormFields
        idPrefix={`edit-${resource.id}`}
        communities={communities}
        communitiesError={communitiesError}
        defaults={{
          title: resource.title,
          description: resource.description ?? '',
          tags: resource.tags.join(', '),
          community_id: resource.community_id ?? '',
        }}
        disabled={pending}
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? 'Saving…' : 'Save'}
      </Button>
    </form>
  )
}

/** Edit toggle + delete, shown only when the viewer is the uploader or an admin. */
export function ResourceActions({
  resource,
  canManage,
  communities,
  communitiesError,
}: {
  resource: ResourceListItem
  canManage: boolean
  communities: CommunityOption[]
  communitiesError?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const { pending, run } = useAction()

  if (!canManage) return null

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="outline" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Cancel' : 'Edit'}
        </Button>
        <Button
          size="xs"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete "${resource.title}"? This can't be undone.`)) {
              const fd = new FormData()
              fd.set('id', resource.id)
              run(deleteResource, fd, 'Resource deleted.')
            }
          }}
        >
          Delete
        </Button>
      </div>
      {editing && (
        <EditResourceForm
          resource={resource}
          communities={communities}
          communitiesError={communitiesError}
          onDone={() => setEditing(false)}
        />
      )}
    </div>
  )
}
