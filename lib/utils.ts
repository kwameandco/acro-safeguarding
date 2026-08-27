import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** shadcn's class merger: conditional classes, with later Tailwind utilities winning. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * `"South London Acro!"` → `"south-london-acro"`. Lowercases, turns any run of
 * spaces/punctuation into a single hyphen, and trims leading/trailing hyphens.
 * Used for `communities.slug`, which is generated from `name` rather than
 * typed separately.
 */
export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
