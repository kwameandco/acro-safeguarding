# Supabase connect-up runbook

The portal is fully built but **has no database yet**. This is the one-time procedure
for bringing it live. Until every step is done, the deployed/local app fails closed to
`/auth/error?reason=config` by design.

## 1. Create the project

Supabase dashboard → New project. Region **eu-west-2 (London)** — same as AcroPassport
and SLAC; safeguarding data about UK community members should stay in the UK/EEA.
Note the **project ref** (the `<ref>` in `https://<ref>.supabase.co`).

## 2. Pin the ref

- Record the ref in this file (replace the placeholder below) and in `.env.example`.
- Local: `.env.local` gets all five values (see `.env.example`).
- Netlify (when a site exists): same five in Site configuration → Environment variables.

> **Project ref:** `TBD — fill in on creation`

The app refuses to boot against any other project (`lib/supabase/project-ref.ts`), so a
typo here shows up as a loud startup error, never as silently using the wrong database.

## 3. Connect an MCP server (Claude Code sessions)

Add a Supabase MCP server for the new project (env-level connector for web sessions,
`.mcp.json` for local ones — mirror how `AcroPassport_Supabase` / `SLAC_Supabase` are
wired). **Before any `apply_migration` or `execute_sql`, confirm `get_project_url`
resolves to the pinned ref.** The AcroPassport (`xzchwjxuxkqpexcovpzl`) and SLAC
(`zsmzqsdstakdglegomxf`) servers in the same environment are different databases —
never apply this repo's migrations to them.

## 4. Apply the migrations, in filename order

Via MCP `apply_migration`, one file at a time, in order:

1. `20260827120000_bootstrap_migration_registry.sql`
2. `20260827120100_profiles_and_team_identity.sql`
3. `20260827120200_communities.sql`
4. `20260827120300_team_invites_and_member_rpcs.sql`
5. `20260827120400_board_tasks.sql`
6. `20260827120500_calendar_events.sql`
7. `20260827120600_resources_library.sql`
8. `20260827120700_announcements.sql`
9. `20260827120800_incident_reports.sql`

After each: run the **Verify** block at the foot of the file with `execute_sql` and
check the expectations hold (confirm-applied + sample test — never trust "MCP returned
success"). After all nine, update each file's `STATUS:` header line to
`APPLIED <date> to <ref>` in a follow-up commit.

## 5. Auth settings + first owner

- Auth → Providers: **Email** on (magic link + password). No OAuth.
- Auth → URL configuration: site URL + redirect URLs for the deployed origin and
  `http://localhost:3000`.
- Sign up the first account (the DB trigger allows the very first user through with no
  invite — bootstrap), then promote it:

  ```sql
  UPDATE public.profiles SET role = 'owner', is_admin = true WHERE email = '<K''s email>';
  ```

- Everyone else arrives via Team page invites (`admin.inviteUserByEmail` +
  `/join/<id>` handoff links).

## 6. Storage sanity check

Migration 7 creates the private `resources` bucket (25 MB/file). Confirm in dashboard →
Storage, then upload one file through the portal's Resources page and open it back
(signed URL round-trip).

## 7. Type generation (optional hardening, later)

`lib/*/types.ts` are hand-authored to match the migrations. Once the project is live,
generated types (`generate_typescript_types`) can replace/augment them — if adopted,
also adopt AcroPassport's types-freshness stamp discipline so they can't drift.

## 8. Regenerate reality checks

Run `get_advisors` (security) after applying everything; the expected findings list is
empty. Anything it flags on these tables is a regression against the migration
comments — fix, don't suppress.
