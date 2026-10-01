# Hospital Dashboard Progress

## Status

Prerequisite verification is blocked by a security issue in the existing RBAC foundation.

## Completed

- Reviewed the client requirement document in the repo root: `hospital-dashboard-requirements.md`.
- Reviewed the existing code touched by the plan:
  - `app/dashboard/hospital/page.tsx`
  - `components/auth/dashboard-layout.tsx`
  - `lib/dashboard-nav.ts`
  - `lib/auth-context.tsx`
  - `supabase/migrations/`
  - `messages/en.json`
  - `messages/hi.json`

## Prerequisite check result

- Sidebar role derivation: PASS
  - The dashboard navigation is role-derived in `lib/dashboard-nav.ts` via `getNavItemsForRole` and `getDashboardTitleForRole`.
- `handle_new_user` self-serve role whitelist: FAIL
  - `supabase/migrations/20260916000000_fix_role_assignment_and_hospital_access.sql` assigns a role directly from `raw_user_meta_data` without a whitelist.
- Client insert into `user_roles`: FAIL
  - `supabase/migrations/20260709024556_create_auth_rbac_schema.sql` creates policy `insert_own_user_role`, allowing authenticated users to insert into `user_roles` directly.

## Required manual fix before work can continue

1. Restrict `public.handle_new_user` to a safe allowlist of self-serve roles.
2. Remove or replace the `insert_own_user_role` policy so clients cannot insert into `user_roles` directly.
3. Re-run the RBAC verification and then continue with Phase 1.

## What remains after the blocker is fixed

- Phase 1: hospital schema, RBAC, onboarding, hospital nav updates, seed data.
- Phase 2+: search, patient record, queue, investigations, command center, admissions, patient portal, verification, and hardening.

## Manual steps required from the user

- Review and approve the RBAC/security fix before any hospital dashboard implementation begins.
- Provide the final authorized self-serve role list for hospital signup if different from the default-safe allowlist.
