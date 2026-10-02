# Hospital Dashboard Binding Spec

This document captures the binding requirements for the remaining hospital dashboard work. The repository and the client text win on conflicts; any conflicts are noted in OPEN_QUESTIONS.md.

## 1. Scope

Build the OncoCare+ Hospital Dashboard in the existing Next.js 13.5 app. Preserve and reuse the existing HospitalProvider, HospitalShell, role-based sidebar, and JSON-backed hospital API patterns. Do not redesign the platform; continue the work already started.

## 2. Non-negotiable rules

- Do not touch the pharmacy dashboard except shared files explicitly called out.
- Do not leave any placeholder screen or string like “not available yet”, “HospitalSectionPage”, or “hospitalSectionPreparing”.
- All real business writes must happen via SECURITY DEFINER RPCs; no direct client INSERT/UPDATE/DELETE on transactional tables.
- Every table must include hospital_id and tenant isolation checks.
- All new SQL must use SET search_path = public; revoke EXECUTE from PUBLIC and anon; grant to authenticated where appropriate.
- Time is stored as timestamptz; working-day logic uses hospital_orgs.timezone and hospital_today(hid).
- All visible text must exist in both messages/en.json and messages/hi.json under the hospitalOps namespace.
- Every route folder keeps loading.tsx and error.tsx.
- Use shadcn AlertDialog instead of window.confirm.
- A brand-new hospital account must load with empty states and a sample-data button.

## 3. Security and tenancy

- All write paths: one transaction; verify ids belong to p_hospital_id; audit event writes for patient reads/exports.
- Clinical read permissions are restricted to clinical.read or orders.pipeline.
- Front desk, lab, and radiology roles cannot read consultation diagnoses or prescriptions.
- Patient mobile numbers are masked in lists.
- The storage bucket hospital-reports is private; Realtime is enabled on the required hospital tables.
- Do not expose service-role credentials to the browser.

## 4. Existing system to reuse

Re-use the following work that already exists in the repo: workspace provisioning, HospitalProvider/useHospital, HospitalShell, route layout, role-derived sidebar, PGlite harness, hospital schema, OPD RPCs, hospital patient search, queue, appointments, doctors, settings, investigations, admissions, command-center, and translations.

## 5. Database specification (binding)

The hospital migration set must contain the schema, OPD RPCs, clinical RPCs, investigations/admissions RPCs, and the hospital sample-data defaults.

### FILE C: clinical RPCs

Must implement the following functions:
- start_consultation_record
- save_consultation_draft
- finalize_consultation
- amend_consultation
- create_prescription
- create_referral
- accept_referral
- schedule_follow_up
- get_consultation_context
- demo_seed_clinical

### FILE D: investigations and admissions

Must implement the following functions:
- generate_investigation_slots
- regenerate_investigation_slots
- preview_slot_regeneration
- add_resource_closure
- add_hospital_holiday
- get_investigation_availability
- order_investigation
- book_investigation_slot
- waitlist_investigation_order
- staff_assign_slot
- cancel_investigation_booking
- offer_released_slot
- accept_slot_offer
- decline_slot_offer
- investigation_advance
- get_capacity_overview
- get_turnaround_overview
- get_bottlenecks
- run_hospital_maintenance
- run_hospital_maintenance_all
- admit_patient
- transfer_patient
- discharge_patient
- set_bed_status
- create_ward_with_beds
- generate_patient_link_code
- link_patient_account
- get_my_hospital_visits
- respond_slot_offer
- demo_seed_investigations
- demo_seed_admissions
- hospital_command_center (full version)

Also required: backfill to run seed_hospital_defaults and slot generation for every existing org, and the grant loop pattern: revoke from PUBLIC/anon and then grant to authenticated except internal helpers, with run_hospital_maintenance_all restricted to service_role only.

## 6. UI specification (binding)

The dashboard must include complete working pages for:
- OPD queue and patient flow
- appointments and bookings
- doctors and sessions
- patients and patient record
- investigations with tabs, waitlist, capacity, and configuration
- admissions and bed management
- command center v2
- admin hospitals verification panel
- patient-side My Hospital page
- notifications and cron integration

The UI must provide loading, empty, and error states; work at 360px; and use the hospitalOps translation namespace in both en and hi.

## 7. Notifications, cron, scripts, docs

- lib/notifications/dispatch.ts must exist and only support in_app notifications; SMS/WhatsApp/push are no-op interfaces.
- app/api/cron/hospital-maintenance/route.ts must be secured by CRON_SECRET and use lib/supabase/admin.ts server-side.
- scripts/verify-hospital-rls.ts, scripts/simulate-opd.ts, and an i18n parity script must exist.
- docs/hospital-dashboard/README.md and SECURITY.md must be present.
- supabase/APPLY_HOSPITAL_PENDING.sql must be generated in filename order from the hospital migrations after 20261002100000, excluding pharmacy migrations and early foundation files.

## 8. Test assertions (binding)

The harness must assert and pass the following behaviors:
- queue tokens count 1..30 with no gaps
- emergency-first calling order
- front_desk cannot read consultations
- finalized consultation is immutable
- slot double-booking fails
- routine cannot book reserved or emergency slots
- cancel booking offers the held slot to the highest-priority then oldest waitlisted order and cascades on decline
- pipeline transitions are enforced
- report dates skip Sundays and holidays
- closure flags need_reschedule without cancelling
- occupied bed is rejected
- discharge sets bed to cleaning
- remove_demo_data keeps non-demo rows and reopens demo-booked slots
- get_my_hospital_visits returns only the linked patient rows
- anon has no EXECUTE on hospital functions
- command center KPIs match direct counts
- Mammography shows today_available=0 and next available >= 10 days out while CT has open slots today

## 9. Checklist

The repo must be kept aligned with the current checklist state, and the TODO must accurately reflect done versus pending work.

## 10. Final report

The final response must separate what was executed and passed from what was only written, and it must include the exact Supabase migration file order to apply, the combined file path, and any open client questions.
