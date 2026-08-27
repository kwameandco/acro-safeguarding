'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  className?: string
}

/**
 * Horizontal scroll viewport with edge-fade affordances + click-to-scroll
 * arrows, ported from AcroPassport's ScrollableTabBar (English-only here, so
 * no next-intl). Fades and arrows appear only on the side(s) that have more
 * content, so a partially-hidden tab row reads clearly as "scroll for more".
 * Keyboard users move between tabs with arrow keys, which scrolls the
 * focused tab into view natively.
 */
export function ScrollableTabBar({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const max = scrollWidth - clientWidth
    const left = scrollLeft > 1
    const right = scrollLeft < max - 1
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [update])

  const scrollByDir = useCallback((dir: 1 | -1) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' })
  }, [])

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={update}
        className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
      >
        {children}
      </div>

      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background via-background/80 to-transparent transition-opacity duration-150',
          edges.left ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 transition-opacity duration-150',
          edges.left ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          tabIndex={-1}
          aria-label="Scroll tabs left"
          onClick={() => scrollByDir(-1)}
          className="rounded-full border shadow-sm"
        >
          <ChevronLeft />
        </Button>
      </div>

      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background via-background/80 to-transparent transition-opacity duration-150',
          edges.right ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'absolute right-0 top-1/2 -translate-y-1/2 transition-opacity duration-150',
          edges.right ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
      >
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          tabIndex={-1}
          aria-label="Scroll tabs right"
          onClick={() => scrollByDir(1)}
          className="rounded-full border shadow-sm"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}
