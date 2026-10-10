# Doctor dashboard

The doctor portal is part of the main Next.js application and uses its Supabase
session, role checks, RPCs, and doctor-owned tables. The browser never stores
clinical records in localStorage. Roster search, patient updates/archive,
appointments, consultations, prescriptions, reports, treatment plans, profile,
availability, and one-time patient link codes use the existing authenticated
backend. Patient-owned live data is fetched only through the consent-checking
RPC after the patient account has linked and granted scopes.

## Applying migrations

Apply migrations through the project's normal Supabase migration deployment.
If applying SQL bundles manually, choose the bundle for the deployment rather
than applying overlapping bundles twice. The doctor-specific migration files
are:

1. `20261003000000_create_doctor_workspace_roster.sql`
2. `20261003010000_doctor_clinical_records.sql`
3. `20261003020000_doctor_links_prescriptions_reports.sql`
4. `20261003030000_doctor_live_data_messaging.sql`
5. `20261003040000_doctor_hospital_affiliation.sql`
6. `20261003050000_patient_doctor_link_surfaces.sql`
7. `20261003060000_doctor_prescription_versions_audit.sql`
8. `20261003100000_doctor_dashboard_metrics.sql`
9. `20261003110000_doctor_workflow_actions.sql`

`supabase/APPLY_DOCTOR_PENDING.sql` is the generated combined file. It is
regenerated with `npm run build:doctor-sql`; it is not applied by the app.
`supabase/APPLY_HOSPITAL_PENDING.sql` is a broader bundle that also includes
these timestamped doctor migrations. Use the hospital bundle for a deployment
that needs the combined hospital and doctor changes, or the doctor bundle when
deploying only the doctor workspace; do not apply both bundles in full.

## Verification and production checklist

- Assign the `doctor` role through the existing RBAC flow.
- Verify registration details through the admin workflow before enabling patient
  links. Link-code creation is restricted to verified doctors.
- Keep Supabase email confirmation enabled and configure the production Site URL
  and redirect URLs.
- Enable Realtime only for tables that need live updates and review all RLS
  policies before production.
- Keep the `lab-reports` bucket private and issue short-lived signed URLs only
  after the doctor-patient consent check.
- Run `npm run test:doctor-sql`, `npm run verify:doctor-rls`,
  `npm run test:navigation`, `npm run typecheck`, `npm run lint`, and
  `npm run build` before deployment.
- Provision doctors through the hospital onboarding/auth workflow; do not
  fabricate or insert Supabase Auth users with SQL. The requested
  `testdoctor123@gmail.com` workspace was not seeded because this checkout has
  no configured local Supabase project or authorized development database.
  Provision that identity in a non-production environment first, then seed
  synthetic, explicitly labeled records there.

The dashboard uses production Next.js routes rather than the extracted Vite
prototype. Its demo login, browser-local clinical store, and destructive
workspace reset/import controls are intentionally not used. Hospital-linked
assignments continue to use the hospital membership, care-team, assignment,
and appointment workflows; patient account data remains consent-scoped.
