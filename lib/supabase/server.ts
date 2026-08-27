import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { assertSafeguardingProject } from './project-ref'

/**
 * Request-bound Supabase client for Server Components, Server Actions and
 * Route Handlers. Carries the signed-in team member's session, so every query
 * runs as `authenticated` and is subject to RLS.
 *
 * Do not call this in a loop or in several components per request — go through
 * `lib/supabase/cached-server.ts` so the work is deduplicated.
 */
export async function createClient() {
  // Call cookies() first so Next marks callers as dynamic. Without it, Next can
  // try to prerender a route that depends on auth and it fails at build with no
  // env vars present.
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local'
    )
  }

  assertSafeguardingProject(supabaseUrl)

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // proxy.ts refreshes the session on every request, so the write is
          // redundant here rather than lost.
        }
      },
    },
  })
}
