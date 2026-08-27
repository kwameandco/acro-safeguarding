# Task: safeguarding-dashboard-scaffold

**Branch:** `claude/acro-safeguarding-dashboard-69j8v1`
**Status:** in progress
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

- Foundation (schema ×9 migrations, auth/invites, shell, guard, docs): committed.
- Feature modules: 7-agent fan-out per spec — in progress.
- Gates: `npm run lint` + `npx tsc --noEmit` + `npm run build` (exit-code-checked)
  before push.

## Next safe step

Integrate agent output, run gates, push branch. Then (separate sessions, once K
creates the Supabase project): apply migrations per `docs/SUPABASE_SETUP.md`,
first-owner bootstrap, Netlify site.
