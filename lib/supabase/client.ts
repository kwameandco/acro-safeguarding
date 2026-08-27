import { createBrowserClient } from '@supabase/ssr'
import { assertSafeguardingProject } from './project-ref'

/** Browser Supabase client. Anon key only — every read/write is gated by RLS. */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — check .env.local'
    )
  }

  assertSafeguardingProject(supabaseUrl)

  return createBrowserClient(supabaseUrl, supabaseKey)
}
