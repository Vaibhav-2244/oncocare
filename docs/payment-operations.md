# Payment operations

## Database rollout

The user reports that `20261028000000_razorpay_payment_foundation.sql` and `20261029000000_durable_razorpay_payments.sql` have already been applied. Do not reapply them. The remote schema and that report have not been independently verified from this workspace. Review and apply `20261030000000_razorpay_lifecycle_hardening.sql` and `20261030010000_caregiver_payment_bookings.sql` if they are not already recorded as applied in the target project's migration history.

The lifecycle migration adds serialized provider-order creation/recovery, pharmacy online orders and audit, pharmacy transitions and delivery-fee settings, provider-aware expiry, late-capture exceptions, insurance review, tele-oncology authorization/quota operations, and refund fulfillment handling. The caregiver migration adds a separate durable caregiver-booking relation and advances its status only after verified payment capture. Do not mark rollout complete until both migrations have been reviewed and applied, then verified against the target PostgreSQL schema.

The additional `20261031130000_live_bpl_payment_records.sql` migration is required for Live BPL campaign donations. It links payment donation metadata to a campaign and payment order, records a BPL donation only when a non-demo Live payment becomes verified-paid, and makes that campaign-record insertion idempotent. It deliberately does not count Test Mode transactions as fundraising totals. Apply this migration after the user-reported `20261031000000_prelaunch_demo_payments.sql` migration before enabling `PATIENT_DONATIONS_ENABLED`.

## Server configuration

Configure these only in the server runtime environment; never expose or commit secret values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never prefix with `NEXT_PUBLIC_`)
- Set `RAZORPAY_MODE` explicitly to `test` or `live`; it must match `RAZORPAY_KEY_ID` (`rzp_test_...` or `rzp_live_...`). `LIVE_PAYMENTS_ENABLED=true` selects Live even if a stale `RAZORPAY_MODE=test` remains; Live still requires an `rzp_live_` key. Otherwise the server honors explicit `RAZORPAY_MODE`, or infers from the key prefix when it is unset (Test is the default). An explicit invalid mode is rejected. A Live request with a Test key is blocked as a prefix mismatch, never downgraded.
- `RAZORPAY_KEY_SECRET` must be from the same Razorpay mode as the key ID. `RAZORPAY_WEBHOOK_SECRET` must match the webhook secret configured in that mode.
- `PAYMENTS_ENABLED=true` enables checkout only when the mode, matching credentials, webhook secret, and all three Supabase values above are present.
- `LIVE_PAYMENTS_ENABLED=true` is an additional required gate in Live Mode. Razorpay must have activated the account for Live Mode.
- `PRELAUNCH_DEMO_MODE=true` and `DEMO_PAYMENTS_ENABLED=true` enable the separate demo catalogue for any authenticated OncoCare+ user. Anonymous users cannot browse or initiate a demo checkout.
- `PRELAUNCH_LIVE_DEMO_COLLECTION_ENABLED=true` is additionally required for an actual Live pre-launch pilot charge. Each authenticated user can select an active `DEMO:` listing and must explicitly consent. The disclosure displays the static label “OncoCare+ Pilot Payment”; this display label does not change Razorpay's merchant account or payment recipient. The charge is real and does not guarantee or purchase a real-world service, charitable donation, insurance, consultation, medicine, or other fulfilment.
- Keep `PATIENT_DONATIONS_ENABLED=false` for an internal pilot. It is a separate BPL campaign flow and should only be enabled when campaigns, beneficiary details, approvals, and required database rollout are complete.
- Keep `MARKETPLACE_TRANSFERS_ENABLED=false`; seller transfers are not enabled. `TELE_ONCOLOGY_CALL_PROVIDER_ENABLED` does not activate real consultations: no provider is integrated and the feature is hard-disabled in this build.

### Vercel profile for an internal ₹100 Live pilot

Set these in the Vercel **Production** environment (or the specific environment you intend to use), then redeploy. Use values from the same Razorpay Live account. `RAZORPAY_MODE=live` is recommended explicitly; `LIVE_PAYMENTS_ENABLED=true` selects Live even if an old `RAZORPAY_MODE=test` value remains.

| Variable | Required value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Existing Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only Supabase service-role key |
| `RAZORPAY_MODE` | `live` |
| `RAZORPAY_KEY_ID` | Razorpay Live Key ID beginning `rzp_live_` |
| `RAZORPAY_KEY_SECRET` | Matching Razorpay Live Key Secret; server-only |
| `RAZORPAY_WEBHOOK_SECRET` | Secret for the Live Mode webhook configured below; server-only |
| `PAYMENTS_ENABLED` | `true` |
| `LIVE_PAYMENTS_ENABLED` | `true` |
| `PRELAUNCH_DEMO_MODE` | `true` |
| `DEMO_PAYMENTS_ENABLED` | `true` |
| `PRELAUNCH_LIVE_DEMO_COLLECTION_ENABLED` | `true` |
| `PATIENT_DONATIONS_ENABLED` | `false` |
| `MARKETPLACE_TRANSFERS_ENABLED` | `false` |
| `TELE_ONCOLOGY_CALL_PROVIDER_ENABLED` | `false` |

For Test Mode, use `RAZORPAY_MODE=test`, a matching `rzp_test_` key ID, Test Key Secret, and Test Mode webhook secret; set `PAYMENTS_ENABLED=true`, `PRELAUNCH_DEMO_MODE=true`, and `DEMO_PAYMENTS_ENABLED=true`, while keeping `LIVE_PAYMENTS_ENABLED=false` and `PRELAUNCH_LIVE_DEMO_COLLECTION_ENABLED=false`.

