# Supabase schema reference

## Source of truth

`migrations/` is the authoritative, ordered database history. Read migrations in
filename order to understand the current schema, RPCs, grants, triggers, and
RLS policies. Do not delete, squash, rename, or edit an already-applied
migration: deployed databases rely on migration history. Make database changes
with a new, timestamped migration and test the upgrade path.

This file is a navigation map, not a replacement schema dump. Search the
migrations for exact column definitions and authorization behavior; do not
infer permissions from table names or this summary.

## Domain map

- **Identity and shared patient data:** `20260709024556`,
  `20260709024756`, `20260711081842`, and subsequent `202609*` migrations
  define roles, profiles, notifications, messages, care teams, patient health
  records, reports, and their access rules.
- **Hospital workspace and clinical operations:** `20261001000000`,
  `20261001100000`, and `20261002*` establish hospital tenants, memberships,
  patient records, appointments, OPD sessions and queues, consultations,
  investigations, admissions, and beds. Later `20261004*` through `20261013*`
  migrations extend authorization, doctor affiliation, assignment, and
  cross-dashboard workflows.
- **Doctor workspace:** `20261003*` defines doctor profiles, roster, clinical
  records, patient consent/linking, metrics, and audited workflow RPCs.
  `20261013000000*` and `20261013010000*` refine hospital affiliation and
  doctor-scoped OPD queue access.
- **Pharmacy workspace:** `20261001110000*` through `20261001130000*` define
  pharmacy tenants, catalogue/inventory, customers, and prescriptions. The
  pharmacy UI and live database verification are still in progress; its
  standalone prototype is not production code.
- **Other patient and support features:** the migrations for AI, insurance,
  donations, caregiver support, diet plans, medicine access, and notifications
  are independently timestamped in the same history. Their exact dependencies
  and policy changes remain in their migration files.

## Generated SQL bundles

These are generated deployment conveniences, not independent schema sources.
Regenerate them with the corresponding npm script; do not hand-edit or apply
overlapping bundles together:

- `APPLY_HOSPITAL_PENDING.sql` — migrations at or after `20261002100000`,
  including later doctor and pharmacy changes. Generate with
  `npm run build:hospital-sql`.
- `APPLY_DOCTOR_PENDING.sql` — doctor workspace and doctor OPD migrations.
  Generate with `npm run build:doctor-sql`.
- `pharmacy_apply_all.sql` — pharmacy migrations only. Generate with
  `npm run build:sql`.

The hospital test harness rebuilds and applies its bundle. The doctor harness
rebuilds and executes the doctor bundle. Use the normal Supabase migration
workflow for deployed environments whenever possible.

## Test data and validation

`seed_testhospital_dashboard.sql` creates explicitly synthetic hospital
fixtures; it is not run automatically and must only be used in a controlled
development/test database. Never use these fixtures as real patient records.

Useful local checks:

- `npm run test:sql` — hospital SQL, access-control, and workflow regression
  tests.
- `npm run test:doctor-sql` — doctor RPC and workflow regression tests.
- `npm run verify:doctor-rls` — static doctor migration access checks.
- `npm run check:sql` — SQL syntax checks for supported migration files.

Migration changes that touch another dashboard's data must preserve tenant
scoping, role checks, consent requirements, and audit behavior, and add a
regression assertion to the relevant SQL test harness.
