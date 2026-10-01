# Hospital Dashboard Progress

## Status

Prerequisite security checks are fixed and the Phase 1 hospital dashboard foundation is in place.

## Completed

- Reviewed the client requirement document in the repo root: `hospital-dashboard-requirements.md`.
- Fixed the RBAC prerequisite issue in `supabase/migrations/20260930000000_fix_signup_role_assignment.sql`.
- Removed client-side signup role assignment and direct `user_roles` writes in `lib/auth-context.tsx`.
- Added the Phase 1 hospital schema and demo seed in `supabase/migrations/20261001000000_create_hospital_dashboard_schema.sql` and `supabase/seed/hospital_demo.sql`.
- Added the hospital org hook, validation layer, and typed models in `lib/hospital/useHospitalOrg.ts`, `lib/validation/hospital.ts`, and `types/hospital.ts`.
- Updated the hospital dashboard entry screen in `app/dashboard/hospital/page.tsx` and the role-based nav in `lib/dashboard-nav.ts`.
- Synced hospital locale strings in `messages/en.json` and `messages/hi.json`.

## Prerequisite check result

- Sidebar role derivation: PASS
  - The dashboard navigation is role-derived in `lib/dashboard-nav.ts` via `getNavItemsForRole` and `getDashboardTitleForRole`.
- `handle_new_user` self-serve role whitelist: PASS
  - The hardened SQL migration restricts signup to an allowlist and defaults non-approved roles to `patient`.
- Client insert into `user_roles`: PASS
  - The move to Auth metadata-only signup prevents direct client inserts and keeps all role writes in SQL.

## Verification

- `npx tsc --noEmit` completed without TypeScript errors.
- `npm run lint` completed successfully with warnings only; no lint errors were reported.

## Phase 1 status

- Phase 1: hospital schema, onboarding, role-based nav, seed data, and hospital context hooks are implemented.
- Phase 2+: search, patient record, queue, investigations, command center, admissions, patient portal, verification, and hardening remain to be built.

## Manual follow-up required from the user

- Apply the SQL migration to Supabase using `supabase db push` or by pasting the migration SQL into the Supabase SQL editor.
- Continue with the next phase of the hospital dashboard build from the requirement document as the source of truth.
