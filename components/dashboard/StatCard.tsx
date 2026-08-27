/**
 * A single stat tile in the dashboard's top row.
 *
 * `value` is `number | null` on purpose, not defaulted to 0 by the caller:
 * null means "this read failed", and a failed read must never render as the
 * plausible-looking number zero — on a safeguarding dashboard, "0 open
 * incidents" reads as reassurance, and reassurance built on a broken query is
 * worse than an honest "—".
 */
export function StatCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value ?? '—'}</p>
    </div>
  )
}
