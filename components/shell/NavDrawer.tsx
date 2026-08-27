'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type NavLink = { href: string; label: string }

/**
 * Mobile hamburger + slide-down panel. PortalNav (server) stays the source of
 * truth for which links exist — this just owns open/close state and how they
 * render below `md`. Hand-rolled, no Dialog dependency: this repo has none,
 * and one hamburger menu doesn't justify adding one.
 *
 * Cosmetic only, same as the rest of the nav — hiding a link here changes
 * what renders, never what RLS allows a request to read.
 */
export function NavDrawer({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Route change closes the drawer — otherwise a tapped link leaves it open
  // behind the new page. Adjusting state during render (not in an effect) is
  // the pattern React recommends for "reset state when a prop changes" —
  // see https://react.dev/learn/you-might-not-need-an-effect.
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (pathname !== prevPathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  return (
    <div className="md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-expanded={open}
        aria-controls="portal-nav-drawer"
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X /> : <Menu />}
      </Button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-40 bg-foreground/20"
            onClick={() => setOpen(false)}
          />
          <nav
            id="portal-nav-drawer"
            aria-label="Portal navigation"
            className="absolute inset-x-0 top-full z-50 border-b bg-card p-2 shadow-lg"
          >
            <ul className="flex flex-col gap-1">
              {links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      )}
    </div>
  )
}
