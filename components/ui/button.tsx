import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/*
 * The single button primitive. Every button-shaped thing in this portal — chips,
 * pills, toggles, filter selectors, segmented controls — goes through it.
 *
 * Two rules carried over from AcroPassport, both learned from real drift:
 *  1. Never hand-roll a <button> with a custom `bg-*` to show selection. Use
 *     `variant={selected ? 'default' : 'outline'}` with `aria-pressed`.
 *  2. Never pass className to change font, size, colour or radius — use a size
 *     prop. Only layout classes (w-full, flex-1, mt-4, shrink-0) belong there.
 *
 * And: a primary action (Add, Create, Save, Send, Submit, Approve, Publish) uses
 * the default variant. `outline` is for secondary/cancel/back/dismiss.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-7 px-2 text-xs',
        sm: 'h-9 px-3 text-[0.8rem]',
        default: 'h-10 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        'icon-xs': 'size-7',
        'icon-sm': 'size-9',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'sm' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
