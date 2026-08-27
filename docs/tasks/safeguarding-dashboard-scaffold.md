# Task: safeguarding-dashboard-scaffold

**Branch:** `claude/acro-safeguarding-dashboard-69j8v1`
**Status:** done
**Spec:** `docs/specs/dashboard-scaffold.md`

## Goal

Stand up the Acro Safeguarding Hub — a private portal for the cross-community acro
safeguarding team (collaboration, resource sharing, communication, coordination), from
the SLAC admin-portal scaffold, with no live Supabase project yet (K connects one
later).

## Scope (K's brief, 2026-08-27)

- Logins (invite-only, magic link + password)
- Task board / kanban
- Shared calendar
- Resource library (docs, tagging, sort, search)
- Internal announcements
- Dashboard feed with upcoming things
- Edit profile / settings
- GDPR-safe incident reporting form, shaped to later link to a public anonymous form

## Decisions (K, AskUserQuestion round)

1. Incident reads: **community-scoped** — leads/owners all; members their own
   community's; NULL community ⇒ leads/owners only.
2. Everything else: **shared pool + community tag** (filter, not boundary).
3. Roles: **owner/member + is_admin + is_safeguarding_lead flags**.
4. Anonymous public form: **same app, public route, later** — schema shaped now
   (`source`, nullable `reported_by`), no anon grants yet.

## State

- Foundation (schema ×9 migrations, auth/invites, shell, guard, docs): commit
  `f38a2d8`.
- Feature modules (board, calendar, resources, announcements, incidents,
  dashboard feed, team+settings rework): built via 7-agent fan-out per spec,
  integrated in the follow-up commit on this branch.
- Gates at integration: `npm run lint` exit 0 · `npx tsc --noEmit` exit 0 ·
  `npm run build` exit 0 (exit codes captured to files, not inferred from
  piped output). House-rule sweeps (middleware.ts, internal `<a href>`,
  sub-12px fonts, dangerouslySetInnerHTML, bare Record-index JSX, SLAC
  leftovers): all clean.
- Cannot be sample-tested end-to-end from this environment: **no Supabase
  project exists**, so DB round-trips, RLS probes and storage upload are
  untestable until connect-up. Correctness is by construction against the
  migration schemas + the three gates. This gap is explicit per the
  confirm-applied rule.

**Status update:** done (branch complete, unmerged).

## Next safe step

K: review + merge the PR for this branch. Then, in a migration-capable session
once the Supabase project is created: `docs/SUPABASE_SETUP.md` end to end
(apply ×9 migrations with per-file verify blocks, first-owner bootstrap, auth
settings, storage check), then a real-device pass on the deployed portal.
Future feature session: the public anonymous `/report` route (schema is ready;
needs its own rate-limited SECURITY DEFINER RPC migration).
