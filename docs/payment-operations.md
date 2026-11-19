# Payment operations

## Database rollout

The user reports that `20261028000000_razorpay_payment_foundation.sql`, `20261029000000_durable_razorpay_payments.sql`, and `20261031000000_prelaunch_demo_payments.sql` have already been applied. Verify the target project's migration history before any rollout; do not reapply migrations already recorded there.

Review and apply these migrations in order when absent:

1. `20261030000000_razorpay_lifecycle_hardening.sql`
2. `20261030010000_caregiver_payment_bookings.sql`
3. `20261031130000_live_bpl_payment_records.sql`
4. `20261031140000_remove_prelaunch_payment_demo.sql`
5. `20261117000000_guard_caregiver_booking_overlaps.sql`

The final migration archives each historical pilot booking and its catalogue snapshot inside the corresponding `payment_orders.notes.legacyPilotRecord`, then removes only the pilot catalogue, booking table, and status-sync trigger/function. It preserves payment orders, Razorpay IDs, statuses, amounts, modes, refunds, audit records, and historical `is_demo` markers. It does not change the Razorpay merchant or payment recipient. The pre-existing payment order columns remain for historical reconciliation and display.

The caregiver booking guard serializes reservations per caregiver and rejects overlapping pending, requested, or confirmed slots, including concurrent checkouts.

The lifecycle and caregiver migrations provide durable order creation/recovery, stock/order handling, caregiver reservations, verified payment finalization, exceptions, and refunds. Do not mark rollout complete until the migrations are verified against the target PostgreSQL schema.

## Server configuration

Configure these only in the server runtime environment; never expose or commit secret values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never prefix with `NEXT_PUBLIC_`)
- `RAZORPAY_MODE`: explicitly `test` or `live`; it must match the key ID prefix.
- `RAZORPAY_KEY_ID`: `rzp_test_...` for Test Mode or `rzp_live_...` for Live Mode.
- `RAZORPAY_KEY_SECRET`: secret paired with that Key ID.
- `RAZORPAY_WEBHOOK_SECRET`: webhook secret configured for that same Razorpay mode.
- `PAYMENTS_ENABLED=true`: enables checkout only when the mode, matching credentials, webhook secret, and Supabase settings above are present.
- `LIVE_PAYMENTS_ENABLED=true`: additional required gate for Live Mode. Razorpay must also have activated the account for Live Mode.

`LIVE_PAYMENTS_ENABLED=true` selects Live Mode even if a stale `RAZORPAY_MODE=test` remains, but the Live key prefix is still mandatory. Otherwise the server honors explicit `RAZORPAY_MODE`, or infers mode from the key prefix if mode is unset. An explicit invalid mode or mismatched key is rejected; the application never downgrades a Live request to Test Mode.

Keep these gates conservative:

- `PATIENT_DONATIONS_ENABLED=false` until campaign, beneficiary, accounting, and operational approvals are complete.
- `MARKETPLACE_TRANSFERS_ENABLED=false`; seller transfers and Razorpay Route are not implemented.
- `TELE_ONCOLOGY_CALL_PROVIDER_ENABLED=false`; the code currently hard-disables consultation checkout until a real provider integration exists.

There are no pre-launch demo checkout flags or pilot catalogue. Do not add them to deployment configuration.

### Vercel Razorpay profiles

Set variables in the intended Vercel environment and redeploy. Test and Live credentials/webhook secrets must come from the corresponding Razorpay mode.

| Variable | Test Mode | Live Mode |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL | Existing Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase anon/publishable key | Existing Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only service-role key | Existing server-only service-role key |
| `RAZORPAY_MODE` | `test` | `live` |
| `RAZORPAY_KEY_ID` | Key beginning `rzp_test_` | Key beginning `rzp_live_` |
| `RAZORPAY_KEY_SECRET` | Matching Test secret | Matching Live secret; server-only |
| `RAZORPAY_WEBHOOK_SECRET` | Test webhook secret | Live webhook secret; server-only |
| `PAYMENTS_ENABLED` | `true` | `true` |
| `LIVE_PAYMENTS_ENABLED` | `false` | `true` |
| `PATIENT_DONATIONS_ENABLED` | `false` unless separately approved | `false` unless separately approved |
| `MARKETPLACE_TRANSFERS_ENABLED` | `false` | `false` |
| `TELE_ONCOLOGY_CALL_PROVIDER_ENABLED` | `false` | `false` |

`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` must remain server-only. Configure each variable in every Vercel deployment environment where it is needed.

## Available payment flows and limitations

- **Caregiver marketplace:** checkout requires an active, verified, available caregiver, an active service with a valid server-side price, and a matching availability slot. The paid booking becomes a request only after verified provider capture.
- **Medicine:** checkout uses an active product from an approved pharmacy, the server-side selling price, available stock, a verified prescription when required, and delivery information. An approved commission policy is required; stock is reserved during checkout.
- **Insurance:** one-time payment requires an active plan and configured offer. Payment creates an application pending insurer issuance; it does not activate or issue coverage. Recurring subscriptions are not supported.
- **Home care / cook and maid:** checkout rejects demo profiles. Real payment requires a genuine active provider and approved server-side offers.
- **Tele-oncology:** payment is unavailable until a real consultation provider is configured; the current static profiles are not chargeable providers.
- **BPL donations:** disabled by default. When approved and enabled, checkout requires a verified campaign, BPL status, medical documents, beneficiary account, and donor details. Payment to the registered merchant does not itself disburse money to the beneficiary; campaign reporting and disbursement are separate.
- **Marketplace transfers:** disabled. Payments are collected by the existing Razorpay merchant; no seller payout or Razorpay Route flow is implemented.

A verified payment is not proof of service, product, consultation, policy issuance, or campaign disbursement. Fulfilment and business approvals remain separate. Existing historical pilot transactions are labeled as legacy pilot payments and remain available for reconciliation; new pilot/demo catalogue payments cannot be initiated.

## Razorpay webhook configuration

Configure webhook endpoints separately for Test and Live Mode at:

`https://<your-deployed-host>/api/payments/webhook`

Subscribe to the six implemented events: `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, and `refund.failed`. Copy the dashboard-generated webhook secret into `RAZORPAY_WEBHOOK_SECRET`; do not share it in chat or source control. The route verifies the exact raw-body signature, claims a durable event ID, validates captured payments/refunds against Razorpay's current API state, and applies idempotent payment-state changes.

Do not switch Razorpay mode while there are pending orders or webhook retries. Reconciliation checks the mode recorded on each order and refuses to use credentials from a different mode. Test and Live credentials, webhook secret, and dashboard configuration must be deployed together.

## Validation and rollout limitations

Run `npx tsx --test tests/razorpay-security.test.ts tests/razorpay-migration.test.ts` for local payment-security and PGlite lifecycle regressions. Local tests do not prove that migrations apply to the remote schema or that a Razorpay transaction succeeds. Verify the remote migration history, apply only missing migrations, and test using the intended Razorpay mode. Do not claim a Live transaction was tested unless an actual transaction was completed.
