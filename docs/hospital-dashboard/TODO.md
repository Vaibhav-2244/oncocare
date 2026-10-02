# Hospital Dashboard Build Checklist

## Completed and validated
- [x] Requirements conversion from the source Word document and repo audit completed.
- [x] Initial hospital WIP commit recorded: `wip: hospital dashboard progress`.
- [x] PGlite SQL harness is in place and the hospital migration stack passes in a fresh database.
- [x] Hospital schema migration 20261002100000 and OPD migration 20261002110000 are present and pass the harness.
- [x] Pending hospital bundle generation is implemented via `build:hospital-sql` and `supabase/APPLY_HOSPITAL_PENDING.sql`.
- [x] Clinical and investigations/admissions migration files were created to complete the hospital pending set.
- [x] Notification, cron, and verification scripts exist in the repo.
- [x] The generated hospital bundle and harness were executed in the current repo context.

## In progress / deferred
- [ ] Complete live deployment verification against Supabase after applying the generated SQL in the target project.
- [ ] Final browser-level QA across every route with the actual project environment.

## Final gates run from this workspace
- [x] `npx tsc --noEmit`
- [x] `npm run lint` (passes; unrelated repository warnings remain)
- [x] `npm run build`
- [x] `npm run test:sql`
- [x] `npm run check:i18n`
- [ ] Final repository commit after user review
