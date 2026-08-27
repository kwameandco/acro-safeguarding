import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { assertSafeguardingProject } from './project-ref'

/**
 * Service-role Supabase client. **Bypasses RLS entirely.**
 *
 * Only for server-side work that legitimately has no user session to act as:
 * the AcroPassport sync job, scheduled imports, webhook handlers. Never import
 * this from anything that renders, and never let a request parameter decide
 * which rows it touches — that turns an RLS-protected table into an open one.
 *
 * For anything acting on behalf of a signed-in team member, use
 * `lib/supabase/server.ts` so RLS still applies.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — check .env.local'
    )
  }

  assertSafeguardingProject(supabaseUrl)

  return createSupabaseClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
