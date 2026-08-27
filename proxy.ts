import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { assertSafeguardingProject } from '@/lib/supabase/project-ref'

/**
 * Edge proxy (Next 16's renamed middleware — the file MUST be `proxy.ts`, and a
 * `middleware.ts` must never also exist or the build hard-errors).
 *
 * Two jobs:
 *  1. Refresh the Supabase session cookie on every request, so a member's
 *     session does not silently expire mid-visit.
 *  2. Gate the portal. Everything is private by default: an unauthenticated
 *     request to any route except the auth pages is bounced to /login.
 *
 * Note what this deliberately does NOT do: decide what a signed-in member may
 * read. That is RLS's job in the database. This is a routing gate, not an
 * authorisation model.
 */

/** Routes reachable without a session. Everything else requires one. */
// /join is the hand-delivered invite landing. It must be reachable with no
// session — that is the whole point — and it redeems nothing on GET.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/confirm', '/auth/error', '/join']

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Fail closed on missing or wrong config rather than waving requests through.
  //
  // The wrong-project case is the dangerous one: a stale NEXT_PUBLIC_SUPABASE_URL
  // inherited from the shell (AcroPassport's, say) would authenticate team
  // members against someone else's auth.users without erroring. Refuse instead.
  let configOk = Boolean(supabaseUrl && supabaseKey)
  if (supabaseUrl) {
    try {
      assertSafeguardingProject(supabaseUrl)
    } catch {
      configOk = false
    }
  }

  if (!configOk || !supabaseUrl || !supabaseKey) {
    if (isPublic(request.nextUrl.pathname)) return response
    const url = request.nextUrl.clone()
    url.pathname = '/auth/error'
    url.searchParams.set('reason', 'config')
    return NextResponse.redirect(url)
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // getUser() (not getSession()) — it revalidates the JWT against Supabase Auth
  // rather than trusting a cookie the client could have forged.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Preserve where they were heading so login can send them back.
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Every path except Next internals and static assets. Note this DOES match
     * '/' — that is what keeps the portal root private.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
