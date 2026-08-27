# Task: supabase-connect-up

**Branch:** none yet — start from `main` once this session picks it up (see below)
**Status:** not started
**Depends on:** `docs/SUPABASE_SETUP.md` (the full runbook — this task file is the
pointer to it, not a duplicate)

## Why this is next

The portal (auth, board, calendar, resources, announcements, incidents, dashboard
feed, team/settings) is built, gated (lint/tsc/build all exit 0) and merged to `main`.
**Nothing is wired to a real database yet** — there is no Supabase project. Until this
task is done the app only reaches `/auth/error?reason=config` for every visitor,
which is correct behaviour, not a bug.

## Goal

Bring the portal live against a real Supabase project, following
`docs/SUPABASE_SETUP.md` end to end:

1. Create the Supabase project (region eu-west-2), note its ref.
2. Pin the ref in `.env.local` / Netlify (`NEXT_PUBLIC_SUPABASE_PROJECT_REF` +
   the URL/anon key/service key/site URL) — confirm the app's wrong-database
   guard (`lib/supabase/project-ref.ts`) accepts it and refuses everything else.
3. Connect a Supabase MCP server for the new project; **confirm `get_project_url`
   resolves to the pinned ref before touching it** — the AcroPassport and SLAC
   Supabase servers in this environment are different databases and must never
   receive this repo's migrations.
4. Apply all nine migrations in `supabase/migrations/`, in filename order, via
   `apply_migration`. Run each file's own **Verify** block with `execute_sql`
   after applying it — do not trust "MCP returned success" alone.
5. Auth settings (email provider on, redirect URLs) + bootstrap the first owner
   account per `docs/SUPABASE_SETUP.md` §5.
6. Storage sanity check: upload one file through `/resources`, open it back
   (signed-URL round-trip).
7. Run `get_advisors` (security) — expect zero findings; anything flagged is a
   regression against a migration's own comments, not something to suppress.
8. Update each migration file's `STATUS:` header line to `APPLIED <date> to <ref>`
   in one follow-up commit.

## Acceptance

- A real signup completes and lands on the dashboard feed (not the config-error
  page).
- Each of the six portal surfaces round-trips at least one real write (a task
  card, a calendar entry, a resource upload, an announcement, an incident
  report, a team invite) — this is the "sample test" the confirm-applied rule
  asks for, now possible for the first time.
- `docs/SUPABASE_SETUP.md`'s project-ref placeholder is filled in.

## Explicitly out of scope for this task

- The public anonymous incident-report route (`/report`) — separate future
  task, needs its own rate-limited SECURITY DEFINER RPC migration. Don't add
  `anon` grants to `incident_reports` while doing this task.
- Netlify hosting setup — can happen before or after; not blocking.
- A real device / cross-browser UI pass — do this once real data exists, not
  before (there's nothing to click through without a database).
