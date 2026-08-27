'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'

/**
 * Password or magic link — the member chooses. There is deliberately no
 * register link: registration is invite-only, enforced by a database trigger
 * on auth.users, so a signup form would only ever show an error.
 *
 * Nothing here reveals whether an email belongs to the team.
 */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [linkSent, setLinkSent] = useState(false)

  async function withPending(fn: () => Promise<void>) {
    setPending(true)
    try {
      await fn()
    } finally {
      setPending(false)
    }
  }

  const signInWithPassword = (e: React.FormEvent) => {
    e.preventDefault()
    withPending(async () => {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        toast.error('Sign-in failed. Check the details or use a magic link.')
        return
      }
      router.push(safeNext)
      router.refresh()
    })
  }

  const sendMagicLink = () =>
    withPending(async () => {
      if (!email.includes('@')) {
        toast.error('Enter your email first.')
        return
      }
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // shouldCreateUser false: login page logs people in. Accounts are
          // only ever created via the invite flow.
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext)}`,
        },
      })
      if (error && !/signups not allowed/i.test(error.message)) {
        toast.error('Could not send the link. Try again in a moment.')
        return
      }
      setLinkSent(true)
    })

  const sendReset = () =>
    withPending(async () => {
      if (!email.includes('@')) {
        toast.error('Enter your email first.')
        return
      }
      const supabase = createClient()
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/auth/reset-password')}`,
      })
      // Always the same message — no account enumeration.
      toast.success('If that address belongs to a member, a reset link is on its way.')
    })

  if (linkSent) {
    return (
      <div className="space-y-2">
        <h1 className="text-base font-semibold">Check your email</h1>
        <p className="text-muted-foreground">
          If <span className="font-medium text-foreground">{email}</span> belongs to a team
          member, a sign-in link is on its way. It expires in an hour.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={signInWithPassword} className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Acro Safeguarding Hub</h1>
        <p className="text-muted-foreground">Cross-community safeguarding team. Access is by invite.</p>
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </div>

      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <Button type="submit" size="default" className="w-full" disabled={pending || !password}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      <div className="flex items-center justify-between text-xs">
        <Button type="button" variant="link" size="xs" disabled={pending} onClick={sendMagicLink}>
          Email me a magic link
        </Button>
        <Button type="button" variant="link" size="xs" disabled={pending} onClick={sendReset}>
          Forgot password
        </Button>
      </div>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-card-foreground">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
