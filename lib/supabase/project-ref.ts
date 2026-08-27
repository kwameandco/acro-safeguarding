/**
 * Wrong-database guard.
 *
 * This is not hypothetical. The Claude Code container that scaffolded this repo
 * has `NEXT_PUBLIC_SUPABASE_URL` already set — to AcroPassport's project ref, a
 * completely different database — because the AcroPassport and SLAC repos are
 * checked out alongside this one for reference. A `next build`/`next start`
 * here with no `.env.local` would therefore pick up AP's URL and authenticate
 * team members against AP's `auth.users`, silently. SLAC's portal hit exactly
 * this and pinned its ref as a constant.
 *
 * This portal's Supabase project DOES NOT EXIST YET, so there is no constant to
 * pin. The pin is an env var instead: `NEXT_PUBLIC_SUPABASE_PROJECT_REF` must
 * name the expected ref, and the URL must match it. No pin → no remote
 * connection, full stop. When the project is created, set both values in
 * .env.local / Netlify and this file needs no edit.
 *
 * Safeguarding data raises the stakes beyond SLAC's version: pointing this
 * portal at the wrong database would put incident reports somewhere they must
 * never be. Fail closed, loudly.
 */

/** Local Supabase stacks (`supabase start`) have no project ref to check. */
function isLocalSupabase(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

/** Extract the `<ref>` from `https://<ref>.supabase.co`. */
function projectRefOf(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    if (!hostname.endsWith('.supabase.co')) return null
    return hostname.slice(0, -'.supabase.co'.length).split('.').pop() ?? null
  } catch {
    return null
  }
}

/**
 * Throws unless `url` is the pinned safeguarding-hub project (or a local
 * stack). Deliberately loud: a thrown error at startup is recoverable, while a
 * portal silently pointed at the wrong database is not.
 */
export function assertSafeguardingProject(url: string): void {
  if (isLocalSupabase(url)) return

  const expected = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF
  if (!expected) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_PROJECT_REF is not set. This portal refuses to connect to any ' +
        'remote Supabase project until its ref is pinned — a stale NEXT_PUBLIC_SUPABASE_URL ' +
        'inherited from the shell (e.g. AcroPassport’s) would otherwise be used silently. ' +
        'Set both values in .env.local (see .env.example).'
    )
  }

  const ref = projectRefOf(url)
  if (ref === expected) return

  throw new Error(
    `NEXT_PUBLIC_SUPABASE_URL points at Supabase project "${ref ?? url}", not the pinned ` +
      `safeguarding-hub project ("${expected}"). Refusing to connect — this portal must never ` +
      `read or write another project's data.`
  )
}
