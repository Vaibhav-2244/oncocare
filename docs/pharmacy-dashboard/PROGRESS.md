# Pharmacy dashboard status

## Implemented locally

- Tenant-scoped workspace foundation and role-derived Next.js routes.
- Medicine catalogue and inventory screens with supporting database migrations.
- Customer and prescription routes and their initial database workflows.

## Incomplete / deployment-gated

- The pharmacy migrations have not passed live verification against the target
  Supabase project. Apply the migrations, reload the API schema, and run
  `scripts/verify-pharmacy-foundation.ts` before enabling this workflow in a
  deployed environment.
- Orders, deliveries, payments, complete settings/staff workflows, platform
  administration, and patient integration are not verified as end-to-end
  production workflows. Several routes are still placeholders.
- `pharmacy_fixed/` is a standalone UI/data prototype, not imported by the
  Next.js app. Keep it only as a reference until the unfinished flows are
  integrated and tested; never use its demo login or JSON data store for real
  patient information.

## Database references and checks

- Pharmacy schema: `supabase/migrations/20261001110000_pharmacy_foundation.sql`,
  `20261001120000_pharmacy_inventory_catalogue.sql`, and
  `20261001130000_pharmacy_customers_prescriptions.sql`.
- Regenerate the pharmacy-only SQL bundle with `npm run build:sql`.
- Keep migration history append-only. Do not mark the live verification gate
  complete based on local typechecks or offline SQL tests alone.
