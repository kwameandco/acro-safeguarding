# GDPR posture — incident reporting and personal data

This portal records information about identifiable people, some of it special-category
(safeguarding concerns, potentially involving minors). This file is the working record
of how the design holds that responsibly, and what remains for the team to decide.
It is an engineering document, not legal advice — **the team should run a DPIA before
the incident log goes into real use**, and this file gives it a head start.

## Data inventory

| Store | Personal data | Access | Deletable in-app? |
| --- | --- | --- | --- |
| `profiles` | Team members: email, name, avatar, bio, community | All active members (read); self + RPCs (write) | Via owner `admin_remove_member` (auth cascade) |
| `team_invites` | Invitee email, intended role | Owners/admins | Yes (revoke/delete) |
| `invite_link_handoffs` | Invitee email + live auth link | Service role only | Expires; rows purgeable |
| `board_tasks`, `calendar_events`, `resources`, `announcements` | Author/assignee references; free text — **team content, keep third-party personal detail out** | All active members | Yes (per RLS) |
| `incident_reports` | Reporter id (team reports), subject name/contact, free-text detail; `involves_minor` flag | **Leads + owners: all. Members: own community's only. NULL community: leads/owners only.** | **No — deliberately** |
| `incident_notes` | Author id, free-text case notes | Same visibility as parent incident | **No, and not editable — append-only** |

## Design commitments (enforced in the database, not just the UI)

1. **Least access by default.** Every table: `REVOKE ALL` then explicit grants; `anon`
   has no access to anything. Incident visibility is a SECURITY DEFINER predicate
   (`can_work_incident`) — leads/owners globally, members within their own community,
   which only an admin RPC can change.
2. **Data minimisation at the point of entry.** The report form asks for the minimum
   (initials/first name + context rather than full identifying detail unless genuinely
   needed) and says so in its guidance copy. The columns are the maximum, not the
   target.
3. **Integrity over convenience.** Incident records and notes cannot be edited into a
   different history (notes append-only) or deleted from the app. Deletion pressure —
   "can you just remove that report?" — meets a process, not a button.
4. **Purpose separation for the future anonymous form.** `source='public'`,
   `reported_by NULL`, arriving only via a dedicated rate-limited RPC in a later
   migration; the team INSERT path structurally cannot impersonate it (policy pins
   `source='team'` and `reported_by = auth.uid()`).
5. **UK/EEA residency.** Project region eu-west-2 (`docs/SUPABASE_SETUP.md` §1).

## Rights handling (manual processes, for the DPIA to ratify)

- **Access/export (Art. 15/20):** a lead/owner exports the relevant rows via SQL on
  request. No self-service export in v1 — the requester population is small and known.
- **Erasure (Art. 17):** safeguarding records typically fall under the Art. 17(3)
  exemptions (legal claims, substantial public interest), and UK safeguarding guidance
  expects long retention (IICSA recommended decades for records concerning children).
  Erasure requests therefore go to the safeguarding lead for a documented decision —
  redaction of excess detail is the usual remedy, wholesale deletion the exception.
  Neither is an app feature by design.
- **Rectification (Art. 16):** factual corrections land as a new `incident_notes`
  entry ("correction: …"), preserving the trail.
- **Team-member offboarding:** deactivate (keeps authorship of the trail) rather than
  remove; `admin_remove_member` nulls their references via `ON DELETE SET NULL` where
  history must survive.

## Open items for the team (pre-launch checklist)

- [ ] Run the DPIA; name the controller (which legal entity?) and lawful bases
      (likely Art. 6(1)(f)/9(2)(b)-(g) mix — needs the DPIA's judgement).
- [ ] Set a retention/review schedule for closed incidents (suggested: annual review
      by leads; nothing auto-deletes).
- [ ] Privacy notice for team members, and — before the public form launches — a
      public-facing notice covering anonymous reports.
- [ ] Decide whether incident access should be audit-logged (reads via RPC) — v2
      candidate, schema supports adding it without remodelling.
