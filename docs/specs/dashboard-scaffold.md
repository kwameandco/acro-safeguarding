# Spec: safeguarding-hub feature modules (7-agent fan-out)

**Status:** done · **Branch:** `claude/acro-safeguarding-dashboard-69j8v1`
**Foundation commit:** see `git log` — schema, auth, shell, ui primitives are DONE and
committed. Agents build the surfaces on top. This file is the single source of truth
for the fan-out; each agent owns a disjoint file set and must not touch another
agent's files, the migrations, or the shell/lib foundation (exception: each agent
CREATES its own `lib/<module>/types.ts` + `lib/actions/<module>.ts`).

## Shared contract (every agent)

- Read `CLAUDE.md` first (code standards, terminology), then your table's migration
  file in `supabase/migrations/` — the schema IS the contract; column names and CHECK
  enums are exact.
- Patterns to copy, in this repo: `app/(portal)/team/page.tsx` + `components/team/
  TeamControls.tsx` (server page + client controls + server actions), `lib/actions/
  team.ts` / `lib/actions/profile.ts` (action shape: zod-free manual validation,
  `revalidatePath`, typed returns), `components/ui/*` (Button, Input, Textarea,
  Select, Label, FieldHint, Badge, tabs). Reference donors (READ-ONLY, do not
  modify): `/home/user/southlondonacro/admin/` for equivalents.
- Server components by default; `'use client'` leaf controls only. All reads via
  `createClient()` from `@/lib/supabase/server`; current user/profile via
  `getCurrentProfile()`/`isCurrentUserAdmin()`/`isCurrentUserLead()` from
  `@/lib/supabase/cached-server` — never `auth.getUser()` directly.
- Every list handles: loading not needed (server-rendered), but EMPTY state (helpful,
  with the primary action inline) and error state (Supabase error → render a quiet
  `<p className="text-muted-foreground">Couldn't load …</p>`, never throw to a blank
  route).
- CHECK enums: define the TS union + a `Record<Union, string>` label map in
  `lib/<module>/types.ts`; **read label maps with `?? fallback`, never a bare index**.
- Buttons: `<Button>` primitive only, primary action = default variant; toggles =
  `variant={selected ? 'default' : 'outline'}` + `aria-pressed`. Text: `text-sm`
  default, `text-xs` metadata only. Dark mode: use token classes (`bg-card`,
  `text-muted-foreground`, `border` …) — never raw colours.
- Dates: `formatLondon`/`londonDateKey`/`londonLocalToUtcIso`/`utcToLondonLocal` from
  `@/lib/shared/time` for ANY timestamptz ↔ input round-trip.
- Community tag pickers: `<Select>` over `communities` rows (`id, name` where
  `is_active`), optional ("All communities" / "No community" as empty value).
- No new npm packages. No `middleware.ts`. No `<a href="/…">` internal links.
- The app cannot run against a DB (none exists) — correctness is by construction +
  `npm run lint` + `npx tsc --noEmit` from the repo root. Run both before finishing;
  your module must be clean. Do NOT run `npm run build` (the integrator does).
- Commit nothing. The integrator commits.

## Server-action shape (copy `lib/actions/team.ts`)

