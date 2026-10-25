# Admin workspace

The platform admin experience is served from `/dashboard/admin` and uses the
existing OncoCare authentication provider, role guard, and Supabase project.
Its visual shell is adapted from the LME Control Centre UI in the
`niti-lme-super-admin` branch; it does not run that branch's separate Next.js
application. Its connected capabilities are:

- Protected platform metrics and a paginated/searchable account directory.
- Paginated, searchable directories for the supported OncoCare account roles.
- Super-admin-only assignment and removal of non-super-admin roles. The
  signed-in super-admin cannot change their own roles or assign the
  `super_admin` role.
- A pending verification queue for doctors, hospitals, and pharmacies.
  Doctor requests may be approved or rejected; the existing organization
  schema supports verification approval but does not define a rejected state
  for hospitals or pharmacies.
- A paginated audit log for changes made through the admin workspace.
- Links to the existing pharmacy administration, partner portal, medicine
  finder, and doctor-verification pages.
- The teammate UI's feature switches remain clearly labeled local previews;
  they do not change production feature flags.

## Database deployment

Apply both
[`20261019000000_admin_workspace_functions.sql`](../supabase/migrations/20261019000000_admin_workspace_functions.sql)
and
[`20261025000000_admin_role_directory.sql`](../supabase/migrations/20261025000000_admin_role_directory.sql)
to the same Supabase project used by the app **before deploying the UI**. The
migrations add admin-checked reporting/search/queue RPCs, a role-filtered
directory, super-admin-only role management, and an append-only-by-application
audit log. They rely on the existing `profiles`, `roles`, `user_roles`,
`doctor_profiles`, `hospital_orgs`, and `pharmacy_orgs` tables and the
existing audited organization verification functions.

Do not place the Supabase service-role key in browser variables. The workspace
uses the signed-in user's Supabase session and database functions enforce
authorization independently of the client-side route guard.

Feature flags, incident management, account deletion, and service-health
checks beyond successful admin-data access require separate data models and
audited backend workflows. The dashboard preserves those design sections but
does not present placeholder controls as live functionality.

## Checks

Run `npm run test:admin-sql`, `npm run test:navigation`,
`npm run check:i18n`, `npm run typecheck`, and `npm run build` after changes.
