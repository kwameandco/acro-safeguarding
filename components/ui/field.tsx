import * as React from 'react'
import { cn } from '@/lib/utils'

/*
 * Minimal form primitives, shadcn-flavoured. One file on purpose: the portal
 * needs consistent inputs, not a component library.
 */

const inputClass =
  'h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-24 py-2', className)} {...props} />
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputClass, 'appearance-none', className)} {...props} />
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block font-medium', className)} {...props} />
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-muted-foreground">{children}</p>
}

const badgeTones = {
  neutral: 'bg-muted text-muted-foreground',
  green: 'bg-success/15 text-success',
  amber: 'bg-warning/20 text-warning-foreground dark:text-warning',
  red: 'bg-destructive/15 text-destructive',
  blue: 'bg-primary/10 text-primary',
} as const

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: keyof typeof badgeTones
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        badgeTones[tone] ?? badgeTones.neutral
      )}
    >
      {children}
    </span>
  )
}
