# Pharmacy Dashboard Progress

## Status

Step 1 foundation is implemented locally, but its live Supabase gate is blocked because the target project does not yet contain the migration. Steps 2-9 are deliberately gated until the foundation checks pass.

## Ordered Plan

1. **Foundation:** add tenant and membership schema, capability/RLS helpers, workspace provisioning and staff/verification RPCs; integrate the role-derived Next.js layout/provider/shell; add real-route placeholders and foundation verification script.
2. **Catalogue and inventory:** tenant catalogue, batches, immutable stock ledger, RPC-only stock movement and scoped catalogue/inventory UI.
3. **Customers and prescriptions:** scoped customers, private prescription storage and stored pharmacist checks.
4. **Orders:** server-priced line items, FEFO allocation, reservation and validated order state machine.
5. **Deliveries and payments:** delivery workflow, outstanding-balance payment/refund RPCs and views.
6. **Dashboard and notifications:** timezone-correct summary, shared notification feed and reports.
7. **Settings and staff:** workspace configuration, member administration, demo data and setup checklist.
8. **Platform admin:** pharmacy verification and global catalogue controls, plus legacy Medicine Finder write lockdown and directory sync.
9. **Patient integration:** consented prescription submission and patient-only order tracking, after Steps 1-8 pass.
10. **Production hardening:** security/architecture docs, maintenance, localization parity, build and acceptance evidence.

## Step 1 Scope

- Add a new idempotent pharmacy foundation migration after `20261001100000_hospital_foundation_fix.sql`.
- Provision workspaces only for authenticated users with the system `pharmacy` role; reuse active membership, accept a confirmed-email invite, recover owned workspaces, or create an isolated pending-verification workspace.
- Keep organization/member/invite/counter/audit writes behind SECURITY DEFINER RPCs. Do not allow self-verification or client audit writes.
- Replace the legacy pharmacy dashboard lookup with a provider/shell under the shared role-derived DashboardLayout and add actual pharmacy routes with loading/error/empty placeholders.
- Update the pharmacy sidebar and shared notification route, preserving existing `pharmacy.*` localization keys and adding matching `pharmacyApp.*` keys in English and Hindi.
- Add `scripts/verify-pharmacy-foundation.ts` for tenant isolation, role rejection, invite acceptance, anonymous RPC denial, and verification protection.
- Run `npx tsc --noEmit` and `npm run lint`; inspect migration grants/policies and run the integration verifier only when Supabase has the new migration applied.

## Verification Gate

Step 1 is not passed until TypeScript and lint pass, static migration checks pass, and the live Supabase verifier passes. Do not start Step 2 before the live verifier succeeds.

## Step 1 Implementation

- Added `supabase/migrations/20261001110000_pharmacy_foundation.sql` with tenant organizations, members, invites, counters, audit, capability helpers, access policies, workspace provisioning, settings, verification, staff, and numbering RPCs.
- Added pharmacy workspace provider, capability mirror, status/error shell, typed records, and the exact role-derived pharmacy sidebar.
- Replaced the fuzzy-match legacy page with an org-backed dashboard and created route/loading/error placeholders for the required Step 1 paths.
- Shared notifications now use pharmacy navigation. The existing `pharmacy.*` locale namespace is preserved; the new `pharmacyApp.*` keys match across English and Hindi.
- Added `scripts/verify-pharmacy-foundation.ts` with temporary-account cleanup and checks for tenant separation, invites, anonymous RPC denial, non-pharmacy denial, self-verification, and forged audit writes.

## Step 1 Verification

- `npx tsc --noEmit`: passes.
- `npm run lint`: passes with existing warnings in unrelated BPL donation, lab reports, medicine finder, diet plan, and tele-oncology files; no pharmacy warnings.
- English/Hindi `pharmacyApp` key parity: 56 / 56, no missing or extra keys.
- Static migration audit: 16 functions checked; `SECURITY DEFINER`, fixed search paths, revoke/grant statements, balanced dollar quotes, no self-select membership policy, and final PostgREST reload all pass.
- `npx tsx scripts/verify-pharmacy-foundation.ts`: blocked/fails at setup because Supabase reports `public.ensure_pharmacy_workspace` and `public.pharmacy_orgs` are absent from its schema cache. The script removed its temporary Auth user; no workspace could be created. Apply the migration, reload PostgREST, then rerun the script.
- The environment uses Node 20.15.0 although the project requires Node 22. The verifier uses the already-installed `ws` polyfill to proceed; Supabase still prints its Node 20 deprecation warning.

## Step 1 Status

- Local implementation and local gates are complete.
- Step 1 is **not passed** until the migration is applied to the target Supabase project and the live verifier passes. Do not begin Step 2 before then.
- See `docs/pharmacy-dashboard/OPEN_QUESTIONS.md` for the exact external blocker and manual next action.

## Worktree Notes

- The prototype is `pharmacy_fixed/`; it is read-only UI reference and must remain untouched and unimported.
- At start, the worktree contained untracked `ddescriptions_hospital_dashboard.docx`, `hospital-dashboard-requirements.md`, and `pharmacy_fixed/`. These are pre-existing user files and must remain untouched.
- The prototype directory remains untouched and is not imported by the Next.js app.
- Step 1 implementation commits: `feat: add pharmacy dashboard foundation` and `fix: show pharmacy notification count` (live database gate remains pending).

## Step 2 Scope

- Build real inventory and medicine catalogue pages using the pharmacy workspace provider and Supabase queries.
- Add tenant-scoped stock summaries, receive/adjust stock flows, and a searchable medicine catalogue list.
- Keep the page flows aligned with the pharmacy inventory migration described in `supabase/migrations/20261001120000_pharmacy_inventory_catalogue.sql`.

## Step 2 Implementation

- Added the real `Inventory` and `Medicines` dashboard screens under `app/dashboard/pharmacy`.
- Added supplier-aware stock management and catalogue search components for the pharmacy workspace.
- Added the Step 3 customer and prescription route screens to begin the next workflow in the same pass.
- Kept the work scoped to the real app and did not import anything from the prototype directory.

## Step 2 Verification

- `npx tsc --noEmit`: passes.
- `npm run lint`: passes with warnings only in unrelated legacy areas outside the pharmacy dashboard.

## Step 2 Status

- Step 2 is implemented and ready to commit.
- Next action: continue immediately into the customer and prescription workflow as Step 3.

## Step 3 Status

- Fixed the broken inventory migration guardrail by replacing the invalid expression-based UNIQUE with a valid table-level plus indexed unique constraint.
- Added the Step 3 customer and prescription tenant schema and RPCs under `supabase/migrations/20261001130000_pharmacy_customers_prescriptions.sql`.
- Added `scripts/check-sql-syntax.ts` and `scripts/build-apply-all.ts` and verified the offline migration audit passes for the current pharmacy schema set.
