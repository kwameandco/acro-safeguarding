# Acro Safeguarding Hub

Private portal for the cross-community acro safeguarding team: shared task board,
calendar, resource library, announcements and dashboard feed, plus a GDPR-safe
safeguarding incident log with community-scoped access (and a schema ready for a
future public anonymous reporting form).

Next.js 16 · TypeScript · Tailwind v4 · Supabase (Postgres + Auth + Storage, RLS as
the authorisation model). Invite-only — there is no public signup.

**Status:** app scaffold complete; the Supabase project does not exist yet. The app
fails closed to a config-error page until it does. Bring-up runbook:
[`docs/SUPABASE_SETUP.md`](docs/SUPABASE_SETUP.md).

- Working agreements + orientation: [`CLAUDE.md`](CLAUDE.md)
- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- GDPR posture (read before using the incident log in anger):
  [`docs/GDPR.md`](docs/GDPR.md)

## Local dev

```bash
npm install
npm run dev
```

Without `.env.local` you'll land on `/auth/error?reason=config` — expected until the
database exists. Gates before pushing: `npm run lint` and `npm run build`.
