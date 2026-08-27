import Link from 'next/link'

/**
 * Shared chrome for a dashboard feed section: a title, an "All →" link to the
 * section's home module, and whatever body the page hands it (a list, an
 * empty state, or an error note). The body is deliberately a slot rather than
 * a prop shape this component understands — each section's row markup differs
 * by data source, only the header chrome is common.
 */
export function DashboardSection({
  title,
  href,
  children,
}: {
  title: string
  href: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        <Link href={href} className="text-primary hover:underline">
          All →
        </Link>
      </div>
      {children}
    </section>
  )
}
