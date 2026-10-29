CREATE TABLE IF NOT EXISTS public.payment_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('medicine', 'insurance', 'booking', 'tele-oncology')),
  entity_id text NOT NULL,
  offer_type text NOT NULL CHECK (offer_type IN ('one-time', 'subscription', 'daily', 'monthly')),
  amount_in_paise bigint NOT NULL CHECK (amount_in_paise > 0),
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  included_usage integer CHECK (included_usage IS NULL OR included_usage > 0),
  active boolean NOT NULL DEFAULT false,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, entity_id, offer_type),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from)
);

INSERT INTO public.payment_offers (kind, entity_id, offer_type, amount_in_paise, duration_days, included_usage, active, terms)
VALUES
  ('tele-oncology', 'default', 'one-time', 50000, NULL, 1, true, '{"unit":"consultation"}'::jsonb),
  ('tele-oncology', 'default', 'monthly', 1500000, 30, 35, true, '{"unit":"subscription_period"}'::jsonb)
ON CONFLICT (kind, entity_id, offer_type) DO NOTHING;

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS failure_reason text;

ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('pending', 'authorized', 'paid', 'partially_refunded', 'failed', 'cancelled', 'refunded'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_orders_user_idempotency
  ON public.payment_orders (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tele_oncology_entitlements_order
  ON public.tele_oncology_entitlements (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_order_id uuid REFERENCES public.payment_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doctor_label text;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check
  CHECK (status IN ('payment_pending', 'scheduled', 'completed', 'cancelled', 'no_show', 'payment_failed'));

ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.payment_refunds
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS failure_reason text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_refunds_order_idempotency
  ON public.payment_refunds (order_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_payment_order
  ON public.appointments (payment_order_id)
  WHERE payment_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.payment_orders(id) ON DELETE CASCADE,
  entity_id text NOT NULL,
  seller_id uuid,
  description text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_amount_in_paise bigint NOT NULL CHECK (unit_amount_in_paise > 0),
  total_amount_in_paise bigint NOT NULL CHECK (total_amount_in_paise > 0),
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL,
  gross_amount_in_paise bigint NOT NULL CHECK (gross_amount_in_paise >= 0),
  commission_amount_in_paise bigint NOT NULL CHECK (commission_amount_in_paise >= 0),
  seller_payable_in_paise bigint NOT NULL CHECK (seller_payable_in_paise >= 0),
  policy_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'settlement_pending', 'settled', 'reversed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, seller_id)
);

CREATE TABLE IF NOT EXISTS public.payment_commission_policies (
  policy_version text PRIMARY KEY,
  basis_points integer NOT NULL CHECK (basis_points BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_commission_policy_active
  ON public.payment_commission_policies (active) WHERE active = true;

CREATE TABLE IF NOT EXISTS public.payment_seller_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_ledger_id uuid NOT NULL UNIQUE REFERENCES public.payment_commission_ledger(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'approval_required'
    CHECK (status IN ('approval_required', 'pending', 'initiated', 'settled', 'failed', 'reversed')),
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_donations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  case_id uuid,
  purpose text NOT NULL,
  receipt_reference text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tele_oncology_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.tele_oncology_entitlements(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, appointment_id)
);

ALTER TABLE public.cook_maid_bookings
  ADD COLUMN IF NOT EXISTS payment_order_id uuid REFERENCES public.payment_orders(id) ON DELETE SET NULL;
ALTER TABLE public.cook_maid_helpers
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.cook_maid_bookings
  DROP CONSTRAINT IF EXISTS cook_maid_bookings_status_check;
ALTER TABLE public.cook_maid_bookings
  ADD CONSTRAINT cook_maid_bookings_status_check
  CHECK (status IN ('payment_pending', 'confirmed', 'cancelled'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_cook_maid_bookings_payment_order
  ON public.cook_maid_bookings (payment_order_id)
  WHERE payment_order_id IS NOT NULL;

DROP POLICY IF EXISTS select_provider_cook_maid_bookings ON public.cook_maid_bookings;
CREATE POLICY select_provider_cook_maid_bookings ON public.cook_maid_bookings
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.cook_maid_helpers h
      WHERE h.id = helper_id AND h.owner_user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.insurance_payment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.insurance_plans(id) ON DELETE RESTRICT,
  issuance_status text NOT NULL DEFAULT 'payment_pending'
    CHECK (issuance_status IN ('payment_pending', 'pending_issuance', 'issued', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_stock_reservations (
  order_id uuid NOT NULL REFERENCES public.payment_orders(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_stock_batches(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'committed', 'released')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, batch_id)
);

ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tele_oncology_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_commission_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_seller_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tele_oncology_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_payment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_stock_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_orders_select_own ON public.payment_orders;
CREATE POLICY payment_orders_select_own ON public.payment_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS payment_offers_read_active ON public.payment_offers;
CREATE POLICY payment_offers_read_active ON public.payment_offers
  FOR SELECT TO authenticated USING (active AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until > now()));

DROP POLICY IF EXISTS tele_entitlements_select_own ON public.tele_oncology_entitlements;
CREATE POLICY tele_entitlements_select_own ON public.tele_oncology_entitlements
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS payment_items_select_owner ON public.payment_order_items;
CREATE POLICY payment_items_select_owner ON public.payment_order_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.payment_orders o WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS insurance_payment_applications_select_own ON public.insurance_payment_applications;
CREATE POLICY insurance_payment_applications_select_own ON public.insurance_payment_applications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS payment_audit_admin_read ON public.payment_audit_log;
CREATE POLICY payment_audit_admin_read ON public.payment_audit_log
  FOR SELECT TO authenticated USING (public.is_platform_admin());

DROP POLICY IF EXISTS payment_refunds_select_owner ON public.payment_refunds;
CREATE POLICY payment_refunds_select_owner ON public.payment_refunds
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.payment_orders o WHERE o.id = order_id AND o.user_id = auth.uid()
  ));

CREATE OR REPLACE FUNCTION public.finalize_razorpay_payment(
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount_in_paise bigint,
  p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_entitlement public.tele_oncology_entitlements%ROWTYPE;
  v_appointment_id uuid;
  v_plan text;
  v_calls integer;
  v_validity integer;
  v_appointment_date timestamptz;
  v_result jsonb;
BEGIN
  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE provider_order_id = p_provider_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_order.amount_in_paise <> p_amount_in_paise OR v_order.currency <> p_currency THEN
    RAISE EXCEPTION 'Payment amount or currency mismatch' USING ERRCODE = '22023';
  END IF;
  IF v_order.status = 'paid' AND v_order.provider_payment_id = p_provider_payment_id THEN
    RETURN jsonb_build_object('status', 'paid', 'duplicate', true, 'order_id', v_order.id);
  END IF;
  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Payment order is not pending' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payment_orders
  SET status = 'paid',
      provider_payment_id = p_provider_payment_id,
      captured_at = now(),
      updated_at = now()
  WHERE id = v_order.id;

  IF v_order.kind = 'tele-oncology' THEN
    v_plan := COALESCE(v_order.notes->>'plan', 'one-time');
    IF v_plan NOT IN ('one-time', 'monthly') THEN
      RAISE EXCEPTION 'Invalid tele-oncology plan on payment order' USING ERRCODE = '22023';
    END IF;
    v_calls := CASE WHEN v_plan = 'monthly' THEN 35 ELSE 1 END;
    SELECT duration_days, included_usage
    INTO v_validity, v_calls
    FROM public.payment_offers
    WHERE kind = 'tele-oncology' AND entity_id = 'default' AND offer_type = v_plan
      AND active = true
      AND (valid_from IS NULL OR valid_from <= now())
      AND (valid_until IS NULL OR valid_until > now())
    FOR SHARE;
    IF NOT FOUND OR v_calls <= 0 THEN
      RAISE EXCEPTION 'Tele-oncology pricing or quota configuration is unavailable' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.tele_oncology_entitlements (
      user_id, entitlement_type, valid_from, valid_until, remaining_calls, order_id
    ) VALUES (
      v_order.user_id, v_plan, now(),
      CASE WHEN v_validity IS NULL THEN NULL ELSE now() + make_interval(days => v_validity) END,
      v_calls, v_order.id
    )
    ON CONFLICT (order_id) WHERE order_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_entitlement;

    IF v_entitlement.id IS NULL THEN
      SELECT * INTO v_entitlement FROM public.tele_oncology_entitlements WHERE order_id = v_order.id;
    END IF;

    IF NULLIF(v_order.notes->>'appointmentDate', '') IS NOT NULL THEN
      UPDATE public.appointments
      SET status = 'scheduled'
      WHERE payment_order_id = v_order.id AND status = 'payment_pending'
      RETURNING id INTO v_appointment_id;
      IF v_appointment_id IS NULL THEN
        SELECT id INTO v_appointment_id FROM public.appointments
        WHERE payment_order_id = v_order.id AND status = 'scheduled';
      END IF;
      IF v_appointment_id IS NULL THEN
        RAISE EXCEPTION 'Paid consultation has no reserved appointment' USING ERRCODE = 'P0002';
      END IF;
    END IF;
  ELSIF v_order.kind = 'medicine' THEN
    INSERT INTO public.payment_commission_ledger (
      order_id, seller_id, gross_amount_in_paise, commission_amount_in_paise,
      seller_payable_in_paise, policy_version
    )
    SELECT v_order.id,
      (item.seller_id)::uuid,
      item.total_amount_in_paise,
      floor(item.total_amount_in_paise * (item.terms->>'commissionBasisPoints')::numeric / 10000)::bigint,
      item.total_amount_in_paise -
        floor(item.total_amount_in_paise * (item.terms->>'commissionBasisPoints')::numeric / 10000)::bigint,
      item.terms->>'commissionPolicyVersion'
    FROM public.payment_order_items item
    WHERE item.order_id = v_order.id AND item.seller_id IS NOT NULL
      AND item.terms ? 'commissionBasisPoints'
      AND item.terms ? 'commissionPolicyVersion'
    ON CONFLICT (order_id, seller_id) DO NOTHING;

    INSERT INTO public.payment_seller_settlements (commission_ledger_id, status)
    SELECT ledger.id, 'approval_required'
    FROM public.payment_commission_ledger ledger
    WHERE ledger.order_id = v_order.id
    ON CONFLICT (commission_ledger_id) DO NOTHING;

    UPDATE public.pharmacy_stock_batches b
    SET qty_on_hand = b.qty_on_hand - r.quantity,
        qty_reserved = b.qty_reserved - r.quantity,
        updated_at = now()
    FROM public.payment_stock_reservations r
    WHERE r.order_id = v_order.id AND r.state = 'reserved' AND b.id = r.batch_id;

    INSERT INTO public.pharmacy_stock_movements (
      pharmacy_id, product_id, batch_id, movement_type, quantity, reason, reference
    )
    SELECT b.pharmacy_id, b.product_id, b.id, 'dispense', -r.quantity,
      'Paid online order', v_order.id::text
    FROM public.payment_stock_reservations r
    JOIN public.pharmacy_stock_batches b ON b.id = r.batch_id
    WHERE r.order_id = v_order.id AND r.state = 'reserved';

    UPDATE public.payment_stock_reservations
    SET state = 'committed'
    WHERE order_id = v_order.id AND state = 'reserved';
  ELSIF v_order.kind = 'booking' THEN
    UPDATE public.cook_maid_bookings
    SET status = 'confirmed'
    WHERE payment_order_id = v_order.id AND status = 'payment_pending';
  ELSIF v_order.kind = 'insurance' THEN
    UPDATE public.insurance_payment_applications
    SET issuance_status = 'pending_issuance', updated_at = now()
    WHERE order_id = v_order.id AND issuance_status = 'payment_pending';
  END IF;

  INSERT INTO public.payment_audit_log (actor_user_id, action, order_id, details)
  VALUES (v_order.user_id, 'payment.captured', v_order.id,
    jsonb_build_object('provider_payment_id', p_provider_payment_id, 'kind', v_order.kind));

  RETURN jsonb_build_object(
    'status', 'paid',
    'duplicate', false,
    'order_id', v_order.id,
    'entitlement_id', v_entitlement.id,
    'appointment_id', v_appointment_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_payment_tele_appointment(
  p_order_id uuid,
  p_user_id uuid,
  p_doctor_id text,
  p_doctor_name text,
  p_appointment_date timestamptz,
  p_reason text,
  p_notes text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_doctor_uuid uuid;
  v_appointment_id uuid;
  v_slot_key text;
BEGIN
  IF p_appointment_date <= now() THEN
    RAISE EXCEPTION 'Appointment must be in the future' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.payment_orders
  WHERE id = p_order_id AND user_id = p_user_id AND kind = 'tele-oncology' AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending consultation order not found' USING ERRCODE = 'P0002'; END IF;

  IF p_doctor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_doctor_uuid := p_doctor_id::uuid;
  END IF;
  v_slot_key := COALESCE(v_doctor_uuid::text, lower(btrim(p_doctor_name))) || ':' || p_appointment_date::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_slot_key, 0));

  IF EXISTS (
    SELECT 1 FROM public.appointments a
    LEFT JOIN public.payment_orders existing_order ON existing_order.id = a.payment_order_id
    WHERE a.appointment_date = p_appointment_date
      AND COALESCE(a.doctor_id::text, lower(btrim(a.doctor_label))) =
          COALESCE(v_doctor_uuid::text, lower(btrim(p_doctor_name)))
      AND a.status IN ('scheduled', 'payment_pending')
      AND (a.status = 'scheduled' OR existing_order.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'The selected consultation slot is no longer available' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.appointments (
    user_id, doctor_id, doctor_label, appointment_date, status, type, reason, notes, payment_order_id
  ) VALUES (
    p_user_id, v_doctor_uuid, p_doctor_name, p_appointment_date, 'payment_pending',
    'teleconsultation', p_reason, p_notes, p_order_id
  )
  RETURNING id INTO v_appointment_id;
  RETURN v_appointment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_paid_appointment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.payment_order_id IS NOT NULL AND COALESCE(auth.role(), '') <> 'service_role'
    AND NOT COALESCE((
      auth.uid() = OLD.doctor_id
      AND OLD.status = 'scheduled'
      AND NEW.status IN ('completed', 'cancelled')
      AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
      AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
      AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
      AND NEW.payment_order_id IS NOT DISTINCT FROM OLD.payment_order_id
    ), false)
    AND (
      NEW.status IS DISTINCT FROM OLD.status
      OR NEW.appointment_date IS DISTINCT FROM OLD.appointment_date
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.doctor_id IS DISTINCT FROM OLD.doctor_id
      OR NEW.payment_order_id IS DISTINCT FROM OLD.payment_order_id
    ) THEN
    RAISE EXCEPTION 'Payment-backed appointments must be changed through the authorized payment workflow'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_paid_appointment_state ON public.appointments;
CREATE TRIGGER protect_paid_appointment_state
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.protect_paid_appointment();

CREATE OR REPLACE FUNCTION public.reserve_payment_order_stock(
  p_order_id uuid,
  p_product_id uuid,
  p_quantity integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch record;
  v_remaining integer := p_quantity;
  v_take integer;
BEGIN
  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Invalid quantity' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.payment_orders WHERE id = p_order_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending order not found' USING ERRCODE = 'P0002'; END IF;

  FOR v_batch IN
    SELECT id, qty_on_hand - qty_reserved AS available
    FROM public.pharmacy_stock_batches
    WHERE product_id = p_product_id AND status = 'active' AND expiry_date > CURRENT_DATE
      AND qty_on_hand > qty_reserved
    ORDER BY expiry_date, created_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining = 0;
    v_take := LEAST(v_remaining, v_batch.available);
    UPDATE public.pharmacy_stock_batches
    SET qty_reserved = qty_reserved + v_take, updated_at = now()
    WHERE id = v_batch.id;
    INSERT INTO public.payment_stock_reservations (order_id, batch_id, quantity)
    VALUES (p_order_id, v_batch.id, v_take);
    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Insufficient stock' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_payment_homecare_booking(
  p_order_id uuid,
  p_user_id uuid,
  p_helper_id text,
  p_patient_name text,
  p_location text,
  p_start_date date,
  p_duration_days integer,
  p_amount_in_paise bigint,
  p_notes text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_helper public.cook_maid_helpers%ROWTYPE;
  v_order public.payment_orders%ROWTYPE;
  v_offer public.payment_offers%ROWTYPE;
  v_booking_id text;
  v_existing boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_helper_id, 0));
  SELECT * INTO v_order FROM public.payment_orders
    WHERE id = p_order_id AND user_id = p_user_id AND kind = 'booking' AND status = 'pending'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_helper FROM public.cook_maid_helpers WHERE id = p_helper_id AND verified = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved home-care provider not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_offer FROM public.payment_offers
    WHERE id = (v_order.notes->>'offerId')::uuid AND kind = 'booking' AND entity_id = p_helper_id
      AND active = true AND amount_in_paise = p_amount_in_paise
      AND (valid_from IS NULL OR valid_from <= now())
      AND (valid_until IS NULL OR valid_until > now());
  IF NOT FOUND THEN RAISE EXCEPTION 'Home-care offer is no longer available' USING ERRCODE = '22023'; END IF;
  IF p_duration_days < 1 OR p_start_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Invalid booking dates' USING ERRCODE = '22023';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.cook_maid_bookings b
    LEFT JOIN public.payment_orders previous_order ON previous_order.id = b.payment_order_id
    WHERE b.helper_id = p_helper_id
      AND b.status IN ('confirmed', 'payment_pending')
      AND daterange(b.start_date, b.end_date + 1, '[)') &&
          daterange(p_start_date, p_start_date + p_duration_days, '[)')
      AND (b.status = 'confirmed' OR previous_order.expires_at > now())
  ) INTO v_existing;
  IF v_existing THEN RAISE EXCEPTION 'Provider is not available for the selected dates' USING ERRCODE = '23505'; END IF;

  v_booking_id := gen_random_uuid()::text;
  INSERT INTO public.cook_maid_bookings (
    id, user_id, helper_id, helper_name, service, location, patient_name,
    start_date, end_date, duration_days, price_per_day, total_amount, status, payment_order_id, notes
  ) VALUES (
    v_booking_id, p_user_id, v_helper.id, v_helper.name, v_helper.service, p_location, p_patient_name,
    p_start_date, p_start_date + p_duration_days - 1, p_duration_days,
    floor((p_amount_in_paise / 100.0) / p_duration_days)::integer,
    floor(p_amount_in_paise / 100.0)::integer, 'payment_pending', p_order_id, left(COALESCE(p_notes, ''), 1000)
  );
  RETURN v_booking_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_payment_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pharmacy_stock_batches b
  SET qty_reserved = b.qty_reserved - r.quantity, updated_at = now()
  FROM public.payment_stock_reservations r
  WHERE r.order_id = p_order_id AND r.state = 'reserved' AND b.id = r.batch_id;

  UPDATE public.payment_stock_reservations SET state = 'released'
  WHERE order_id = p_order_id AND state = 'reserved';
END;
$$;

CREATE OR REPLACE FUNCTION public.consume_tele_oncology_call(p_user_id uuid, p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entitlement public.tele_oncology_entitlements%ROWTYPE;
  v_appointment public.appointments%ROWTYPE;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND user_id = p_user_id
    AND type = 'teleconsultation'
    AND status = 'scheduled'
    AND appointment_date <= now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A scheduled tele-oncology appointment is required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tele_oncology_usage WHERE appointment_id = p_appointment_id
  ) THEN
    SELECT e.* INTO v_entitlement
    FROM public.tele_oncology_usage u
    JOIN public.tele_oncology_entitlements e ON e.id = u.entitlement_id
    WHERE u.appointment_id = p_appointment_id;
    RETURN jsonb_build_object('allowed', true, 'duplicate', true,
      'entitlement_id', v_entitlement.id, 'remaining_calls', v_entitlement.remaining_calls);
  END IF;

  SELECT * INTO v_entitlement
  FROM public.tele_oncology_entitlements
  WHERE user_id = p_user_id AND remaining_calls > 0
    AND (valid_until IS NULL OR valid_until > now())
  ORDER BY valid_from
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'remaining_calls', 0);
  END IF;

  UPDATE public.tele_oncology_entitlements
  SET remaining_calls = remaining_calls - 1
  WHERE id = v_entitlement.id
  RETURNING * INTO v_entitlement;

  INSERT INTO public.tele_oncology_usage (entitlement_id, appointment_id)
  VALUES (v_entitlement.id, p_appointment_id);

  RETURN jsonb_build_object(
    'allowed', true,
    'entitlement_id', v_entitlement.id,
    'remaining_calls', v_entitlement.remaining_calls
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_payment_webhook_event(
  p_provider_event_id text,
  p_event_type text,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.payment_webhook_events (
    provider_event_id, event_type, payload, status, attempts, last_attempt_at
  ) VALUES (
    p_provider_event_id, p_event_type, p_payload, 'processing', 1, now()
  )
  ON CONFLICT (provider_event_id) DO UPDATE
  SET status = 'processing',
      attempts = public.payment_webhook_events.attempts + 1,
      last_error = NULL,
      last_attempt_at = now(),
      payload = EXCLUDED.payload
  WHERE public.payment_webhook_events.status <> 'processed'
    AND (
      public.payment_webhook_events.status <> 'processing'
      OR public.payment_webhook_events.last_attempt_at < now() - interval '5 minutes'
    )
  RETURNING id INTO v_id;
  RETURN v_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_payment_webhook_event(
  p_provider_event_id text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.payment_webhook_events
  SET status = CASE WHEN p_error IS NULL THEN 'processed' ELSE 'failed' END,
      processed_at = CASE WHEN p_error IS NULL THEN now() ELSE NULL END,
      last_error = p_error
  WHERE provider_event_id = p_provider_event_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_razorpay_payment_failed(
  p_provider_order_id text,
  p_provider_payment_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.payment_orders
  WHERE provider_order_id = p_provider_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002'; END IF;
  IF v_order.status IN ('paid', 'partially_refunded', 'refunded', 'cancelled') THEN RETURN false; END IF;
  IF v_order.status NOT IN ('pending', 'authorized') THEN RETURN false; END IF;

  UPDATE public.payment_orders
  SET status = 'pending',
      failure_reason = 'A provider payment attempt failed; this order remains retryable until reconciled.',
      updated_at = now()
  WHERE id = v_order.id;
  INSERT INTO public.payment_audit_log (action, order_id, details)
  VALUES ('payment.attempt_failed', v_order.id, jsonb_build_object('provider_payment_id', p_provider_payment_id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_payment_offer(
  p_actor_user_id uuid,
  p_kind text,
  p_entity_id text,
  p_offer_type text,
  p_amount_in_paise bigint,
  p_duration_days integer,
  p_included_usage integer,
  p_active boolean,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_terms jsonb
)
RETURNS public.payment_offers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer public.payment_offers%ROWTYPE;
  v_expected_usage integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_actor_user_id AND r.name IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Platform administrator role required' USING ERRCODE = '42501';
  END IF;
  IF p_amount_in_paise <= 0 OR p_entity_id IS NULL OR btrim(p_entity_id) = ''
     OR (p_valid_from IS NOT NULL AND p_valid_until IS NOT NULL AND p_valid_until <= p_valid_from) THEN
    RAISE EXCEPTION 'Invalid offer configuration' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'tele-oncology' THEN
    v_expected_usage := CASE p_offer_type WHEN 'monthly' THEN 35 WHEN 'one-time' THEN 1 ELSE NULL END;
    IF p_entity_id <> 'default' OR p_included_usage IS DISTINCT FROM v_expected_usage THEN
      RAISE EXCEPTION 'Tele-oncology quota and plan are fixed by the approved plan' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.payment_offers (
    kind, entity_id, offer_type, amount_in_paise, duration_days, included_usage,
    active, valid_from, valid_until, terms, updated_by, updated_at
  ) VALUES (
    p_kind, p_entity_id, p_offer_type, p_amount_in_paise, p_duration_days, p_included_usage,
    p_active, p_valid_from, p_valid_until, COALESCE(p_terms, '{}'::jsonb), p_actor_user_id, now()
  )
  ON CONFLICT (kind, entity_id, offer_type) DO UPDATE
  SET amount_in_paise = EXCLUDED.amount_in_paise,
      duration_days = EXCLUDED.duration_days,
      included_usage = EXCLUDED.included_usage,
      active = EXCLUDED.active,
      valid_from = EXCLUDED.valid_from,
      valid_until = EXCLUDED.valid_until,
      terms = EXCLUDED.terms,
      updated_by = EXCLUDED.updated_by,
      updated_at = now()
  RETURNING * INTO v_offer;

  INSERT INTO public.payment_audit_log (actor_user_id, action, details)
  VALUES (p_actor_user_id, 'payment_offer.updated', jsonb_build_object(
    'offer_id', v_offer.id, 'kind', p_kind, 'entity_id', p_entity_id,
    'offer_type', p_offer_type, 'amount_in_paise', p_amount_in_paise, 'active', p_active
  ));
  RETURN v_offer;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_commission_policy(
  p_actor_user_id uuid,
  p_policy_version text,
  p_basis_points integer,
  p_active boolean
)
RETURNS public.payment_commission_policies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.payment_commission_policies%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_actor_user_id AND r.name IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Platform administrator role required' USING ERRCODE = '42501';
  END IF;
  IF p_policy_version IS NULL OR btrim(p_policy_version) = ''
     OR p_basis_points NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Invalid commission policy' USING ERRCODE = '22023';
  END IF;
  IF p_active THEN
    UPDATE public.payment_commission_policies SET active = false, updated_at = now()
    WHERE active = true AND policy_version <> p_policy_version;
  END IF;
  INSERT INTO public.payment_commission_policies (policy_version, basis_points, active, updated_by, updated_at)
  VALUES (p_policy_version, p_basis_points, p_active, p_actor_user_id, now())
  ON CONFLICT (policy_version) DO UPDATE
  SET basis_points = EXCLUDED.basis_points, active = EXCLUDED.active,
      updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING * INTO v_policy;
  INSERT INTO public.payment_audit_log (actor_user_id, action, details)
  VALUES (p_actor_user_id, 'commission_policy.updated', jsonb_build_object(
    'policy_version', p_policy_version, 'basis_points', p_basis_points, 'active', p_active
  ));
  RETURN v_policy;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_payment_refund_request(
  p_order_id uuid,
  p_user_id uuid,
  p_amount_in_paise bigint,
  p_reason text,
  p_idempotency_key text
)
RETURNS public.payment_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_reserved bigint;
BEGIN
  SELECT * INTO v_order FROM public.payment_orders
  WHERE id = p_order_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_refund FROM public.payment_refunds
  WHERE order_id = p_order_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_refund; END IF;
  IF v_order.status NOT IN ('paid', 'partially_refunded') OR v_order.provider_payment_id IS NULL THEN
    RAISE EXCEPTION 'Only captured payments can be submitted for refund review' USING ERRCODE = '22023';
  END IF;
  IF p_amount_in_paise <= 0 OR p_amount_in_paise > v_order.amount_in_paise
     OR NULLIF(btrim(p_reason), '') IS NULL OR NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'Invalid refund request' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(amount_in_paise), 0) INTO v_reserved
  FROM public.payment_refunds
  WHERE order_id = p_order_id AND status IN ('requested', 'approved', 'processed');
  IF v_reserved + p_amount_in_paise > v_order.amount_in_paise THEN
    SELECT * INTO v_refund FROM public.payment_refunds
    WHERE order_id = p_order_id AND idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_refund; END IF;
    RAISE EXCEPTION 'Refund amount exceeds the remaining refundable balance' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payment_refunds (order_id, amount_in_paise, reason, status, created_by, idempotency_key)
  VALUES (p_order_id, p_amount_in_paise, left(btrim(p_reason), 500), 'requested', p_user_id, p_idempotency_key)
  ON CONFLICT (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
  RETURNING * INTO v_refund;
  IF v_refund.id IS NULL THEN
    SELECT * INTO v_refund FROM public.payment_refunds
    WHERE order_id = p_order_id AND idempotency_key = p_idempotency_key;
  END IF;
  INSERT INTO public.payment_audit_log (actor_user_id, action, order_id, details)
  VALUES (p_user_id, 'refund.requested', p_order_id, jsonb_build_object('amount_in_paise', p_amount_in_paise));
  RETURN v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_payment_refund(
  p_refund_id uuid,
  p_actor_user_id uuid
)
RETURNS public.payment_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_actor_user_id AND r.name IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Platform administrator role required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_refund FROM public.payment_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002'; END IF;
  IF v_refund.status = 'requested' THEN
    UPDATE public.payment_refunds SET status = 'approved', updated_at = now()
    WHERE id = p_refund_id RETURNING * INTO v_refund;
    INSERT INTO public.payment_audit_log (actor_user_id, action, order_id, details)
    VALUES (p_actor_user_id, 'refund.approved', v_refund.order_id, jsonb_build_object('refund_id', p_refund_id));
  ELSIF v_refund.status = 'failed' THEN
    UPDATE public.payment_refunds SET status = 'approved', failure_reason = NULL, updated_at = now()
    WHERE id = p_refund_id RETURNING * INTO v_refund;
  ELSIF v_refund.status <> 'approved' THEN
    RAISE EXCEPTION 'Refund is not awaiting processing' USING ERRCODE = '22023';
  END IF;
  RETURN v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_payment_refund(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_status text,
  p_failure_reason text DEFAULT NULL
)
RETURNS public.payment_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
  v_total_refunded bigint;
BEGIN
  SELECT * INTO v_refund FROM public.payment_refunds WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund request not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.payment_refunds
  SET provider_refund_id = COALESCE(p_provider_refund_id, provider_refund_id),
      status = CASE p_provider_status
        WHEN 'processed' THEN 'processed'
        WHEN 'failed' THEN 'failed'
        ELSE 'approved'
      END,
      failure_reason = p_failure_reason,
      updated_at = now()
  WHERE id = p_refund_id
  RETURNING * INTO v_refund;

  IF v_refund.status = 'processed' THEN
    SELECT COALESCE(sum(amount_in_paise), 0) INTO v_total_refunded
    FROM public.payment_refunds WHERE order_id = v_refund.order_id AND status = 'processed';
    UPDATE public.payment_orders
    SET status = CASE WHEN v_total_refunded >= amount_in_paise THEN 'refunded' ELSE 'partially_refunded' END,
        provider_refund_id = v_refund.provider_refund_id,
        updated_at = now()
    WHERE id = v_refund.order_id;
    UPDATE public.tele_oncology_entitlements
    SET remaining_calls = 0
    WHERE order_id = v_refund.order_id AND v_total_refunded >= (
      SELECT amount_in_paise FROM public.payment_orders WHERE id = v_refund.order_id
    );
  END IF;
  INSERT INTO public.payment_audit_log (action, order_id, details)
  VALUES ('refund.provider_status', v_refund.order_id,
    jsonb_build_object('refund_id', v_refund.id, 'provider_refund_id', v_refund.provider_refund_id, 'status', v_refund.status));
  RETURN v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_payment_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH expired AS (
    UPDATE public.payment_orders
    SET status = 'cancelled', failure_reason = 'Checkout expired before payment confirmation', updated_at = now()
    WHERE status IN ('pending', 'authorized') AND provider_order_id IS NULL
      AND expires_at IS NOT NULL AND expires_at <= now()
    RETURNING id
  )
  SELECT count(*)::integer INTO v_count FROM expired;

  PERFORM public.release_payment_order_stock(o.id)
  FROM public.payment_orders o
  WHERE o.status = 'cancelled' AND o.failure_reason = 'Checkout expired before payment confirmation'
    AND EXISTS (
      SELECT 1 FROM public.payment_stock_reservations r
      WHERE r.order_id = o.id AND r.state = 'reserved'
    );

  UPDATE public.cook_maid_bookings b
  SET status = 'cancelled'
  FROM public.payment_orders o
  WHERE b.payment_order_id = o.id AND o.status = 'cancelled'
    AND b.status = 'payment_pending' AND o.failure_reason = 'Checkout expired before payment confirmation';
  UPDATE public.appointments a
  SET status = 'payment_failed'
  FROM public.payment_orders o
  WHERE a.payment_order_id = o.id AND o.status = 'cancelled'
    AND a.status = 'payment_pending' AND o.failure_reason = 'Checkout expired before payment confirmation';
  UPDATE public.insurance_payment_applications a
  SET issuance_status = 'cancelled', updated_at = now()
  FROM public.payment_orders o
  WHERE a.order_id = o.id AND o.status = 'cancelled' AND a.issuance_status = 'payment_pending'
    AND o.failure_reason = 'Checkout expired before payment confirmation';
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_razorpay_payment(text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_razorpay_payment(text, text, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_payment_order_stock(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_payment_order_stock(uuid, uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.create_payment_homecare_booking(uuid, uuid, text, text, text, date, integer, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_homecare_booking(uuid, uuid, text, text, text, date, integer, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_payment_tele_appointment(uuid, uuid, text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_tele_appointment(uuid, uuid, text, text, timestamptz, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.release_payment_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_payment_order_stock(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_payment_webhook_event(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_webhook_event(text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.finish_payment_webhook_event(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_payment_webhook_event(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.mark_razorpay_payment_failed(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_razorpay_payment_failed(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_payment_offer(uuid, text, text, text, bigint, integer, integer, boolean, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_payment_offer(uuid, text, text, text, bigint, integer, integer, boolean, timestamptz, timestamptz, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.admin_upsert_commission_policy(uuid, text, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_commission_policy(uuid, text, integer, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.expire_stale_payment_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_payment_orders() TO service_role;
REVOKE ALL ON FUNCTION public.create_payment_refund_request(uuid, uuid, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment_refund_request(uuid, uuid, bigint, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_payment_refund(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_refund(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.finish_payment_refund(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_payment_refund(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.consume_tele_oncology_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_tele_oncology_call(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
