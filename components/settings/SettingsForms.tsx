'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { updateProfile, updateEmail, updatePassword } from '@/lib/actions/profile'
import type { ActionResult } from '@/lib/actions/profile'
import { Button } from '@/components/ui/button'
import { Input, Textarea, Label, FieldHint } from '@/components/ui/field'

export function SettingsForms({
  displayName,
  bio,
  email,
}: {
  displayName: string
  bio: string
  email: string
}) {
  const [pending, startTransition] = useTransition()

  const submit =
    (action: (fd: FormData) => Promise<ActionResult>, done: string) =>
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const form = e.currentTarget
      startTransition(async () => {
        const result = await action(new FormData(form))
        if (result.ok) toast.success(done)
        else toast.error(result.error)
      })
    }

  return (
    <div className="max-w-xl space-y-10">
      <form onSubmit={submit(updateProfile, 'Profile updated.')} className="space-y-4">
        <h2 className="text-base font-semibold">Profile</h2>
        <div>
          <Label htmlFor="display_name">Display name</Label>
          <Input id="display_name" name="display_name" required defaultValue={displayName} />
        </div>
        <div>
          <Label htmlFor="bio">Mini bio</Label>
          <Textarea id="bio" name="bio" maxLength={500} defaultValue={bio} />
          <FieldHint>Up to 500 characters. Shown to the rest of the team.</FieldHint>
        </div>
        <Button type="submit" size="default" disabled={pending}>
          Save profile
        </Button>
      </form>

      <form onSubmit={submit(updateEmail, 'Check your new inbox to confirm the change.')} className="space-y-4">
        <h2 className="text-base font-semibold">Email</h2>
        <div>
          <Label htmlFor="email">Email address</Label>
          <Input id="email" name="email" type="email" required defaultValue={email} />
          <FieldHint>Changing it sends a confirmation link; nothing moves until you click it.</FieldHint>
        </div>
        <Button type="submit" size="default" disabled={pending}>
          Change email
        </Button>
      </form>

      <form onSubmit={submit(updatePassword, 'Password updated.')} className="space-y-4">
        <h2 className="text-base font-semibold">Password</h2>
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
          />
          <FieldHint>At least 10 characters. You can also sign in by magic link and never use it.</FieldHint>
        </div>
        <Button type="submit" size="default" disabled={pending}>
          Set password
        </Button>
      </form>
    </div>
  )
}
