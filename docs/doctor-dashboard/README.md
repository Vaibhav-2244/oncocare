# Doctor dashboard

The doctor portal uses Supabase RPCs and doctor-owned tables. The browser never
stores clinical records in localStorage. A doctor can create roster records,
appointments, consultations, prescriptions, reports, and one-time patient link
codes. Patient-owned live data must only be added after a patient redeems a code
and grants consent scopes.

## Applying migrations

Apply the files in timestamp order:

1. `20261003000000_create_doctor_workspace_roster.sql`
2. `20261003010000_doctor_clinical_records.sql`
3. `20261003020000_doctor_links_prescriptions_reports.sql`

`supabase/APPLY_DOCTOR_PENDING.sql` is the generated combined file. It is
regenerated with `npm run build:doctor-sql`; it is not applied by the app.

## Verification and production checklist

- Assign the `doctor` role through the existing RBAC flow.
- Verify registration details through the admin workflow before enabling patient
  links. Link-code creation is deliberately restricted to verified doctors in
  the consent migration when the full verification policy is deployed.
- Keep Supabase email confirmation enabled and configure the production Site URL
  and redirect URLs.
- Enable Realtime only for tables that need live updates and review all RLS
  policies before production.
- Keep the `lab-reports` bucket private and issue short-lived signed URLs only
  after the doctor-patient consent check.

The current UI supports the workspace, roster, patient detail, scheduling,
consultations, prescriptions with PDF printing, reports, treatment-plan listing,
profile, availability, consent-code creation, patient redemption, and admin
doctor verification. Hospital affiliation and live clinical-data scope RPCs
remain separate migration work.
