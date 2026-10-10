# Hospital dashboard notes

This folder holds the binding dashboard specification, the generated requirement notes, and the remaining implementation notes for the hospital workflows.

## Files
- SPEC_FULL.md: binding rules and acceptance criteria.
- requirements.md: customer requirements converted from the source document.
- TODO.md: status checklist.
- OPEN_QUESTIONS.md: logged conflicts or clarifications.

## Database bundle
- supabase/APPLY_HOSPITAL_PENDING.sql is the generated hospital pending migration bundle.

## Cross-dashboard patient accounts and care
- Registering one patient in the hospital dashboard requires an email address. The hospital creates a unique hospital patient identifier, a patient login linked to that hospital record, and emails the identifier and temporary password to the supplied address.
- CSV patient imports must include `identifier`, `name`, and `email`; each new row receives a linked patient account and its own onboarding email. Existing OncoCare email accounts are not reset or silently linked.
- For an existing OncoCare account, authorized hospital staff can issue a single-use, seven-day patient link code after verifying the patient's identity. The patient claims it from **My Hospital**; entering a patient ID alone never links or reveals a record.
- Hospital administrators can assign each patient to an active, verified hospital doctor. The assignment appears on that doctor's hospital dashboard and on the linked patient's care-team panel.
- Doctors create hospital appointments only for patients assigned to them. Booking validates the verified hospital and doctor, the hospital-local working shift, hospital holidays, department status, leave, and overlapping appointments. Hospital staff can check in or cancel bookings but cannot create them.
- Hospital appointments are exposed to the assigned doctor's dashboard and to the linked patient's dashboard through permission-checked RPCs. Appointment changes create patient notifications; hospital prescription items continue syncing into the linked patient's medication list.
- Apply the hospital migrations in filename order after the earlier hospital and clinical-source migrations, or use the generated combined file `supabase/APPLY_HOSPITAL_PENDING.sql`. The latest cross-dashboard changes are in `20261009000000_cross_dashboard_hospital_care.sql` and `20261010000000_hospital_patient_assignments_and_doctor_appointments.sql`. Configure `RESEND_API_KEY`, `ONCOCARE_EMAIL_FROM`, and `NEXT_PUBLIC_APP_URL` before provisioning patient accounts.
- `npm run test:sql` exercises hospital assignment, verified-doctor booking and schedule constraints, one-time patient linking, doctor/patient isolation, appointment visibility, patient notifications, prescription-to-medication updates, pending-hospital capability gating, and generated patient identifiers using synthetic accounts.

## Server environment for doctor account actions
- Creating, activating, or resetting hospital doctor accounts uses the server-only Supabase admin client. The runtime serving the API must define `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- For local development, define both in the repository-root `.env.local` and restart `npm run dev` after changing them. For deployments, add them as server-side environment variables in the hosting provider and redeploy; `.env.local` is not deployed.
- For Vercel, add both variables under the project's Environment Variables settings, select the environments where the app is deployed (Production and Preview as applicable), then create a new deployment.
- Never use a `NEXT_PUBLIC_` prefix for the service-role key or expose it in browser code. If the dashboard reports a missing variable, check the environment of the server that is actually serving the page rather than only checking the local file.
