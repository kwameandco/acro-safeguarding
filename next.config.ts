import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,

  // cacheComponents is deliberately OFF, unlike AcroPassport.
  //
  // AP turns it on because most of AP is public, enumerable, cacheable content
  // (profiles, skills, events, hubs) where a prerendered static shell is a real
  // win. This portal is the opposite: every route is auth-gated and renders
  // per-request data for one signed-in team member, so there is nothing to
  // prerender — cacheComponents would add the entire prerender-wall tax
  // (`generateStaticParams` on every dynamic segment, `__shell__` throwaway
  // params, `connection()` placement, build-time DB timeouts) and buy nothing.
  //
  // Revisit only if this portal ever grows genuinely public cacheable routes.
  // See docs/ARCHITECTURE.md §Rendering.

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // A team admin portal should never be indexed, at any depth, on any
          // host. robots.txt is advisory; X-Robots-Tag travels on the response
          // and is honoured as a hard directive even for pages reached direct.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ]
  },
}

export default nextConfig
