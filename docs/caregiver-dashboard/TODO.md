# Caregiver dashboard work checklist

SLICE 0 - inventory + harness:
[ ] list the port map (every teammate page/component/service -> target file or "dropped: reason") in PROGRESS.md; extend PGlite fixtures; write CAREGIVER_SCHEMA_PROBE.sql
SLICE 1 - database:
[ ] FILE A (baseline, workspace, links, consent, patient/hospital/doctor-side RPCs) passes test:caregiver-sql (incl. the pre-existing-shape and decoy-function scenarios)
[ ] FILE B (data RPCs + demo seeder) passes
[ ] FILE C (fan-out triggers) passes; commit
SLICE 2 - core UI:
[ ] lib/caregiver/* + provider + layout/shell + nav + roleConfig + loading/error files
[ ] Dashboard, My Patients (+ Link a patient), Patient overview/tabs, Settings (+ sample data); i18n; commit
SLICE 3 - patient data tabs:
[ ] medications, appointments, queue, reports, investigations, timeline, tasks, instructions, care-notes, messages; i18n; commit
SLICE 4 - integrations + finish:
[ ] patient My Caregivers page + nav; hospital patient-record Caregivers panel; doctor instruction dialog (if doctor module exists); admin Caregivers verification; notifications page checks
[ ] verify-caregiver-rls.ts, i18n parity, APPLY_CAREGIVER_PENDING.sql, docs
[ ] CLEANUP (Section 9): delete caregiver/ folder; tsc + build after deletion; npm run lint; npm run test:caregiver-sql; npm run test:sql; commit

NEXT = finalize caregiver route + dashboard role wiring
