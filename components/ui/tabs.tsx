'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/*
 * Minimal, dependency-free tabs primitive — controlled `value`/`onValueChange`,
 * same shape as AcroPassport's (which wraps @base-ui/react/tabs). Hand-rolled
 * rather than adding that dependency: this portal deliberately stays off AP's
 * heavier client libraries (see docs/admin-portal-architecture.md §2), and a
 * tab shell is simple enough not to need one.
 *
 * All `<TabsContent>` panels stay mounted and are only `hidden`, never
 * unmounted — switching tabs must not lose an open form's local state or
 * re-fetch data, and ARIA tabpanel semantics expect the panel to exist even
 * when inactive.
 */

interface TabsContextValue {
  value: string
  setValue: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(component: string): TabsContextValue {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error(`<${component}> must be used inside <Tabs>`)
  return ctx
}

export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string
  onValueChange: (value: string) => void
  className?: string
  children: React.ReactNode
}) {
  const ctx = React.useMemo(
    () => ({ value, setValue: onValueChange }),
    [value, onValueChange]
  )
  return (
    <TabsContext.Provider value={ctx}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <div role="tablist" className={cn('inline-flex items-center gap-1', className)}>
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const { value: active, setValue } = useTabsContext('TabsTrigger')
  const selected = active === value

  return (
    <button
      type="button"
      role="tab"
      id={`tab-${value}`}
      aria-selected={selected}
      aria-controls={`tabpanel-${value}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => setValue(value)}
      className={cn(
        'relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
        selected && 'text-foreground',
        className
      )}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-foreground opacity-0 transition-opacity',
          selected && 'opacity-100'
        )}
      />
    </button>
  )
}

export function TabsContent({
  value,
  className,
  children,
}: {
  value: string
  className?: string
  children: React.ReactNode
}) {
  const { value: active } = useTabsContext('TabsContent')
  const selected = active === value

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      hidden={!selected}
      className={cn('text-sm outline-none', className)}
    >
      {children}
    </div>
  )
}
