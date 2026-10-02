# Pharmacy dashboard product specification

## Scope

Build on the existing pharmacy foundation: `pharmacy_orgs`, `pharmacy_members`, `ensure_pharmacy_workspace`, `PharmacyProvider`, helper functions; reuse them, do not rebuild.

## Global rules

- Every new table has `pharmacy_id` / `org_id`, RLS on, tenant isolation via the existing helpers (SECURITY DEFINER helpers, never a policy selecting from its own table).
- All transactional writes go through SECURITY DEFINER RPCs that check membership + capability, validate input, run in one transaction and write the audit table.
- No client `INSERT` / `UPDATE` / `DELETE` policies on transactional tables.
- Every function: `REVOKE ALL FROM PUBLIC, anon`; `GRANT EXECUTE TO authenticated`; `SET search_path = public`.
- New idempotent migration files only (timestamps after `20261001110000`), end each with `NOTIFY pgrst, 'reload schema';`.
- Money numeric(12,2), totals/GST computed in SQL, selling price may never exceed MRP.
- Time in timestamptz using the org timezone.
- Errors via `lib/errors.ts` `getErrorMessage`.
- All text via `next-intl` in both `messages/en.json` and `messages/hi.json`.
- Next 13.5.1 / React 18.2 only.
- Preserve CRLF line endings.
- Realtime tables added with the guarded `ALTER PUBLICATION` pattern + 20s polling fallback.

## Step 2 - Catalogue + Inventory + stock + LEGACY LOCK-DOWN

Tables:
- `pharmacy_products` (`medicine_id` NULL -> `medicines`, name, generic_name, strength, form, manufacturer, category, schedule `otc|h|h1|x|ndps`, requires_prescription (forced true for `h/h1/x/ndps`), cold_chain, hsn_code, gst_rate, mrp, selling_price `CHECK <= mrp`, reorder_level, is_active; unique per org on `lower(name)+strength+form`)
- `pharmacy_stock_batches` (`product_id`, `batch_no`, `expiry_date`, `qty_on_hand`, `qty_reserved` `CHECK 0<=reserved<=on_hand`, `purchase_price`, `supplier_name`, `status active|quarantined|expired|written_off`; unique `product+batch_no`)
- `pharmacy_stock_movements` (append-only ledger)
- view `pharmacy_product_stock` (`available = on_hand - reserved` over active non-expired batches)

RPCs:
- `upsert_pharmacy_product`
- `search_global_medicines`
- `add_product_from_global`
- `receive_stock` (expiry must be future, qty>0)
- `adjust_stock` (reason required)
- `write_off_batch` (reason)
- paginated list queries with search/filter (`low stock`, `expiring in 30/60/90 days`, `expired`, `category`)

UI:
- `/dashboard/pharmacy/inventory` (product rows: available/reserved, nearest expiry, status chip Healthy/Low/Critical/Out/Expiring/Expired, expandable batches, Receive stock dialog, Adjust, Write off with reason+confirm)
- `/dashboard/pharmacy/medicines` (catalogue: price/MRP/GST/schedule, Add medicine = search global catalogue first or create custom, edit price blocked above MRP, activate/deactivate)

LEGACY LOCK-DOWN (same migration, security critical):
- the tables `pharmacies`, `pharmacy_reviews`, `medicines`, `medicine_prices`, `generic_alternatives` currently let ANY logged-in user insert/update/delete (policies `authenticated_*` with `USING true`). Drop those policies.
- New rules: `public SELECT` stays (Medicine Finder must keep working; for pharmacies with `org_id` not null require `is_verified OR member`); writes on `pharmacies` / `medicine_prices` only via SECURITY DEFINER sync RPC or platform admin (system role `admin` / `super_admin`); writes on `medicines` / `generic_alternatives` only platform admin; `pharmacy_reviews` add `user_id default auth.uid()`, insert/update/delete own rows only; `ALTER pharmacies ALTER is_verified SET DEFAULT false`; add `pharmacies.org_id uuid NULL`.
- Delete the old unsafe `app/dashboard/pharmacy/page.tsx` logic (it attaches users to pharmacies by name match / first pharmacy), remove client-side `updateMedicinePrice` / `updatePharmacy` from `lib/medicine-api.ts`, and guard `app/admin/page.tsx` with `ProtectedRoute ADMIN_ROLES`.
- Directory sync: `sync_pharmacy_directory(org)` creates/updates the matching `public.pharmacies` row and upserts `medicine_prices` (`current_price = selling_price`; availability `in_stock` / `low_stock` / `out_of_stock` from available vs reorder_level) ONLY when org is verified AND `listing_enabled`; otherwise hides it. Call it from stock/price RPCs.

