# Hospital Dashboard Progress

## Status

Step 1 foundation changes are implemented locally. The hosted Supabase migration and tenant-isolation script still need execution before Step 1 can be marked passed.

## Completed

- Reviewed the client requirement document in the repo root: `hospital-dashboard-requirements.md`.
- Fixed the RBAC prerequisite issue in `supabase/migrations/20260930000000_fix_signup_role_assignment.sql`.
- Removed client-side signup role assignment and direct `user_roles` writes in `lib/auth-context.tsx`.
- Added the hardened, idempotent foundation migration in `supabase/migrations/20261001100000_hospital_foundation_fix.sql`.
- Added the shared membership-backed context, capability mirror, and error formatter in `lib/hospital/HospitalProvider.tsx`, `lib/hospital/permissions.ts`, and `lib/errors.ts`.
- Added the hospital layout, workspace status shell, database-backed command-center foundation, and dedicated route/loading modules.
- Replaced the broken demo SQL seed with the scoped `load_demo_data` and `remove_demo_data` RPCs.
- Restored the documents page's earlier presentation; its only intended behavior change is the `ALL_ROLES` access gate.
- Synced hospital locale strings in `messages/en.json` and `messages/hi.json`.

## Foundation security changes

- Replaced recursive membership policies with `SECURITY DEFINER` helper checks and role/capability RLS.
- Removed direct organization, member, invite, patient, link-code, and audit client write policies.
- Added role-checked `ensure_hospital_workspace`, member invitation and management RPCs, patient registration, verification, demo-data, and OAuth role RPCs.
- Added append-only patient journey events and normalized identifiers.
- Corrected the OAuth callback ordering so role refresh completes before dashboard redirection.
- The foundation migration explicitly drops an existing `set_initial_signup_role(text)` signature before recreating it, because PostgreSQL cannot change a function return type with `CREATE OR REPLACE`.
- Added separate hospital routes, widened notifications/documents access, and preserved the hospital sidebar on those shared pages.

## Verification

- `npx tsc --noEmit` passes.
- `npm run lint` passes with warnings only; all warnings are in unrelated existing files.
- Static migration checks pass for idempotent policy replacement, fixed function search paths, explicit function revokes/grants, balanced function bodies, and the final PostgREST reload.
- English/Hindi hospital locale key parity passes (150 keys).
- `scripts/verify-foundation.ts` has not run against Supabase. It must run after the migration is applied.
- Local SQL execution is unavailable in this environment (Supabase CLI/psql are absent and Docker daemon is not running).

## Step 1 status

- Step 1 is not yet marked passed: apply the migration and obtain database-level evidence before beginning Steps 2–9.
- Workspace isolation, anonymous RPC denial, owner-field protection, invite acceptance, and demo cleanup remain unverified against a live Supabase database.

## Later steps

- Steps 2–9: patient search/record, OPD and queues, consultations, investigations, command center, admissions/settings, patient-facing link flow, and admin verification UI remain out of scope until Step 1 passes.

## Manual follow-up required from the user

- Apply `supabase/migrations/20261001100000_hospital_foundation_fix.sql` after the existing migrations using `supabase db push` or the SQL editor, then run `npx tsx scripts/verify-foundation.ts` with the required environment variables.
- No conflicts with the client requirement document have been identified; it remains the source of truth for later steps.
