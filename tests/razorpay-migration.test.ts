import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const migrationFiles = [
  '20260709023550_create_medicine_finder_schema.sql',
  '20260709024556_create_auth_rbac_schema.sql',
  '20260709024756_create_dashboard_support_tables.sql',
  '20260827000000_create_insurance_schema.sql',
  '20260909000000_create_cook_maid_schema.sql',
  '20260903000000_sync_bpl_donation_totals.sql',
  '20261001110000_pharmacy_foundation.sql',
  '20261001120000_pharmacy_inventory_catalogue.sql',
  '20261001130000_pharmacy_customers_prescriptions.sql',
  '20261028000000_razorpay_payment_foundation.sql',
  '20261029000000_durable_razorpay_payments.sql',
  '20261030000000_razorpay_lifecycle_hardening.sql',
  '20261030010000_caregiver_payment_bookings.sql',
  '20261031000000_prelaunch_demo_payments.sql',
  '20261031130000_live_bpl_payment_records.sql',
  '20261117000000_guard_caregiver_booking_overlaps.sql',
];

test('payment migrations enforce paid tele-oncology access and idempotent quota use', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz DEFAULT now()
      );
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT COALESCE(current_setting('request.jwt.claim.role', true), 'anon')
      $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
      CREATE TABLE public.bpl_patients (
        id bigserial PRIMARY KEY,
        name text NOT NULL DEFAULT 'Test patient',
        goal_amount numeric NOT NULL DEFAULT 1000,
        raised_amount numeric NOT NULL DEFAULT 0,
        donors_count integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE public.bpl_donations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        patient_id bigint NOT NULL REFERENCES public.bpl_patients(id),
        donor_id uuid,
        donor_name varchar(255) NOT NULL DEFAULT 'Test donor',
        donor_email varchar(255) NOT NULL DEFAULT 'donor@example.com',
        amount numeric(12, 2) NOT NULL DEFAULT 1,
        payment_method varchar(50) NOT NULL DEFAULT 'upi',
        status varchar(50) NOT NULL DEFAULT 'successful',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT valid_payment_method CHECK (payment_method IN ('upi', 'card', 'netbanking'))
      );
      ALTER TABLE public.bpl_donations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "auth_create_donations" ON public.bpl_donations
        FOR INSERT TO authenticated WITH CHECK (true);
      CREATE POLICY "update_own_donations" ON public.bpl_donations
        FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
      GRANT SELECT, INSERT, UPDATE, DELETE ON public.bpl_donations TO authenticated;
    `);

    for (const file of migrationFiles) {
      const source = await readFile(path.join(process.cwd(), 'supabase', 'migrations', file), 'utf8');
      const sql = source.replace(/^\s*CREATE EXTENSION IF NOT EXISTS [^;]+;\s*$/gim, '');
      await db.exec(sql);
    }

    await db.exec('SET ROLE authenticated');
    await assert.rejects(db.query('INSERT INTO public.bpl_donations (donor_id) VALUES ($1)', [randomUUID()]));
    await db.exec('RESET ROLE');
    await assert.rejects(db.query(
      `UPDATE public.payment_offers SET duration_days = 31
       WHERE kind = 'tele-oncology' AND offer_type = 'monthly'`,
    ));

    const userId = randomUUID();
    const doctorId = randomUUID();
    const orderId = randomUUID();
    const checkoutIdempotencyKey = randomUUID();
    const providerOrderId = `rp_order_${randomUUID()}`;
    const providerPaymentId = `rp_payment_${randomUUID()}`;
    const offerAdminId = randomUUID();
    const homecareProviderId = `test-homecare-${randomUUID()}`;
    await db.query('INSERT INTO auth.users (id) VALUES ($1), ($2), ($3)', [userId, doctorId, offerAdminId]);
    const { rows: adminRoles } = await db.query<{ id: string }>(
      `SELECT id FROM public.roles WHERE name = 'admin' LIMIT 1`,
    );
    assert.equal(adminRoles.length, 1);
    await db.query(
      'INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, $2)',
      [offerAdminId, adminRoles[0].id],
    );
    await db.query(
      `INSERT INTO public.cook_maid_helpers (id, name, service, location, experience, avatar, verified)
       VALUES ($1, 'Test Cook', 'Cook', 'Bengaluru', '5 years', 'TC', true)`,
      [homecareProviderId],
    );
    const upsertHomecareOffer = (actorId: string, type: string, amount: number, days: number, active: boolean) => db.query<{ id: string }>(
      `SELECT (public.admin_upsert_payment_offer(
        $1, 'booking', $2, $3, $4, $5, NULL, $6, NULL, NULL, $7::jsonb
      )).id AS id`,
      [actorId, homecareProviderId, type, amount, days, active, JSON.stringify({ description: `${type} approved offer` })],
    );
    await assert.rejects(upsertHomecareOffer(userId, 'daily', 70000, 1, true));
    const { rows: createdDaily } = await upsertHomecareOffer(offerAdminId, 'daily', 70000, 1, true);
    const { rows: updatedDaily } = await upsertHomecareOffer(offerAdminId, 'daily', 80000, 1, false);
    assert.equal(updatedDaily[0].id, createdDaily[0].id);
    await upsertHomecareOffer(offerAdminId, 'monthly', 1500000, 30, true);
    const { rows: providerOffers } = await db.query<{ offer_type: string; amount_in_paise: number; duration_days: number; active: boolean }>(
      `SELECT offer_type, amount_in_paise, duration_days, active
       FROM public.payment_offers WHERE kind = 'booking' AND entity_id = $1 ORDER BY offer_type`,
      [homecareProviderId],
    );
    assert.deepEqual(providerOffers, [
      { offer_type: 'daily', amount_in_paise: 80000, duration_days: 1, active: false },
      { offer_type: 'monthly', amount_in_paise: 1500000, duration_days: 30, active: true },
    ]);

    await db.exec("SET request.jwt.claim.role = 'authenticated'");
    await assert.rejects(db.query(
      `INSERT INTO public.appointments
        (user_id, doctor_id, appointment_date, status, type)
       VALUES ($1, $2, now() + interval '1 day', 'scheduled', 'teleconsultation')`,
      [userId, doctorId],
    ));

    const { rows: offers } = await db.query<{ id: string; amount_in_paise: number }>(
      `SELECT id, amount_in_paise FROM public.payment_offers
       WHERE kind = 'tele-oncology' AND entity_id = 'default' AND offer_type = 'one-time'`,
    );
    assert.equal(offers.length, 1);
    const offer = offers[0];
    const notes = {
      plan: 'one-time',
      offerId: offer.id,
      offerAmountInPaise: Number(offer.amount_in_paise),
      includedCalls: 1,
      durationDays: null,
      appointmentDate: new Date(Date.now() - 60_000).toISOString(),
    };
    await db.query(
      `INSERT INTO public.payment_orders (id, user_id, kind, amount_in_paise, provider_order_id, notes, idempotency_key)
       VALUES ($1, $2, 'tele-oncology', $3, $4, $5::jsonb, $6)`,
      [orderId, userId, offer.amount_in_paise, providerOrderId, JSON.stringify(notes), checkoutIdempotencyKey],
    );
    await assert.rejects(db.query(
      `INSERT INTO public.payment_orders (id, user_id, kind, amount_in_paise, idempotency_key)
       VALUES ($1, $2, 'tele-oncology', $3, $4)`,
      [randomUUID(), userId, offer.amount_in_paise, checkoutIdempotencyKey],
    ));

    await db.exec("SET request.jwt.claim.role = 'service_role'");
    const { rows: currentRole } = await db.query<{ role: string }>('SELECT auth.role() AS role');
    assert.equal(currentRole[0].role, 'service_role');
    const { rows: paymentOrders } = await db.query<{ user_id: string; kind: string; status: string }>(
      'SELECT user_id, kind, status FROM public.payment_orders WHERE id = $1',
      [orderId],
    );
    assert.deepEqual(paymentOrders[0], { user_id: userId, kind: 'tele-oncology', status: 'pending' });
    const { rows: matches } = await db.query<{ matches: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM public.payment_orders
        WHERE id = $1 AND user_id = $2 AND kind = 'tele-oncology' AND status = 'pending'
      ) AS matches`,
      [orderId, userId],
    );
    assert.equal(matches[0].matches, true);
    const appointmentId = randomUUID();
    await db.query(
      `INSERT INTO public.appointments
        (id, user_id, doctor_id, appointment_date, status, type, payment_order_id)
       VALUES ($1, $2, $3, now() - interval '1 minute', 'payment_pending', 'teleconsultation', $4)`,
      [appointmentId, userId, doctorId, orderId],
    );

    const finalize = () => db.query<{ result: { status: string; duplicate: boolean } }>(
      'SELECT public.finalize_razorpay_payment($1, $2, $3, $4) AS result',
      [providerOrderId, providerPaymentId, offer.amount_in_paise, 'INR'],
    );
    const firstCapture = await finalize();
    assert.equal(firstCapture.rows[0].result.status, 'paid');
    assert.equal(firstCapture.rows[0].result.duplicate, false);

    const duplicateCapture = await finalize();
    assert.equal(duplicateCapture.rows[0].result.status, 'paid');
    assert.equal(duplicateCapture.rows[0].result.duplicate, true);

    const { rows: entitlements } = await db.query<{ remaining_calls: number }>(
      'SELECT remaining_calls FROM public.tele_oncology_entitlements WHERE order_id = $1',
      [orderId],
    );
    assert.equal(entitlements.length, 1);
    assert.equal(Number(entitlements[0].remaining_calls), 1);

    const consume = () => db.query<{ result: { allowed: boolean; remaining_calls: number; duplicate?: boolean } }>(
      'SELECT public.consume_tele_oncology_call($1, $2) AS result',
      [userId, appointmentId],
    );
    const firstUse = await consume();
    assert.equal(firstUse.rows[0].result.allowed, true);
    assert.equal(Number(firstUse.rows[0].result.remaining_calls), 0);

    const duplicateUse = await consume();
    assert.equal(duplicateUse.rows[0].result.allowed, true);
    assert.equal(duplicateUse.rows[0].result.duplicate, true);

    const { rows: usages } = await db.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM public.tele_oncology_usage WHERE appointment_id = $1',
      [appointmentId],
    );
    assert.equal(usages[0].count, 1);

    const caregiverOrderId = randomUUID();
    const caregiverProviderOrderId = `rp_order_${randomUUID()}`;
    const caregiverPaymentId = `rp_payment_${randomUUID()}`;
    const caregiverId = randomUUID();
    const serviceId = randomUUID();
    await db.query(
      `INSERT INTO public.payment_orders (id, user_id, kind, amount_in_paise, provider_order_id)
       VALUES ($1, $2, 'caregiver', 25000, $3)`,
      [caregiverOrderId, userId, caregiverProviderOrderId],
    );
    await db.query(
      `INSERT INTO public.caregiver_payment_bookings (
        payment_order_id, patient_id, caregiver_id, service_id, requested_date,
        requested_start_time, requested_end_time, location, amount_in_paise
      ) VALUES ($1, $2, $3, $4, current_date + 1, '10:00', '11:00', 'Bengaluru', 25000)`,
      [caregiverOrderId, userId, caregiverId, serviceId],
    );
    const caregiverCapture = await db.query<{ result: { status: string; duplicate: boolean } }>(
      'SELECT public.finalize_razorpay_payment($1, $2, 25000, $3) AS result',
      [caregiverProviderOrderId, caregiverPaymentId, 'INR'],
    );
    assert.equal(caregiverCapture.rows[0].result.status, 'paid');
    const { rows: caregiverBookings } = await db.query<{ status: string }>(
      'SELECT status FROM public.caregiver_payment_bookings WHERE payment_order_id = $1',
      [caregiverOrderId],
    );
    assert.equal(caregiverBookings.length, 1);
    assert.equal(caregiverBookings[0].status, 'requested');
    const conflictingCaregiverOrderId = randomUUID();
    await db.query(
      `INSERT INTO public.payment_orders (id, user_id, kind, amount_in_paise)
       VALUES ($1, $2, 'caregiver', 25000)`,
      [conflictingCaregiverOrderId, userId],
    );
    await assert.rejects(db.query(
      `INSERT INTO public.caregiver_payment_bookings (
        payment_order_id, patient_id, caregiver_id, service_id, requested_date,
        requested_start_time, requested_end_time, location, amount_in_paise
      ) VALUES ($1, $2, $3, $4, current_date + 1, '10:30', '11:30', 'Bengaluru', 25000)`,
      [conflictingCaregiverOrderId, userId, caregiverId, randomUUID()],
    ));
    await db.query(
      `INSERT INTO public.caregiver_payment_bookings (
        payment_order_id, patient_id, caregiver_id, service_id, requested_date,
        requested_start_time, requested_end_time, location, amount_in_paise
      ) VALUES ($1, $2, $3, $4, current_date + 1, '11:00', '12:00', 'Bengaluru', 25000)`,
      [conflictingCaregiverOrderId, userId, caregiverId, randomUUID()],
    );

    const legacyPilotOrderId = randomUUID();
    const legacyPilotProviderOrderId = `rp_order_${randomUUID()}`;
    const legacyPilotPaymentId = `rp_payment_${randomUUID()}`;
    const { rows: legacyPilotCatalog } = await db.query<{ id: string }>(
      `SELECT id FROM public.prelaunch_demo_catalog WHERE slug = 'demo-caregiver-session'`,
    );
    await db.query(
      `INSERT INTO public.payment_orders (
        id, user_id, kind, amount_in_paise, provider_order_id, is_demo, payment_mode, notes
      ) VALUES ($1, $2, 'caregiver', 10000, $3, true, 'test', '{"isDemo":true}'::jsonb)`,
      [legacyPilotOrderId, userId, legacyPilotProviderOrderId],
    );
    await db.query(
      `INSERT INTO public.prelaunch_demo_bookings (
        payment_order_id, catalog_id, patient_id, kind, provider_label, service_name,
        requested_date, requested_start_time, requested_end_time, amount_in_paise, payment_mode, disclosure_version
      ) VALUES ($1, $2, $3, 'caregiver', 'DEMO: Test provider', 'DEMO: Test service',
        current_date + 1, '10:00', '11:00', 10000, 'test', 'prelaunch-demo-v1')`,
      [legacyPilotOrderId, legacyPilotCatalog[0].id, userId],
    );
    const legacyPilotCapture = await db.query<{ result: { status: string; duplicate: boolean; demo: boolean } }>(
      'SELECT public.finalize_razorpay_payment($1, $2, 10000, $3) AS result',
      [legacyPilotProviderOrderId, legacyPilotPaymentId, 'INR'],
    );
    assert.deepEqual(legacyPilotCapture.rows[0].result, { status: 'paid', duplicate: false, order_id: legacyPilotOrderId, demo: true });
    const duplicateLegacyPilotCapture = await db.query<{ result: { status: string; duplicate: boolean; demo: boolean } }>(
      'SELECT public.finalize_razorpay_payment($1, $2, 10000, $3) AS result',
      [legacyPilotProviderOrderId, legacyPilotPaymentId, 'INR'],
    );
    assert.equal(duplicateLegacyPilotCapture.rows[0].result.duplicate, true);
    const { rows: legacyPilotBookings } = await db.query<{ status: string }>(
      'SELECT status FROM public.prelaunch_demo_bookings WHERE payment_order_id = $1',
      [legacyPilotOrderId],
    );
    assert.deepEqual(legacyPilotBookings, [{ status: 'paid_demo' }]);
    const { rows: realCaregiverBookings } = await db.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM public.caregiver_payment_bookings WHERE payment_order_id = $1',
      [legacyPilotOrderId],
    );
    assert.equal(realCaregiverBookings[0].count, 0);

    const { rows: patients } = await db.query<{ id: number }>(
      `INSERT INTO public.bpl_patients (goal_amount) VALUES (1000) RETURNING id`,
    );
    const campaignOrderId = randomUUID();
    const campaignProviderOrderId = `rp_order_${randomUUID()}`;
    await db.query(
      `INSERT INTO public.payment_orders (
        id, user_id, kind, amount_in_paise, provider_order_id, payment_mode, is_demo
      ) VALUES ($1, $2, 'donation', 10000, $3, 'live', false)`,
      [campaignOrderId, userId, campaignProviderOrderId],
    );
    await db.query(
      `INSERT INTO public.payment_donations (
        order_id, bpl_patient_id, donor_name, donor_email, payment_method, purpose
      ) VALUES ($1, $2, 'Live donor', 'live@example.com', 'razorpay', 'verified campaign')`,
      [campaignOrderId, patients[0].id],
    );
    await db.query(
      `UPDATE public.payment_orders SET status = 'paid', provider_payment_id = $2 WHERE id = $1`,
      [campaignOrderId, `rp_payment_${randomUUID()}`],
    );
    const { rows: campaignDonation } = await db.query<{ count: number; payment_method: string }>(
      `SELECT count(*)::integer AS count, max(payment_method) AS payment_method
       FROM public.bpl_donations WHERE payment_order_id = $1`,
      [campaignOrderId],
    );
    assert.deepEqual(campaignDonation[0], { count: 1, payment_method: 'razorpay' });
    const { rows: campaignTotals } = await db.query<{ raised_amount: number | string; donors_count: number }>(
      'SELECT raised_amount, donors_count FROM public.bpl_patients WHERE id = $1',
      [patients[0].id],
    );
    assert.equal(Number(campaignTotals[0].raised_amount), 100);
    assert.equal(campaignTotals[0].donors_count, 1);
    await db.query(`UPDATE public.payment_orders SET status = 'paid' WHERE id = $1`, [campaignOrderId]);
    const { rows: duplicateCampaignDonation } = await db.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM public.bpl_donations WHERE payment_order_id = $1',
      [campaignOrderId],
    );
    assert.equal(duplicateCampaignDonation[0].count, 1);

    const testDonationOrderId = randomUUID();
    const testDonationProviderOrderId = `rp_order_${randomUUID()}`;
    await db.query(
      `INSERT INTO public.payment_orders (
        id, user_id, kind, amount_in_paise, provider_order_id, payment_mode, is_demo
      ) VALUES ($1, $2, 'donation', 10000, $3, 'test', false)`,
      [testDonationOrderId, userId, testDonationProviderOrderId],
    );
    await db.query(
      `INSERT INTO public.payment_donations (
        order_id, bpl_patient_id, donor_name, donor_email, payment_method, purpose
      ) VALUES ($1, $2, 'Test donor', 'test@example.com', 'razorpay', 'test campaign')`,
      [testDonationOrderId, patients[0].id],
    );
    await db.query(
      `UPDATE public.payment_orders SET status = 'paid', provider_payment_id = $2 WHERE id = $1`,
      [testDonationOrderId, `rp_payment_${randomUUID()}`],
    );
    const { rows: testCampaignDonation } = await db.query<{ count: number }>(
      'SELECT count(*)::integer AS count FROM public.bpl_donations WHERE payment_order_id = $1',
      [testDonationOrderId],
    );
    assert.equal(testCampaignDonation[0].count, 0);
    const { rows: totalsAfterTestDonation } = await db.query<{ raised_amount: number | string; donors_count: number }>(
      'SELECT raised_amount, donors_count FROM public.bpl_patients WHERE id = $1',
      [patients[0].id],
    );
    assert.equal(Number(totalsAfterTestDonation[0].raised_amount), 100);
    assert.equal(totalsAfterTestDonation[0].donors_count, 1);

    const cleanupMigration = await readFile(
      path.join(process.cwd(), 'supabase', 'migrations', '20261031140000_remove_prelaunch_payment_demo.sql'),
      'utf8',
    );
    await db.exec('RESET ROLE');
    await db.exec(cleanupMigration);
    const { rows: legacyPayment } = await db.query<{
      status: string;
      is_demo: boolean;
      provider_order_id: string;
      provider_payment_id: string;
      archived_service_name: string;
    }>(
      `SELECT status, is_demo, provider_order_id, provider_payment_id,
              notes #>> '{legacyPilotRecord,booking,service_name}' AS archived_service_name
       FROM public.payment_orders WHERE id = $1`,
      [legacyPilotOrderId],
    );
    assert.deepEqual(legacyPayment, [{
      status: 'paid',
      is_demo: true,
      provider_order_id: legacyPilotProviderOrderId,
      provider_payment_id: legacyPilotPaymentId,
      archived_service_name: 'DEMO: Test service',
    }]);
    const { rows: removedDemoTables } = await db.query<{ catalog: string | null; bookings: string | null }>(
      `SELECT to_regclass('public.prelaunch_demo_catalog')::text AS catalog,
              to_regclass('public.prelaunch_demo_bookings')::text AS bookings`,
    );
    assert.deepEqual(removedDemoTables[0], { catalog: null, bookings: null });
  } finally {
    await db.close();
  }
});
