# Doctor dashboard implementation

## Slice 1 - workspace and roster

- [x] Extend the PGlite fixtures and add the workspace/roster migration with SQL tests.
- [x] Add the doctor data library, layout shell, navigation, and doctor notification access.
- [x] Replace the legacy doctor page with dashboard, patients, patient detail, profile, availability, and settings screens.
- [x] Add English/Hindi doctor-specific translation keys.

## Slice 2 - clinical records

- [x] Add the clinical-records migration and SQL assertions.
- [x] Add appointments, consultations, prescriptions, treatment-plan listing, and reports.
- [x] Add printable PDF generation.
- [x] Add immutable prescription amendment versions and audit RPCs.
- [ ] Commit the slice.

## Slice 3 - links and live data

- [x] Add consent-first doctor/patient links and the patient doctor-link flow.
- [x] Add consent-scoped live data, doctor messaging, and notification delivery.
- [x] Add consent-aware patient appointment/message RPCs for the existing patient surfaces.
- [x] Add SQL assertions.

## Slice 4 - hospital and finish

- [x] Add hospital affiliation acceptance and doctor OPD access through the existing hospital shell.
- [x] Add admin doctor verification.
- [x] Add a doctor RLS/consent migration verification script.
- [x] Add live-data simulation script.
- [x] Regenerate the combined doctor SQL output and update implementation documentation.
- [ ] Wire the patient UI controls to the new patient RPCs and add a consultation drawer.
- [x] Run build and doctor SQL tests.

## Current position

The workspace, roster, clinical records, consent links, live-data RPCs, doctor messaging,
patient redemption, admin verification, PDF printing, and validation scripts are implemented.
The remaining UI work is wiring the patient appointment/message components to the new RPCs and adding the OPD consultation drawer.
