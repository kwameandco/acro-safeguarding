import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { PortalNav } from '@/components/shell/PortalNav'

/**
 * Every page in the (portal) group shares this: nav on top, profile required.
 * proxy.ts already bounced anonymous requests; reaching here without a profile
 * means the session is valid but the profiles row is missing or unreadable —
 * treat as signed out. A deactivated member gets a dead end, not the portal.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (!profile.is_active) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-sm rounded-lg border bg-card p-6 text-card-foreground">
          <h1 className="text-base font-semibold">Account deactivated</h1>
          <p className="mt-2 text-muted-foreground">
            Your portal access has been switched off. Speak to an owner if you think this is a
            mistake.
          </p>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-dvh">
      <PortalNav />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
