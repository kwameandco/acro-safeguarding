import Link from 'next/link'
import { getCurrentProfile } from '@/lib/supabase/cached-server'
import { signOut } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { NavDrawer } from './NavDrawer'

/**
 * Portal chrome. Server component: the links shown follow the profile, but
 * remember this only decides what to RENDER — RLS decides what any route can
 * actually read, so a hand-typed /team URL by a volunteer shows an empty page,
 * not other people's data. Same reasoning covers the mobile drawer below:
 * NavDrawer just changes how these links are presented under `md`, not which
 * ones exist.
 */
export async function PortalNav() {
  const profile = await getCurrentProfile()

  // Incidents is deliberately visible to every member: anyone can raise a
  // concern, and members see their own community's log (RLS scopes the reads —
  // this list only decides what to render).
  const links = [
    { href: '/board', label: 'Board' },
    { href: '/calendar', label: 'Calendar' },
    { href: '/resources', label: 'Resources' },
    { href: '/announcements', label: 'Announcements' },
    { href: '/incidents', label: 'Incidents' },
    ...(profile?.role === 'owner' || profile?.is_admin ? [{ href: '/team', label: 'Team' }] : []),
    { href: '/settings', label: 'Settings' },
  ]

  return (
    <header className="relative border-b bg-card">
      <div className="mx-auto flex max-w-5xl items-center gap-x-4 px-6 py-3">
        <Link href="/" className="font-semibold text-foreground">
          Safeguarding Hub
        </Link>

        <nav className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {profile?.display_name ?? profile?.email ?? ''}
          </span>
          <form action={signOut}>
            <Button type="submit" variant="ghost" size="xs">
              Sign out
            </Button>
          </form>
          <NavDrawer links={links} />
        </div>
      </div>
    </header>
  )
}
