# Payment operations

## Database rollout

The user reports that `20261028000000_razorpay_payment_foundation.sql` and `20261029000000_durable_razorpay_payments.sql` have already been applied. Do not reapply them. The remote schema and that report have not been independently verified from this workspace. Review and apply `20261030000000_razorpay_lifecycle_hardening.sql` and `20261030010000_caregiver_payment_bookings.sql` if they are not already recorded as applied in the target project's migration history.

The lifecycle migration adds serialized provider-order creation/recovery, pharmacy online orders and audit, pharmacy transitions and delivery-fee settings, provider-aware expiry, late-capture exceptions, insurance review, tele-oncology authorization/quota operations, and refund fulfillment handling. The caregiver migration adds a separate durable caregiver-booking relation and advances its status only after verified payment capture. Do not mark rollout complete until both migrations have been reviewed and applied, then verified against the target PostgreSQL schema.

## Server configuration

Configure these only in the server runtime environment; never expose or commit secret values:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server only; never prefix with `NEXT_PUBLIC_`)
- `PAYMENTS_ENABLED=true` only while testing with Razorpay Test Mode credentials. Checkout stays unavailable unless this flag and both Razorpay API credentials are present.
- Keep `TELE_ONCOLOGY_CALL_PROVIDER_ENABLED=false` until a real call provider is integrated and end-to-end tested. Tele-oncology checkout is server-blocked while this is false.
- `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` from the Razorpay Test Mode dashboard.
- `RAZORPAY_WEBHOOK_SECRET` set to the secret configured for the webhook endpoint.
- Leave `MARKETPLACE_TRANSFERS_ENABLED=false` and `PATIENT_DONATIONS_ENABLED=false` until the required product, compliance, and operational approvals are confirmed.

## Razorpay webhook configuration

Configure the Test Mode webhook URL as:

`https://<your-deployed-host>/api/payments/webhook`

Subscribe to exactly these six implemented events: `payment.captured`, `payment.failed`, `order.paid`, `refund.created`, `refund.processed`, and `refund.failed`. Copy the dashboard-generated webhook secret into `RAZORPAY_WEBHOOK_SECRET`; do not share it in chat or source control. The route verifies the exact raw-body signature, claims a durable event ID, validates captured payments/refunds against Razorpay's current API state, and applies idempotent payment-state changes. Unsupported or malformed event payloads receive a client error; transient provider/database reconciliation failures are stored and return a retryable server error.

After configuration, make a sandbox transaction and confirm the internal payment order, appointment/order fulfillment, webhook event, and provider state in the admin Payment configuration page. No Razorpay dashboard settings or real provider transaction have been verified by this code change.

Failed payment webhooks are recorded as failed attempts while the internal order remains pending and retryable. The checkout client reuses its idempotency key for retries of that attempt. Do not manually release inventory or provider booking holds based only on a failed payment attempt; reconcile the provider order first.

## Current business gates

- Tele-oncology offers are seeded at ₹500 for one consultation with no configured expiry and ₹15,000 for 35 consultations over 30 days. The current monthly offer is a one-time charge, not recurring billing or auto-renewal. Entitlements and a concurrency-safe quota operation are durable, but a real video provider is not integrated; checkout is blocked until that integration is completed and explicitly enabled.
- The patient medicine catalogue lists active products only from verified pharmacies accepting online orders and currently in stock. One-time purchases use the selected approved pharmacy product's selling price, prescription verification, and reserved stock. Checkout remains blocked until an administrator sets an explicit versioned commission policy. Medicine subscription entitlements are not yet wired to fulfillment.
- Insurance payment options require an active per-plan `payment_offers` row. Payment only moves the application to `pending_issuance`; it does not represent an issued policy.
- Home-care bookings require an active helper offer with configured duration and usage. The booking screen displays configured daily/monthly offers rather than creating a booking directly; payment confirms the database booking only after provider capture. A cancellation for a paid booking submits a refund request and does not immediately cancel the booking.
- Caregiver-marketplace bookings use the selected verified caregiver and active service, revalidate availability and price server-side, and remain `payment_pending` until capture. Paid bookings become requests awaiting caregiver confirmation; a payment is not treated as caregiver acceptance.
- Donations and seller payouts are blocked. The BPL donation page preserves legacy history as read-only and labels payment status unverified; new records cannot be created through the application. The donation environment flag alone does not grant legal, campaign, or payment-account approval. Internal seller settlement entries remain `approval_required`, and no transfer API is enabled.
- Refund requests are reviewed by an administrator. A provider refund is not represented as complete until Razorpay reports `processed`.

## Validation and rollout limitations

Run `npx tsx --test tests/razorpay-security.test.ts tests/razorpay-migration.test.ts` for local payment-security and PGlite lifecycle regressions. Local tests do not prove that the migrations apply to the remote schema or that a Razorpay Test Mode transaction succeeds. The two additive lifecycle/caregiver migrations require review/application by an authorized database operator if absent from migration history. Insurance monthly subscriptions and medicine subscriptions remain disabled pending approved terms and recurring-billing/fulfillment support. Home-care daily/monthly offers are configured one-time booking windows, not recurring payments or unlimited entitlements. Donations and seller transfers remain unavailable pending approvals and configuration.
