# Acro Safeguarding Hub — Claude Code Instructions

Entry point. Keep it short: **this file = orientation**, `docs/` = the detail.

---

## What this is

A private portal for the **cross-community acro safeguarding team** — collaboration,
resource sharing, communication and coordination first (task board, shared calendar,
resource library, announcements, dashboard feed), plus the safeguarding-specific
capability: a GDPR-safe incident log with community-scoped access, shaped to later
accept anonymous public reports.

Scaffolded 2026-08-27 from `kwameandco/southlondonacro`'s `admin/` portal (the closer
donor — small-team, auth-gated, RLS-authorised) with AcroPassport patterns where noted.
Both repos are connected **read-only, for reference**: port patterns, never modify them.

The app lives at the **repo root** (this is a dedicated repo, unlike SLAC's `admin/`
subdirectory).

## The Supabase project does not exist yet

**As of 2026-08-27 there is NO Supabase project for this portal.** All migrations in
`supabase/migrations/` are authored and committed but **PENDING APPLY**. Until K creates
the project and pins its ref:

- The app builds and deploys fine with no env vars; every request fails closed to
  `/auth/error?reason=config`. That is the guard working, not a bug.
- **Never apply this repo's migrations to any currently-connected Supabase MCP server.**
  The servers in this environment belong to AcroPassport (`xzchwjxuxkqpexcovpzl`) and
  SLAC (`zsmzqsdstakdglegomxf`) — different databases. Nothing in this repo may be
  applied to either, ever.
- Connect-up runbook: `docs/SUPABASE_SETUP.md`. Once the project exists, record its ref
  in that file and `.env.example`, and confirm `get_project_url` resolves to it before
  every `apply_migration`/`execute_sql`.

## The wrong-database trap

The Claude Code container has `NEXT_PUBLIC_SUPABASE_URL` already set — to AcroPassport's
ref — because the AP repo is checked out alongside. `lib/supabase/project-ref.ts` refuses
ANY remote connection unless the URL's ref matches `NEXT_PUBLIC_SUPABASE_PROJECT_REF`
(unset today ⇒ always refuse). Do not weaken it, and do not assume an env var is right
because it is set.

---

## Session rules

- **State the active branch and latest commit SHA at the start of every session.**
- **Never work on more than one branch per session.** Branches: `claude/<slug>` or
  `cc/<slug>`.
- **Flag when the current model is overpowered for the work at hand** and pause so K can
  downshift. Check at the start of every turn, not just session start.
