# Hospital Dashboard Progress

This log tracks the user's current Hospital Dashboard build checklist. The prior Step 1 gate is superseded.

## Executed

- Added the PGlite harness and `npm run test:sql`.
- Applied migrations from `20260930000000` onward in PGlite after three initial full-chain attempts stopped at the legacy auth/RBAC migration; fallback fixtures cover the skipped legacy base tables.
- Added FILE A hospital operations schema and FILE B OPD RPCs/demo seed migrations.
- Added cross-dashboard patient onboarding, appointment visibility, medication synchronization, role-aware navigation, treating-doctor assignment, doctor-controlled hospital appointments, and one-time account linking.
- `npm run test:sql` passed migration application and synthetic assertions for queue order/token allocation, tenant isolation, doctor/patient isolation, audited doctor assignment, doctor-only appointment booking, shift/holiday/department/leave/overlap enforcement, patient link-code single use, notifications, prescription-to-medication updates, and pending-hospital operational gating.
- `npm run test:doctor-sql`, `npm run test:navigation`, `npm run check:sql`, `npm run check:i18n`, `npm run typecheck`, `npm run lint`, and the production build passed. Lint reports pre-existing warnings in unrelated files.

## Not yet verified in a live environment

- Apply the current generated hospital migration bundle to the intended Supabase project and verify the cross-dashboard workflow there.
- Complete browser QA with real role-specific accounts, mobile viewport checks, and a full review of approval, holiday/department availability, and exception-rescheduling procedures with hospital staff.
- Confirm the official AIMS/NCI patient-ID mapping and institutional identity-verification policy before production onboarding.
