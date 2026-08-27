-- Bootstrap the migration registry.
--
-- The safeguarding-hub project will be brand new with no CLI migration ever
-- applied, so `supabase_migrations.schema_migrations` will not exist. Every
-- migration file here ends with a self-register INSERT into it, which errors
-- without this. Shape matches AcroPassport's and SLAC's, which is Supabase's
-- own.
--
-- STATUS: PENDING APPLY — no Supabase project exists yet (2026-08-27). Apply
-- first, in filename order, once the project is created; see
-- docs/SUPABASE_SETUP.md.

BEGIN;

CREATE SCHEMA IF NOT EXISTS supabase_migrations;

CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version         text PRIMARY KEY,
  statements      text[],
  name            text,
  created_by      text,
  idempotency_key text,
  rollback        text[]
);

COMMIT;
