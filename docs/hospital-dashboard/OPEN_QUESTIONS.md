# Open Questions / Blockers

## Prerequisite check failed

The project does not currently satisfy the required security gate in the client requirements.

1. The sidebar is role-derived in `lib/dashboard-nav.ts` and passes that part of the check.
2. The auth trigger `public.handle_new_user` in `supabase/migrations/20260916000000_fix_role_assignment_and_hospital_access.sql` does not whitelist self-serve roles before assigning the default role. It accepts any role value in `raw_user_meta_data->>'role'` and falls back to `patient` when the role is missing or unknown.
3. The RBAC schema in `supabase/migrations/20260709024556_create_auth_rbac_schema.sql` explicitly allows authenticated clients to insert into `public.user_roles` via the policy `insert_own_user_role`.

This violates the requirement that:
- the `handle_new_user` trigger must whitelist self-serve roles;
- clients must not be able to insert into `user_roles` directly.

Until these are corrected, the hospital dashboard foundation cannot be considered secure enough to proceed with the remaining phases.