STEP 3 - Customers + Prescriptions.

Tables:
- `pharmacy_customers` (`full_name`, `phone`, `email`, `address`, optional `condition_note`, `customer_user_id` NULL, unique `org+phone` when not null; code `CUS-000123`)
- `pharmacy_prescriptions` (`rx_no`, `customer`, `prescriber_name`, `prescriber_reg_no`, `issued_on`, `valid_until`, `source walk_in|patient_upload`, `file_path`, `status received|under_review|verified|rejected|partially_fulfilled|fulfilled|expired`, `rejection_reason`, `verification_checks jsonb {identity, prescriber, date_valid, schedule_compliance, availability}`, `verified_by/at`)
- `pharmacy_prescription_items`
- private storage bucket `pharmacy-prescriptions` (path `<org_id>/...`, org-member-only storage policies, 10MB, pdf/jpeg/png/webp)
- per-org race-safe number generator `next_pharmacy_number(org, kind, prefix)` (counter table, `INSERT ON CONFLICT DO UPDATE RETURNING`)

RPCs:
- `create/update_customer` (duplicate-phone warning)
- `create_prescription`
- `start_review`
- `verify_prescription` (ONLY pharmacist/admin AND all checks true AND valid dates)
- `reject_prescription` (reason)

UI:
- customers directory (search, masked phone, add/edit)
- prescriptions list with status filters + detail page (signed-URL file preview, items, REAL checklist that must be ticked, Approve/Reject, "Create order from prescription")

STEP 4 - Orders (core).

Tables:
- `pharmacy_orders` (`order_no ORD-2026-000123`, `customer`, `prescription` NULL, `status verification|preparing|ready|dispatched|completed|cancelled|rejected`, `priority normal|urgent`, `fulfilment pickup|delivery`, `subtotal`, `discount`, `tax_amount`, `total`, `amount_paid`, `payment_status unpaid|partial|paid|cod_pending|refunded`, per-status timestamps)
- `pharmacy_order_items` (`product`, `batch` NULL until allocated, `qty`, `unit_price`, `mrp`, `gst_rate`, `line_total`)

RPCs:
- `create_pharmacy_order` (prices computed server-side from products, never from the client)
- `edit items only in verification`
- `apply_discount`
- `cancel_order`
- `pharmacy_set_order_status` = STATE MACHINE: `verification -> preparing` (needs a verified unexpired prescription if any item requires one; FEFO reservation of earliest-expiring non-expired batches with row locks in deterministic order; clear error if insufficient e.g. `Paclitaxel 100mg: only 4 available`) -> `ready` -> `dispatched` (delivery orders) -> `completed` (pickup: `ready -> completed`). Cancel/reject before dispatch releases reservations. On dispatch/complete reserved qty becomes dispensed (`on_hand` decremented, ledger rows, prescription item qty_dispensed updated). Illegal jumps (e.g. `verification -> completed`) raise errors. Audit every transition.

UI:
- `/dashboard/pharmacy/orders` (status tabs, search, pagination, New order dialog with customer picker + product search + live totals)
- `/orders/[id]` detail (timeline, items, batch allocation, payment summary, delivery card, single next-step button, readable blocking errors). Realtime + polling.

STEP 5 - Deliveries + Payments.

Tables:
- `pharmacy_deliveries` (`order`, `status scheduled|out_for_delivery|delivered|failed|cancelled`, `scheduled_for`, `courier`, `assigned_to`, `address snapshot`, `contact_phone`, `delivered_at`, `failure_reason`; delivery staff see only their own)
- `pharmacy_payments` (`order`, `amount>0`, `method upi|card|cash|bank_transfer|cod_collected`, `status paid|refunded`, `reference`, `recorded_by`, `paid_at`)

RPCs:
- `create_delivery`
- `assign_delivery`
- `set_delivery_status` (keeps order status in sync)
- `record_payment` (rejects > outstanding; updates `amount_paid` / `payment_status`)
- `record_refund` (reason + capability)

UI:
- deliveries page with date-time scheduling and status actions
- payments page with real stats (collected today/week, outstanding, COD pending), Record payment dialog prefilled with outstanding, receipt print via jsPDF (pharmacy name, licence, GSTIN, items, tax, payment). No payment gateway.

