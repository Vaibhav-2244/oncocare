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
  '20261001110000_pharmacy_foundation.sql',
  '20261001120000_pharmacy_inventory_catalogue.sql',
  '20261001130000_pharmacy_customers_prescriptions.sql',
  '20261028000000_razorpay_payment_foundation.sql',
  '20261029000000_durable_razorpay_payments.sql',
  '20261030000000_razorpay_lifecycle_hardening.sql',
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
      CREATE TABLE public.bpl_donations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), donor_id uuid);
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
    const providerOrderId = `rp_order_${randomUUID()}`;
    const providerPaymentId = `rp_payment_${randomUUID()}`;
    await db.query('INSERT INTO auth.users (id) VALUES ($1), ($2)', [userId, doctorId]);

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
      `INSERT INTO public.payment_orders (id, user_id, kind, amount_in_paise, provider_order_id, notes)
       VALUES ($1, $2, 'tele-oncology', $3, $4, $5::jsonb)`,
      [orderId, userId, offer.amount_in_paise, providerOrderId, JSON.stringify(notes)],
    );

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
  } finally {
    await db.close();
  }
});
