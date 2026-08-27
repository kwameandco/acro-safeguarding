import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SIGNED_URL_TTL_SECONDS = 60

/**
 * Opens a file-kind resource: mints a 60-second signed URL and redirects to
 * it. Link-kind resources never reach this route — the list links straight to
 * their `url`.
 *
 * Plain GET, unlike app/join/[token]/redeem's POST-only pattern: that route
 * guards a one-time auth token against link-preview crawlers. This one hands
 * out read-only, time-boxed access to a file the viewer can already read
 * (RLS via `resources member read` applies here identically), so a prefetch
 * is a non-issue and a normal `<Link>` (including opening in a new tab) is
 * the right shape.
 *
 * Auth itself is proxy.ts's job — this path isn't in its public allow-list,
 * so an unauthenticated request never reaches here. RLS is what actually
 * decides whether the row/object read below succeeds.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const { origin } = new URL(request.url)
  const failed = () => NextResponse.redirect(`${origin}/resources?error=open-failed`)

  const supabase = await createClient()
  const { data: resource, error } = await supabase
    .from('resources')
    .select('id, kind, storage_path')
    .eq('id', id)
    .maybeSingle()

  if (error || !resource || resource.kind !== 'file' || !resource.storage_path) {
    return failed()
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('resources')
    .createSignedUrl(resource.storage_path, SIGNED_URL_TTL_SECONDS)

  if (signError || !signed?.signedUrl) {
    return failed()
  }

  return NextResponse.redirect(signed.signedUrl)
}
