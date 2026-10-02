# Hospital Dashboard Progress

This log tracks the user's current Hospital Dashboard build checklist. The prior Step 1 gate is superseded.

## Executed

- Added the PGlite harness and `npm run test:sql`.
- Applied migrations from `20260930000000` onward in PGlite after three initial full-chain attempts stopped at the legacy auth/RBAC migration; fallback fixtures cover the skipped legacy base tables.
- Added FILE A hospital operations schema and FILE B OPD RPCs/demo seed migrations.
- `npm run test:sql` passed migration application plus smoke assertions for 80 demo patients, serving token 102 with 21 waiting, cross-tenant patient isolation, and anonymous queue RPC denial.

## Not yet implemented

- Client requirements source file `hospital-dashboard-requirements.md` is not present in the workspace; its contents could not be consulted. See `OPEN_QUESTIONS.md`.
- Remaining FILE B assertions/features, frontend Slice 1, FILE C, FILE D, patient/admin integrations, scripts, documentation, final lint/build, and commits remain pending.

## Slice 1 implementation

- Added operational patient directory/record, OPD sessions and queue board, appointment list/week view, doctor/department management, hospital settings, investigation overview, admissions overview, shared UI kit, search, live refresh, and localized status labels.
- Removed `HospitalSectionPage` and its placeholder translation string.
- `npx tsc --noEmit`: passed after the Slice 1 implementation.
- `npm run test:sql`: applied the fallback migration set and passed the harness smoke assertions for 80 demo patients, the token-102/21-waiting demo queue, 30 sequential queue tokens, emergency priority, wait-range ordering, requeue token preservation, duplicate queue protection, tenant separation, front-desk clinical restrictions, direct-write denial, and anonymous RPC denial.
