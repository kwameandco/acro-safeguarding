/**
 * Europe/London ↔ UTC conversion for <input type="datetime-local">.
 *
 * The input has no timezone; the server container runs UTC. Treating the typed
 * value as UTC would silently shift every summer event by an hour — a booking
 * system cannot be casually wrong about when a class starts, so the conversion
 * is explicit rather than assumed.
 */

function londonOffsetMinutes(at: Date): number {
  const part = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    timeZoneName: 'longOffset',
  })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value

  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(part ?? '')
  if (!m) return 0 // plain "GMT" (winter) formats without the numeric suffix
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/** 'YYYY-MM-DDTHH:mm' typed as London wall-clock time → UTC ISO string. */
export function londonLocalToUtcIso(local: string): string {
  const asUtc = new Date(`${local}:00Z`)
  if (Number.isNaN(asUtc.getTime())) throw new Error(`invalid datetime: ${local}`)
  // First guess with the offset at the naive instant, then recompute at the
  // guessed instant so values just across a DST switch resolve correctly.
  let utc = new Date(asUtc.getTime() - londonOffsetMinutes(asUtc) * 60_000)
  utc = new Date(asUtc.getTime() - londonOffsetMinutes(utc) * 60_000)
  return utc.toISOString()
}

/** UTC ISO → 'YYYY-MM-DDTHH:mm' London wall-clock, for input values. */
export function utcToLondonLocal(iso: string): string {
  const d = new Date(iso)
  const wall = new Date(d.getTime() + londonOffsetMinutes(d) * 60_000)
  return wall.toISOString().slice(0, 16)
}

export function formatLondon(iso: string, withTime = true): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(iso))
}

/**
 * 'YYYY-MM-DD' for the London day an instant falls on. The calendar buckets
 * events by day, and doing that on the raw UTC ISO string would file a 00:30
 * BST event under the previous day.
 */
export function londonDateKey(iso: string): string {
  return utcToLondonLocal(iso).slice(0, 10)
}

/** 'HH:mm' London wall-clock — the calendar cell's one-line time. */
export function londonTime(iso: string): string {
  return utcToLondonLocal(iso).slice(11, 16)
}

/**
 * Every 'YYYY-MM-DD' key from `startIso` to `endIso` inclusive, London-side.
 * A weekend intensive occupies both of its days on the grid rather than only
 * appearing on the Saturday.
 */
export function londonDateKeysBetween(startIso: string, endIso: string | null): string[] {
  const first = londonDateKey(startIso)
  if (!endIso) return [first]
  const last = londonDateKey(endIso)
  if (last <= first) return [first]

  const keys: string[] = []
  // Step in UTC noon to stay clear of DST edges — only the date part is used.
  const cursor = new Date(`${first}T12:00:00Z`)
  const stop = new Date(`${last}T12:00:00Z`)
  while (cursor <= stop) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return keys
}