The smallest internal Live transaction is on the signed-in `/medicine-finder` page: choose the seeded **DEMO: Medicine checkout simulation** priced at ₹100. Any authenticated OncoCare+ user can use it. It is an actual Live charge to the merchant account, not a donation, medicine order, or fulfilled service. The page labels the pilot and requires acknowledgement and consent before opening Razorpay Checkout. Confirm the verified transaction under the admin Payment configuration page.

Do not switch `RAZORPAY_MODE` while there are pending orders or webhook retries. Reconciliation checks the mode recorded on each order and refuses to use credentials from a different mode. Test and Live credentials, webhook secret, and dashboard configuration must be deployed together.

## Pre-launch demo checkout

The additive `20261031000000_prelaunch_demo_payments.sql` migration creates an isolated DEMO catalogue and payment-linked demo record. It seeds clearly labelled caregiver, cook/maid, consultation, medicine, and insurance simulations. An administrator can add/update/deactivate DEMO entries in the Payment configuration page. Labels must begin with `DEMO:`. These rows are not genuine providers, verified professionals, live inventory, insurance products, or beneficiaries.

Demo bookings record the selected date and time, server-priced amount, mode, consent version, and capture/refund state. A successful demo capture updates only the demo record; it does not create a real caregiver booking, home-care booking, teleconsultation appointment or entitlement, pharmacy order, or issued insurance policy. Real caregiver checkout is available only for verified, active, available providers with a valid configured service price and open availability. The new migration marks existing cook/maid profiles as DEMO by default; their legacy payment flow rejects those entries. Test Mode simulated donations have no beneficiary and are recorded as having no charitable purpose.

Live pre-launch checkout collects actual funds to the configured merchant account. It is not a free test. The customer-facing confirmation requires explicit acceptance of the live amount and merchant and discloses that no real service or goods are supplied. Do not configure Live collection unless the company and Razorpay merchant account are authorized for the exact pilot collection and refund process.

## Razorpay webhook configuration

Configure webhook endpoints separately for Test and Live Mode at:

`https://<your-deployed-host>/api/payments/webhook`

Subscribe to exactly these six implemented events: `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, and `refund.failed`. Copy the dashboard-generated webhook secret into `RAZORPAY_WEBHOOK_SECRET`; do not share it in chat or source control. The route verifies the exact raw-body signature, claims a durable event ID, validates captured payments/refunds against Razorpay's current API state, and applies idempotent payment-state changes. Unsupported or malformed event payloads receive a client error; transient provider/database reconciliation failures are stored and return a retryable server error.

After configuration, make a Test Mode transaction and confirm the internal payment order, webhook event, and provider state in the admin Payment configuration page. Live payments must use the Live Mode webhook secret and endpoint configuration. No real provider transaction has been performed by this code change.

Failed payment webhooks are recorded as failed attempts while the internal order remains pending and retryable. The checkout client reuses its idempotency key for retries of that attempt. Do not manually release inventory or provider booking holds based only on a failed payment attempt; reconcile the provider order first.

## Current business gates

- Tele-oncology offers are seeded at ₹500 for one consultation with no configured expiry and ₹15,000 for 35 consultations over 30 days. The current monthly offer is a one-time charge, not recurring billing or auto-renewal. Entitlements and a concurrency-safe quota operation are durable, but a real video provider is not integrated; checkout is blocked until that integration is completed and explicitly enabled.
- The patient medicine catalogue lists active products only from verified pharmacies accepting online orders and currently in stock. One-time purchases use the selected approved pharmacy product's selling price, prescription verification, and reserved stock. Checkout remains blocked until an administrator sets an explicit versioned commission policy. Medicine subscription entitlements are not yet wired to fulfillment.
- Insurance payment options require an active per-plan `payment_offers` row. Payment only moves the application to `pending_issuance`; it does not represent an issued policy.
- Home-care bookings require an active helper offer with configured duration and usage. The booking screen displays configured daily/monthly offers rather than creating a booking directly; payment confirms the database booking only after provider capture. A cancellation for a paid booking submits a refund request and does not immediately cancel the booking.
- Caregiver-marketplace bookings are offered only for real providers that are onboarded, verified, active, available, and have a configured service/availability slot. The separate DEMO catalogue can simulate checkout without creating a real booking or service request.
- Real tele-oncology remains blocked in code until an actual consultation provider and operations integration exist. Test/live DEMO consultation simulations make no medical service claim.
- Patient-linked charitable donations and seller payouts are blocked. The BPL donation page preserves legacy history as read-only; a separate simulated donation is available only in Test Mode, has no beneficiary, and makes no charitable contribution. Live donation collection remains blocked regardless of environment flags. Internal seller settlement entries remain `approval_required`, and no transfer API is enabled.
- Refund requests are reviewed by an administrator. A provider refund is not represented as complete until Razorpay reports `processed`.

## Validation and rollout limitations

Run `npx tsx --test tests/razorpay-security.test.ts tests/razorpay-migration.test.ts` for local payment-security and PGlite lifecycle regressions. Local tests do not prove that migrations apply to the remote schema or that a Razorpay transaction succeeds. Check target Supabase migration history and apply `20261030000000_razorpay_lifecycle_hardening.sql`, `20261030010000_caregiver_payment_bookings.sql`, and `20261031000000_prelaunch_demo_payments.sql` only if absent. Existing caregiver marketplace tables are referenced by application code but their source migrations are not present in this repository; the isolated demo catalogue does not depend on those external tables. Insurance monthly subscriptions and medicine subscriptions remain disabled pending approved terms and fulfillment support. Live patient donations and seller transfers remain unavailable.
