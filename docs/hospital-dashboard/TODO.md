# Hospital Dashboard Build Checklist

## Slice 0: SQL Harness
- [x] S0 Harness: PGlite harness + stubs running the existing hospital migrations green.

## Slice 1: Visible Core (Schema + OPD)
- [x] FILE A migration (all tables, RLS, indexes, realtime, defaults, helpers, bucket) passes harness
- [x] FILE B migration (OPD RPCs, command center v1, demo part 1) passes harness
- [x] ui-kit, status map, api.ts, useLive.ts, format.ts, types, zod
- [x] HospitalShell (search bar, live indicator, sample banner) + HospitalSearch
- [x] Command Center v1 (hero + KPIs + queues + action required + charts)
- [x] Patients list + register + CSV import + patient record page
- [x] OPD overview + board + check-in dialog
- [x] Appointments (list + week view + booking)
- [x] Doctors & Departments (+ sessions)
- [x] Settings (all tabs incl. sample data + staff)
- [x] delete HospitalSectionPage + placeholder i18n keys; en+hi strings; tsc; commit "hospital: schema + OPD core"

## Slice 2: Clinical
- [ ] FILE C migration passes harness; ConsultDrawer; wire into board + patient record; prescription PDF; commit

## Slice 3: Investigations + Admissions
- [ ] FILE D migration passes harness; Investigations (4 tabs + order detail + InvestigationOrderPanel); Admissions page; Command Center v2 (full); commit

## Slice 4: Platform + Patient + Finish
- [ ] admin Hospitals panel; patient-side /dashboard/my-hospital + nav; cron route; dispatch.ts; verify-hospital-rls.ts; simulate-opd.ts; i18n parity; APPLY_ALL_HOSPITAL.sql; docs; error.tsx/loading.tsx on every route; a11y pass (keyboard, focus, 360px); grep proves "not available yet" and placeholder text are gone; npm run lint; npm run build; npm run test:sql; commit