`'use server'` file per module; each action: (1) `getCurrentProfile()` → bail
`{ error: 'Not signed in' }`; (2) validate fields manually (trim, length caps,
enum membership against the TS union); (3) supabase call; (4) map error →
`{ error: string }`, else `revalidatePath('/<route>')` + `{ ok: true }`. Client
controls call actions via `useTransition`, toast on error (`sonner`'s `toast`).

## Agent A — Task board (`/board`)

**Files:** `app/(portal)/board/page.tsx`, `components/board/*`,
`lib/board/types.ts`, `lib/actions/board.ts`.
**Table:** `board_tasks` (migration 20260827120400).

Kanban: four columns todo/doing/blocked/done (order fixed; labels To do / In
progress / Blocked / Done). Cards: title, assignee display_name, due date
(`formatLondon(iso, false)`, red-tinted `text-destructive` when overdue and not
done), community name badge, detail on an expandable/edit view. Native HTML5
drag-and-drop between columns (`draggable`, `onDragStart` dataTransfer taskId,
`onDragOver` preventDefault, `onDrop` → server action `moveTask(id, status,
beforePos, afterPos)` computing midpoint `position`; append to end = max+1). Also
per-card fallback move menu (Select of statuses) for touch/keyboard. New-task form
(title required; optional detail, assignee from profiles, due_on date input,
community). Edit + delete (delete only shown to creator/admin — read profile in the
server page and pass flags down). Sort within column by `position`. Filter row:
by assignee (Me), by community. Server page fetches tasks + profiles
(`id, display_name`) + communities in `Promise.all`.

## Agent B — Calendar (`/calendar`)

**Files:** `app/(portal)/calendar/page.tsx`, `components/calendar/*`,
`lib/calendar/types.ts`, `lib/actions/calendar.ts`.
**Table:** `calendar_events` (migration 20260827120500).

Month grid (server component computes the grid; `?month=YYYY-MM` searchParam,
default current London month; prev/today/next as `next/link`s). Bucket events by
`londonDateKey`; multi-day events (ends_at) appear on each day via
`londonDateKeysBetween`. Day cells: dot/kind-coloured chip per event (Badge tones:
meeting=blue, training=green, community_event=amber, deadline=red, other=neutral —
via a `Record<CalendarKind, tone>` map with `?? 'neutral'`). Below the grid: "Next
30 days" agenda list (time via `londonTime`, community badge). New/edit entry form
in a collapsible panel or `/calendar/new` subroute (title, kind Select, all_day
checkbox, datetime-local inputs through `londonLocalToUtcIso`/`utcToLondonLocal`,
location, description, community). Edit/delete only creator or admin (mirror RLS).
Mobile: grid collapses to the agenda list (`hidden md:grid` pattern).

## Agent C — Resource library (`/resources`)

**Files:** `app/(portal)/resources/page.tsx`, `components/resources/*`,
`lib/resources/types.ts`, `lib/actions/resources.ts`.
**Table + bucket:** `resources`, storage bucket `resources` (migration
20260827120600).

List (cards or rows): title, description (clamped), tag chips, community badge,
uploader, date, kind icon (file vs link — lucide `FileText`/`Link2`). Search box +
tag filter + sort (newest / title A-Z / recently updated) — all via searchParams,
server-side: search uses `.textSearch('search', query, { type: 'websearch',
config: 'english' })`; tag filter `.contains('tags', [tag])`; derive the tag cloud
from fetched rows. Add-resource form, two modes (tabs from `components/ui/tabs`):
**Link** (url + metadata) inserts a `kind='link'` row; **File** uploads via browser
client (`createClient` from `@/lib/supabase/client`) to
`resources/<user.id>/<crypto.randomUUID()>-<sanitised filename>` then a server
action inserts the `kind='file'` row (storage_path, file_name, mime_type,
size_bytes; 25 MB cap client-checked too). Tags input: comma-separated text →
trimmed lowercase array, dedup. Open a file = server action or route that returns a
60-s signed URL (`supabase.storage.from('resources').createSignedUrl`) and
redirects. Delete (uploader/admin): storage object first, then row; Edit:
title/description/tags/community. Empty state invites the first upload.

## Agent D — Announcements (`/announcements`)

**Files:** `app/(portal)/announcements/page.tsx`, `components/announcements/*`,
`lib/announcements/types.ts` (only if needed), `lib/actions/announcements.ts`.
**Table:** `announcements` (migration 20260827120700).

Feed, pinned first then `published_at` desc: title, author display_name (join
profiles), date, body rendered from markdown — **no new deps**: write a tiny
`renderMarkdownLite` (bold/italic/links/`- ` lists/paragraphs) that ESCAPES HTML
first, in `lib/announcements/markdown.ts`; render via elements, not
`dangerouslySetInnerHTML`. Compose/edit/delete + pin toggle visible to
admin/owner only (`isCurrentUserAdmin()` — RLS backs it). Compose: title +
Textarea + pin checkbox. Non-admin sees the feed only. Empty state differs for
admin (invite to post) vs member ("Nothing yet").

## Agent E — Incidents (`/incidents`)

**Files:** `app/(portal)/incidents/page.tsx`, `app/(portal)/incidents/new/page.tsx`,
`app/(portal)/incidents/[id]/page.tsx`, `components/incidents/*`,
`lib/incidents/types.ts`, `lib/actions/incidents.ts`.
**Tables:** `incident_reports`, `incident_notes` (migration 20260827120800 — READ
ITS HEADER; the access model is subtle and the UI must say it out loud).

`/incidents`: intro card explaining who sees what (leads/owners: everything;
members: own community's; the report form is open to all) + prominent "Report a
concern" Button + the list RLS lets the viewer see (reference, summary, severity
Badge (low=neutral, medium=amber, high/critical=red), category, status Badge,
community, date; filters: status, severity, community). Empty list for a
non-lead member is NORMAL — copy must say reports they submit may not remain
visible to them (scoping), not imply "no incidents exist".

`/incidents/new`: the GDPR-conscious form. Fields in order: community Select —
REQUIRED CHOICE with explicit copy: tagging a community makes the report visible
to that community's team members; "Leads only (no community)" option (NULL) for
concerns about/close to a community's own officers. Then: category, severity,
occurred_at (datetime-local, optional), location, subject initials/first name
(FieldHint: "Initials or first name — only add full identifying detail if the
concern cannot be actioned without it"), subject_contact (optional, same hint
spirit), involves_minor checkbox (when ticked, show an inline note to also follow
the community's own child-safeguarding escalation), summary (required, one line),
detail (Textarea), actions_taken. Submit → server action inserts
(source/reported_by are DB-pinned; still set reported_by = user id explicitly) →
redirect to `/incidents?submitted=<reference>` and show a confirmation banner
quoting the reference ("Save this reference — depending on scoping you may not
see this report in your list"). NO edit after submit.

`/incidents/[id]`: detail for those RLS admits (fetch returns null → gentle
not-available page, `notFound()` is fine). Status control (Select over the status
union + referred_to text when status='referred'; sets resolved_at/resolved_by
when resolving — server action). Append-only notes: list + add-note Textarea.
Copy notes are permanent. A "Log print view" is out of scope v1.

## Agent F — Dashboard feed (`/`)

**Files:** `app/(portal)/page.tsx` (REPLACE the SLAC-copied file — it references
tables that don't exist here), `components/dashboard/*` if needed.

Server page, `Promise.all` over: next 5 `calendar_events` (`gte starts_at now`),
my open `board_tasks` (assignee = me, status != done, order due_on nulls last,
limit 5), latest 3 `announcements` (pinned first), latest 3 `resources`, and —
only when `isCurrentUserLead()` — count + latest 3 of `incident_reports` where
status in (open, investigating). Layout: greeting header ("Welcome back, {name}"
+ "Cross-community safeguarding team"), stat cards row (upcoming events count, my
open tasks count, open incidents count for leads only), then sections Next up /
My tasks / Announcements / New resources, each with an "All →" link and honest
empty states pointing at the module. Every query `.catch`-safe: one failed read
must not blank the page (degrade per-section).

## Agent G — Team + Settings rework

**Files (adapt in place):** `app/(portal)/team/page.tsx`,
`components/team/TeamControls.tsx`, `lib/actions/team.ts`,
`app/(portal)/settings/page.tsx`, `components/settings/SettingsForms.tsx`,
`lib/actions/profile.ts`, `app/auth/accept-invite/page.tsx`,
`app/join/[token]/page.tsx` + `redeem/route.ts` (check compiles; logic likely
fine), plus `components/team/CommunityControls.tsx` (new).

These are SLAC files still speaking SLAC's role model. Rework to: roles
`owner`/`member` (TS union `TeamRole` in `cached-server.ts` — already updated);
flags is_admin, is_safeguarding_lead; member community assignment. Team page
(owner/admin per nav): member list (name, email, community, role Badge, Admin
Badge, Lead Badge (amber), active state) + controls wired to the RPCs —
`admin_set_member_role(target, new_role, new_is_admin)`,
`admin_set_member_active`, `admin_remove_member` (owner-only controls),
`admin_set_member_community(target, community)` and
`admin_set_safeguarding_lead(target, value)` (lead toggle owner-only; community
owner+admin) — plus the invite panel: email, role, is_admin checkbox, community
Select → `inviteMember` action (keep SLAC's admin-client `inviteUserByEmail` +
handoff-link flow, add `community_id` to the invite insert). A "Communities"
section (admin/owner): list + add (name → slug via `lib/utils` slugify — add a
tiny `slugify` there) + rename + deactivate toggle (plain table writes, RLS
covers it). Settings: keep display_name/bio/avatar_url + email/password forms as
donor has them, rebrand copy, show read-only "Your community" + role/flags
(change is admin's job). Check `accept-invite` for role references; fix to new
model.

## Integrator checklist (not the agents)

lint + tsc + full build exit-code-checked; grep sweeps (bare Record index into
JSX, `<a href="/`, `text-[1?px]`, `middleware.ts`); commit; push.