STEP 6 - Dashboard + Notifications + Reports.

RPC `pharmacy_dashboard_summary(org)` in ONE round trip: counts by status, active orders (5), low-stock + expiring items, prescriptions awaiting review, deliveries today, today's activity computed by the org timezone day, recent notifications. Rebuild the prototype Dashboard (workflow strip Receive->Verify->Prepare->Dispatch->Complete with real counts, 4 stat cards, Active Orders table, Low Stock card, Quick Actions, Today's Activity, charts via recharts).

Notifications:
- reuse the existing notifications table via SECURITY DEFINER `notify_pharmacy_members(...)` with `dedupe_key` (add nullable link/dedupe_key columns + unique partial index if missing)
- events: prescription awaiting verification, new order, order ready, low stock once/day/product, batch expiring 30/60/90 days, delivery failed, payment received
- make `/dashboard/notifications` work for pharmacy users; sidebar unread badge.

Reports:
- expiry report
- low-stock report
- 7/30-day sales
- controlled-drug (`h1/x/ndps`) dispense register with CSV export

STEP 7 - Settings/Profile + staff + demo data.

- `/dashboard/pharmacy/settings`: editable pharmacy details, Open/Closed switch, home-delivery toggle, "List in Medicine Finder" (only when verified), verification status + Request verification, staff & roles (invite, revoke, deactivate, change roles via the existing RPCs), Load/Remove demo data.
- REMOVE any "Reset Seed Data".
- `load_demo_data(org)` / `remove_demo_data(org)` (admin only, own org only, `is_demo` flagged, idempotent): ~12 oncology medicines with batches, 8 fake customers, prescriptions in every status, orders at every status, deliveries, payments, so EVERY page shows rich data after one click.
- First-run setup checklist on the Dashboard.

STEP 8 - Platform admin:

- Pharmacies panel in `app/dashboard/admin` (system admin / `super_admin` only; list orgs with licence/GSTIN/status; Verify/Suspend via `admin_set_pharmacy_verification` which also runs `sync_pharmacy_directory`)
- minimal global medicine catalogue manager
- `run_pharmacy_maintenance()` (expire batches/prescriptions, raise expiry + low-stock notifications, resync directory)
- secured route `app/api/cron/pharmacy-maintenance/route.ts` (`CRON_SECRET` header)

STEP 9 - Patient integration (after 1-8):

- "Send my prescription to this pharmacy" from Medicine Finder / `app/pharmacy/[id]` for verified + listed + open pharmacies (private upload, consent, SECURITY DEFINER RPC creating a `pharmacy_prescriptions` row with source `patient_upload`)
- patient page "My pharmacy orders" (own rows only)

If short on room, finish everything else first.

NAV:
- `lib/dashboard-nav.ts` pharmacy items are exactly: Dashboard `/dashboard/pharmacy`, Orders, Inventory, Medicines, Customers, Prescriptions, Deliveries, Payments (each `/dashboard/pharmacy/<name>`), Notifications `/dashboard/notifications`, Pharmacy Profile `/dashboard/pharmacy/settings`, Profile `/dashboard/profile`.
- Every one must be a real, data-driven page; the sentence "not available yet" or any placeholder is forbidden.

FINISHING:
- `scripts/verify-pharmacy-rls.ts` (every staff role x capability, cross-tenant, forged audit/ledger inserts, direct writes bypassing RPCs, legacy-table lockdown, concurrent oversell test: two orders for the last 3 units -> one fails, no negative stock)
- `scripts/simulate-pharmacy.ts`
- `docs/pharmacy-dashboard/README.md` and `SECURITY.md`
- i18n `en/hi` parity

ACCEPTANCE:
- 3 new pharmacy accounts each get their own working workspace and see all 11 sidebar tabs with real UI
- after Load demo data every tab shows rich data
- accounts cannot see each other's data
- a logged-in patient can no longer update/delete pharmacies, medicine_prices or medicines
- Medicine Finder still works for anonymous users
- schedule-H order cannot start preparing without a verified prescription
- selling above MRP rejected
- payment above outstanding rejected
- Verification->Completed rejected
- `tsc`, `lint` and `next build` pass

START NOW with Step 2 (write the migration file and the Inventory + Medicines pages). Do not reply with a status summary until Step 2 is committed, then continue directly to Step 3.
