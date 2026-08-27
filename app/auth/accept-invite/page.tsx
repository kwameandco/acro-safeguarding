'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label, FieldHint } from '@/components/ui/field'

/**
 * Landing page for the invite email. By the time anyone reaches this, the
 * callback has already exchanged the invite link for a session — so this page
 * is authenticated and just finishes the account: display name + password.
 * The profiles row (with the invited role) was created by trigger at invite
 * time; this only fills in the human bits.
 */
export default function AcceptInvitePage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    try {
      const supabase = createClient()
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData.user) {
        toast.error('This invite link has expired. Ask for a fresh one.')
        return
      }
      const { error: pwError } = await supabase.auth.updateUser({ password })
      if (pwError) {
        toast.error(pwError.message)
        return
      }
      // RLS self-update; column grant limits this to name/avatar/bio.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', userData.user.id)
      if (profileError) {
        toast.error(profileError.message)
        return
      }
      toast.success('Welcome aboard.')
      router.push('/')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 text-card-foreground"
      >
        <div className="space-y-1">
          <h1 className="text-base font-semibold">Welcome to the Safeguarding Hub</h1>
          <p className="text-muted-foreground">Finish setting up your account.</p>
        </div>
        <div>
          <Label htmlFor="display_name">Your name</Label>
          <Input
            id="display_name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="password">Choose a password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldHint>At least 10 characters. Magic-link sign-in also works any time.</FieldHint>
        </div>
        <Button type="submit" size="default" className="w-full" disabled={pending}>
          {pending ? 'Saving…' : 'Finish setup'}
        </Button>
      </form>
    </main>
  )
}
