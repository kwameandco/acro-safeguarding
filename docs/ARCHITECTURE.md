# Architecture

One page; the deep reasoning lives in the migration file headers (deliberately — the
decision sits next to the SQL that enforces it) and in `CLAUDE.md` §Architecture
decisions.

## Shape

Next.js 16 App Router at the repo root, TypeScript strict, Tailwind v4 (`@theme inline`
oklch tokens in `app/globals.css`, both `:root` and `.dark`), React Compiler on,
**cacheComponents OFF** (all routes auth-gated + per-request; a prerender wall buys
nothing here — see `next.config.ts` header). Scaffolded from SLAC's admin portal.

- `proxy.ts` — edge gate: session cookie refresh + bounce anonymous requests to
  `/login`; fails closed to `/auth/error?reason=config` on missing/wrong Supabase
  config. Routing gate only — **authorisation is RLS**.
- `app/(portal)/…` — the six surfaces: dashboard feed `/`, `/board`, `/calendar`,
  `/resources`, `/announcements`, `/incidents`, plus `/team` (owner/admin) and
  `/settings`.
- `app/login`, `app/auth/*`, `app/join/[token]` — invite-only auth (DB-trigger
  enforced) + one-time-link handoff interstitial.
- `lib/supabase/` — clients (server/browser/admin) all assert the pinned project ref;
  `cached-server.ts` dedupes auth + profile per request.
- `lib/actions/` — server actions per module. `lib/<module>/types.ts` — TS unions
  mirroring each CHECK constraint (widen together, same migration).
- `supabase/migrations/` — nine files, PENDING APPLY until the project exists
  (`docs/SUPABASE_SETUP.md`).

## Access model

| Capability | Who |
| --- | --- |
| Read team, board, calendar, resources, announcements | every active member |
| Write board/calendar/resources | active members (edits/deletes: author or admin) |
| Write announcements, manage communities, invites, member community | admin or owner |
| Change roles, activate/deactivate/remove members, grant lead flag | owner |
| Raise an incident | every active member |
| Read/work incidents | leads + owners: all; members: own community's; NULL community: leads/owners only |

Powers compose: `role` (`owner`/`member`) + `is_admin` + `is_safeguarding_lead` flags.
Privileged profile columns change only via SECURITY DEFINER RPCs.

## The community model

One shared workspace. `communities` is a small reference table (deactivate, never
delete); `community_id` on tasks/events/resources is a **filter tag**, on
`incident_reports` it is a **boundary**, and on `profiles` it is the member's scope key
(admin-set only). Decision trail: K, 2026-08-27 (AskUserQuestion round, session 1).

## Future: public anonymous reporting

Same app, a public no-auth `/report` route, later. Schema is ready
(`source='public'`, nullable `reported_by`); the route will submit through a
rate-limited SECURITY DEFINER RPC added in its own migration, keeping `anon` at zero
table grants. Until then nothing anonymous exists — do not add `anon` grants ahead of
that design.
