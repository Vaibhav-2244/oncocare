# Admin workspace

The platform admin experience is served from `/dashboard/admin` and uses the
existing OncoCare authentication provider, role guard, dashboard shell, and
Supabase project. Its current capabilities are:

- Protected platform metrics and a paginated/searchable account directory.
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

## Database deployment

Apply
[`20261019000000_admin_workspace_functions.sql`](../supabase/migrations/20261019000000_admin_workspace_functions.sql)
to the same Supabase project used by the app **before deploying the UI**. It
adds admin-checked reporting/search/queue RPCs, super-admin-only role
management, and an append-only-by-application audit log. It relies on the
existing `profiles`, `roles`, `user_roles`, `doctor_profiles`,
`hospital_orgs`, and `pharmacy_orgs` tables and the existing audited
organization verification functions.

Do not place the Supabase service-role key in browser variables. The workspace
uses the signed-in user's Supabase session and database functions enforce
authorization independently of the client-side route guard.

The UI intentionally does not expose feature flags, incident management,
service health claims beyond successful admin-data access, account deletion,
or unsupported organization rejection. Those require separate data models and
audited backend workflows; a placeholder visual is not a completed control.

## Checks

Run `npm run test:admin-sql`, `npm run test:navigation`,
`npm run check:i18n`, `npm run typecheck`, and `npm run build` after changes.
