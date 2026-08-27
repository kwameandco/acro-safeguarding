import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Magic-link landing. Exchanges the one-time code for a session cookie, then
 * forwards to wherever the member was originally headed.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  // Only ever redirect to a path on this origin. Without this check, `next` is
  // an open redirect: a crafted link would bounce a freshly-authenticated
  // member to an attacker's page.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`)
  }

  return NextResponse.redirect(`${origin}${safeNext}`)
}
