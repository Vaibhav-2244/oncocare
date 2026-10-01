# Pharmacy Dashboard Open Questions

## Step 1 External Blocker

- The target Supabase project does not yet contain `public.pharmacy_orgs` or `public.ensure_pharmacy_workspace`; the live verifier confirmed both are absent from the schema cache.
- Apply `supabase/migrations/20261001110000_pharmacy_foundation.sql` after `20261001100000_hospital_foundation_fix.sql`, then run `NOTIFY pgrst, 'reload schema';` and rerun `npx tsx scripts/verify-pharmacy-foundation.ts`.
- Step 2 must remain blocked until the live verifier passes. Do not share `.env.local` values in logs or reports.

## Configurable Defaults / Later Product Decisions

- The default pharmacy timezone is `Asia/Kolkata`, matching the existing hospital convention and requested product requirements.
- Refund/return policy, controlled-drug register format, delivery partner, and payment-gateway choice remain later-step decisions. Payment gateway integration stays out of scope as specified.