- **Close every turn that could be the last with an explicit session-status line** —
  Over / Over pending a PR (name it and what it waits on) / Not over (what's in flight).
  Never hand the question back as "ready to close out?".
- **K's local shell is PowerShell on Windows.** Commands handed to K: no `&&`, `$(...)`,
  here-docs, `xargs`, `sed -i`, `chmod +x`. Bash inside this sandbox is fine.
- **Always include copy-paste-ready local testing instructions** when a change is
  testable locally, by default. Assume a cold start (see §Local testing).

## Before pushing

Run both from the repo root and confirm both pass **by exit code** (never infer success
from piped output — `npm run build | tail` returns tail's exit code):

```bash
npm run lint
npm run build     # NOT `npx next build` — that skips the prebuild chain
```

---

## Architecture decisions worth not re-litigating

Full reasoning in `docs/ARCHITECTURE.md`.

- **`cacheComponents` is OFF** (like SLAC, unlike AP): every route is auth-gated and
  per-request; a prerender wall would be all tax, no benefit.
- **RLS is the authorisation model.** Helpers like `isCurrentUserAdmin()` decide what to
  *render*; the database decides what can be *read*. Every table: RLS **and** matching
  GRANTs — and `REVOKE ALL` first (platform default privileges grant anon/authenticated
  ALL on every new relation; a GRANT is checked before RLS is evaluated).
- **Roles are `owner`/`member` + flags** (`is_admin`, `is_safeguarding_lead`). Privileged
  profile columns (role, flags, `is_active`, `community_id`) sit OUTSIDE the self-update
  column grant and change only via SECURITY DEFINER RPCs.
- **Shared pool + community tag**: tasks/calendar/resources are team-wide; `community_id`
  is a filter tag. **Incidents are the exception**: leads/owners read everything, members
  read/work only their own community's incidents (`can_work_incident()`), NULL community
  = leads/owner only.
- **Incident records are append-only territory**: no DELETE anywhere, `incident_notes`
  has no UPDATE. Retention/erasure is a documented manual process (`docs/GDPR.md`),
  not an app button.
- **Registration is invite-only, enforced by a DB trigger** on `auth.users` — the form
  is not the boundary. Invite links are handed out via `/join/<id>` interstitials
  (chat-app preview bots eat raw one-time links).
- **`profiles` rows are created by trigger** on signup. Always `.update()`, never
  `.insert()`/`.upsert()`.
- **Request-level fetches are deduplicated**: never call `supabase.auth.getUser()` in a
  server component — use `getCurrentUser()`/`getCurrentProfile()` from
  `lib/supabase/cached-server.ts`.
- **Edge middleware lives in `proxy.ts`** (Next 16 rename). Never create `middleware.ts`.
- **Europe/London time handling** goes through `lib/shared/time.ts`
  (`londonLocalToUtcIso`/`utcToLondonLocal`/`formatLondon`) — never `new Date(value)` on
  a datetime-local input.

## Code standards

- TypeScript everywhere — `any` is an ESLint **error**.
- Server Components by default; `'use client'` only when needed.
- Dark mode on every component — every token in **both** `:root` and `.dark`.
- All button-shaped elements use the `<Button>` primitive with a variant; toggled state
  is `variant={selected ? 'default' : 'outline'}` + `aria-pressed`. Primary actions
  (Add, Create, Save, Send, Report, Publish) use the **default** variant; `outline` is
  secondary/cancel. No `className` on `<Button>` for font/size/colour/radius — layout
  classes only.
- **Never render a `Record<…>` lookup with a bare index into JSX** — always
  `Map[key] ?? Map.fallback` (React #130 takes down the whole route).
- **A CHECK-constraint enum and its TS union widen together, in the same migration.**
- Default readable text `text-sm`; `text-xs` metadata only; nothing smaller.
- Internal navigation uses `next/link`, never `<a href="/…">`.
- English only. No new npm packages without flagging first.
- Never add "Co-authored-by Claude" or any other AI reference to a commit.

## Terminology

Same as AcroPassport/SLAC: **acrobat** (not user/member/practitioner — "team member" is
fine for portal members), role, discipline, skill, jam, event, connection, community.
Portal roles: `owner` / `member`; authority via `is_admin` / `is_safeguarding_lead`.
Safeguarding vocabulary: **concern** (what a member raises), **incident** (the logged
record), **lead** (global incident access).

---

## Local testing

Cold start, from a fresh terminal in VSCode:

```powershell
cd <repo>
git fetch origin
git checkout claude/acro-safeguarding-dashboard-69j8v1
npm install
npm run dev
```

Open <http://localhost:3000>. With no `.env.local` you'll land on
`/auth/error?reason=config` — the wrong-database guard doing its job; the full portal is
only testable once the Supabase project exists (`docs/SUPABASE_SETUP.md`). This never
touches Netlify.

## Migrations

There is no live project yet — see the warning at the top. Once there is: apply via a
Supabase MCP server whose `get_project_url` resolves to THIS portal's pinned ref,
`apply_migration` for DDL, `execute_sql` for read-only checks, **confirm-applied +
sample test** before calling anything done (each migration file ends with its verify
block), and check for migration drift at the start of every migration-touching session
(match registry rows to files **by name, not version** — `apply_migration`
auto-registers a second row per migration; that's normal, not drift).
