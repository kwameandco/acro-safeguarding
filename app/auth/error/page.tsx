import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const REASONS: Record<string, string> = {
  config:
    'The portal is not connected to its database. While the hub is still being set up this is the expected state — if it was working before, tell an admin.',
  missing_code: 'That sign-in link was incomplete. Request a fresh one.',
  exchange_failed: 'That sign-in link has expired or was already used. Request a fresh one.',
  fallback: 'Something went wrong signing you in.',
}

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams
  // Bare index into a Record renders `undefined` and throws React #130, taking
  // the whole route down. Always `?? fallback`.
  const message = REASONS[reason ?? ''] ?? REASONS.fallback

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 text-card-foreground">
        <h1 className="text-base font-semibold">Could not sign you in</h1>
        <p className="text-muted-foreground">{message}</p>
        {/* A link that looks like a button is still a link — render the anchor
            and borrow the styling, rather than nesting <a> inside <button>. */}
        <Link
          href="/login"
          className={cn(buttonVariants({ size: 'default' }), 'w-full')}
        >
          Back to sign in
        </Link>
      </div>
    </main>
  )
}
