ALTER TABLE public.payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_status_check
  CHECK (status IN ('pending', 'authorized', 'paid', 'partially_refunded', 'failed', 'cancelled', 'refunded', 'captured_exception'));
ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS checkout_state text NOT NULL DEFAULT 'ready'
    CHECK (checkout_state IN ('initializing', 'ready', 'provider_creating', 'failed'));

ALTER TABLE public.payment_offers
  DROP CONSTRAINT IF EXISTS payment_offers_tele_oncology_plan_check;
ALTER TABLE public.payment_offers
  ADD CONSTRAINT payment_offers_tele_oncology_plan_check
  CHECK (
    kind <> 'tele-oncology'
    OR (offer_type = 'one-time' AND duration_days IS NULL AND included_usage = 1)
    OR (offer_type = 'monthly' AND duration_days = 30 AND included_usage = 35)
  );

ALTER TABLE public.pharmacy_orgs
  ADD COLUMN IF NOT EXISTS online_delivery_fee_in_paise bigint
    CHECK (online_delivery_fee_in_paise IS NULL OR online_delivery_fee_in_paise >= 0);

ALTER TABLE public.payment_commission_ledger
  ADD COLUMN IF NOT EXISTS delivery_fee_in_paise bigint NOT NULL DEFAULT 0
    CHECK (delivery_fee_in_paise >= 0);

DROP POLICY IF EXISTS "auth_create_donations" ON public.bpl_donations;
DROP POLICY IF EXISTS "update_own_donations" ON public.bpl_donations;
REVOKE INSERT, UPDATE, DELETE ON public.bpl_donations FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.pharmacy_online_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE RESTRICT,
  amount_in_paise bigint NOT NULL CHECK (amount_in_paise > 0),
  delivery_fee_in_paise bigint NOT NULL DEFAULT 0 CHECK (delivery_fee_in_paise >= 0),
  delivery_address text NOT NULL,
  status text NOT NULL DEFAULT 'pharmacy_review'
    CHECK (status IN ('pharmacy_review', 'accepted', 'preparing', 'dispatched', 'delivered', 'refund_pending', 'cancellation_requested', 'cancelled')),
  tracking_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_online_orders_patient_created
  ON public.pharmacy_online_orders (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pharmacy_online_orders_pharmacy_status
  ON public.pharmacy_online_orders (pharmacy_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_online_order_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  online_order_id uuid NOT NULL REFERENCES public.pharmacy_online_orders(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pharmacy_online_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_online_order_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pharmacy_online_orders_patient_read ON public.pharmacy_online_orders;
CREATE POLICY pharmacy_online_orders_patient_read ON public.pharmacy_online_orders
  FOR SELECT TO authenticated USING (patient_id = auth.uid());
DROP POLICY IF EXISTS pharmacy_online_orders_pharmacy_read ON public.pharmacy_online_orders;
CREATE POLICY pharmacy_online_orders_pharmacy_read ON public.pharmacy_online_orders
  FOR SELECT TO authenticated USING (public.is_pharmacy_member(pharmacy_id));
DROP POLICY IF EXISTS pharmacy_online_orders_admin_read ON public.pharmacy_online_orders;
CREATE POLICY pharmacy_online_orders_admin_read ON public.pharmacy_online_orders
  FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS pharmacy_online_order_audit_read ON public.pharmacy_online_order_audit;
CREATE POLICY pharmacy_online_order_audit_read ON public.pharmacy_online_order_audit
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.pharmacy_online_orders o
      WHERE o.id = online_order_id
        AND (o.patient_id = auth.uid() OR public.is_pharmacy_member(o.pharmacy_id) OR public.is_platform_admin())
    )
  );

GRANT SELECT ON public.pharmacy_online_orders, public.pharmacy_online_order_audit TO authenticated;

DROP POLICY IF EXISTS payment_items_select_pharmacy ON public.payment_order_items;
CREATE POLICY payment_items_select_pharmacy ON public.payment_order_items
  FOR SELECT TO authenticated USING (
    seller_id IS NOT NULL AND public.is_pharmacy_member(seller_id)
  );

ALTER TABLE public.insurance_payment_applications
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_notes text;
ALTER TABLE public.insurance_payment_applications
  DROP CONSTRAINT IF EXISTS insurance_payment_applications_issuance_status_check;
ALTER TABLE public.insurance_payment_applications
  ADD CONSTRAINT insurance_payment_applications_issuance_status_check
  CHECK (issuance_status IN ('payment_pending', 'pending_issuance', 'under_review', 'issued', 'approved', 'declined', 'rejected', 'cancelled', 'refunded'));

DROP POLICY IF EXISTS insurance_payment_applications_admin_read ON public.insurance_payment_applications;
CREATE POLICY insurance_payment_applications_admin_read ON public.insurance_payment_applications
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.guard_payment_teleconsultation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_requires_order_validation boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.payment_order_id IS NOT NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
      RAISE EXCEPTION 'Payment-backed appointments cannot be deleted by a client' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.payment_order_id IS NOT NULL
     AND COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NEW.status = 'cancelled'
       AND NEW.type IS NOT DISTINCT FROM OLD.type
       AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
       AND NEW.payment_order_id IS NOT DISTINCT FROM OLD.payment_order_id
       AND EXISTS (
         SELECT 1 FROM public.payment_orders
         WHERE id = OLD.payment_order_id AND status = 'refunded'
       ) THEN
      RETURN NEW;
    END IF;
    IF auth.uid() = OLD.doctor_id
       AND OLD.status = 'scheduled'
       AND NEW.status IN ('completed', 'cancelled')
       AND NEW.type IS NOT DISTINCT FROM OLD.type
       AND NEW.appointment_date IS NOT DISTINCT FROM OLD.appointment_date
       AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
       AND NEW.doctor_id IS NOT DISTINCT FROM OLD.doctor_id
       AND NEW.payment_order_id IS NOT DISTINCT FROM OLD.payment_order_id THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Payment-backed appointments may only be changed through their authorized workflow' USING ERRCODE = '42501';
  END IF;

  IF NEW.type = 'teleconsultation' OR (TG_OP = 'UPDATE' AND OLD.type = 'teleconsultation') THEN
    IF NEW.type <> 'teleconsultation' THEN
      RAISE EXCEPTION 'Paid tele-oncology appointments cannot be converted to another appointment type' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(auth.role(), '') <> 'service_role' OR NEW.payment_order_id IS NULL THEN
      RAISE EXCEPTION 'Tele-oncology appointments must be created through paid checkout' USING ERRCODE = '42501';
    END IF;
    v_requires_order_validation := TG_OP = 'INSERT';
    IF TG_OP = 'UPDATE' THEN
      v_requires_order_validation :=
        NEW.type IS DISTINCT FROM OLD.type
        OR NEW.user_id IS DISTINCT FROM OLD.user_id
        OR NEW.payment_order_id IS DISTINCT FROM OLD.payment_order_id;
    END IF;
    IF v_requires_order_validation THEN
      SELECT * INTO v_order FROM public.payment_orders
      WHERE id = NEW.payment_order_id
        AND user_id = NEW.user_id
        AND kind = 'tele-oncology'
        AND status = 'pending';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'A matching pending tele-oncology payment order is required' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_payment_teleconsultation_write ON public.appointments;
CREATE TRIGGER guard_payment_teleconsultation_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_payment_teleconsultation();

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
    AND payment_order_id IS NOT NULL
    AND status = 'scheduled'
    AND appointment_date <= now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A paid, scheduled tele-oncology appointment is required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_orders o
    WHERE o.id = v_appointment.payment_order_id
      AND o.user_id = p_user_id
      AND o.kind = 'tele-oncology'
      AND o.status = 'paid'
  ) OR EXISTS (
    SELECT 1 FROM public.payment_refunds r
    WHERE r.order_id = v_appointment.payment_order_id
      AND r.status IN ('requested', 'approved')
  ) THEN
    RAISE EXCEPTION 'The appointment payment is not confirmed' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.tele_oncology_usage WHERE appointment_id = p_appointment_id) THEN
    SELECT e.* INTO v_entitlement
    FROM public.tele_oncology_usage u
    JOIN public.tele_oncology_entitlements e ON e.id = u.entitlement_id
    WHERE u.appointment_id = p_appointment_id;
    RETURN jsonb_build_object('allowed', true, 'duplicate', true,
      'entitlement_id', v_entitlement.id, 'remaining_calls', v_entitlement.remaining_calls);
  END IF;

  SELECT * INTO v_entitlement
  FROM public.tele_oncology_entitlements
  WHERE user_id = p_user_id
    AND valid_from <= now()
    AND remaining_calls > 0
    AND (valid_until IS NULL OR valid_until > now())
  ORDER BY valid_from, created_at
  FOR UPDATE
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'remaining_calls', 0);
  END IF;

  UPDATE public.tele_oncology_entitlements
  SET remaining_calls = remaining_calls - 1
  WHERE id = v_entitlement.id AND remaining_calls > 0
  RETURNING * INTO v_entitlement;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'remaining_calls', 0);
  END IF;

  INSERT INTO public.tele_oncology_usage (entitlement_id, appointment_id)
  VALUES (v_entitlement.id, p_appointment_id);
  INSERT INTO public.payment_audit_log (actor_user_id, action, order_id, details)
  VALUES (p_user_id, 'tele_oncology.call_consumed', v_appointment.payment_order_id,
    jsonb_build_object('appointment_id', p_appointment_id, 'entitlement_id', v_entitlement.id));

  RETURN jsonb_build_object(
    'allowed', true,
    'entitlement_id', v_entitlement.id,
    'remaining_calls', v_entitlement.remaining_calls
  );
END;
$$;

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
  v_item public.payment_order_items%ROWTYPE;
  v_offer public.payment_offers%ROWTYPE;
  v_appointment_id uuid;
  v_plan text;
  v_calls integer;
  v_validity integer;
BEGIN
  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE provider_order_id = p_provider_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002'; END IF;
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
    v_plan := v_order.notes->>'plan';
    v_calls := NULLIF(v_order.notes->>'includedCalls', '')::integer;
    v_validity := NULLIF(v_order.notes->>'durationDays', '')::integer;
    IF v_plan IS NULL OR v_plan NOT IN ('one-time', 'monthly')
       OR NULLIF(v_order.notes->>'offerId', '') IS NULL
       OR NULLIF(v_order.notes->>'offerAmountInPaise', '')::bigint IS DISTINCT FROM v_order.amount_in_paise
       OR (v_plan = 'one-time' AND (v_calls IS DISTINCT FROM 1 OR v_validity IS NOT NULL))
       OR (v_plan = 'monthly' AND (v_calls IS DISTINCT FROM 35 OR v_validity IS DISTINCT FROM 30)) THEN
      RAISE EXCEPTION 'Tele-oncology order snapshot is invalid' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_offer
    FROM public.payment_offers
    WHERE id = (v_order.notes->>'offerId')::uuid
      AND kind = 'tele-oncology'
      AND entity_id = 'default'
      AND offer_type = v_plan;
    IF NOT FOUND THEN RAISE EXCEPTION 'The referenced tele-oncology offer does not exist' USING ERRCODE = '22023'; END IF;

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
      IF v_appointment_id IS NULL THEN RAISE EXCEPTION 'Paid consultation has no reserved appointment' USING ERRCODE = 'P0002'; END IF;
    END IF;
  ELSIF v_order.kind = 'medicine' THEN
    SELECT * INTO v_item
    FROM public.payment_order_items
    WHERE order_id = v_order.id AND seller_id IS NOT NULL
    FOR SHARE;
    IF NOT FOUND
       OR NOT (v_item.terms ? 'commissionBasisPoints')
       OR NOT (v_item.terms ? 'commissionPolicyVersion')
       OR NOT EXISTS (
         SELECT 1 FROM public.payment_stock_reservations
         WHERE order_id = v_order.id AND state = 'reserved'
       ) THEN
      RAISE EXCEPTION 'Pharmacy order, commission policy, or stock reservation is incomplete' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.payment_commission_ledger (
      order_id, seller_id, gross_amount_in_paise, commission_amount_in_paise,
      seller_payable_in_paise, policy_version
    ) VALUES (
      v_order.id,
      v_item.seller_id,
      v_item.total_amount_in_paise,
      floor(COALESCE((v_item.terms->>'commissionableAmountInPaise')::numeric, v_item.total_amount_in_paise)
        * (v_item.terms->>'commissionBasisPoints')::numeric / 10000)::bigint,
      v_item.total_amount_in_paise -
        floor(COALESCE((v_item.terms->>'commissionableAmountInPaise')::numeric, v_item.total_amount_in_paise)
          * (v_item.terms->>'commissionBasisPoints')::numeric / 10000)::bigint,
      v_item.terms->>'commissionPolicyVersion'
    )
    ON CONFLICT (order_id, seller_id) DO NOTHING;

    INSERT INTO public.payment_seller_settlements (commission_ledger_id, status)
    SELECT id, 'approval_required'
    FROM public.payment_commission_ledger
    WHERE order_id = v_order.id
    ON CONFLICT (commission_ledger_id) DO NOTHING;

    UPDATE public.pharmacy_stock_batches b
    SET qty_on_hand = b.qty_on_hand - r.quantity,
        qty_reserved = b.qty_reserved - r.quantity,
        updated_at = now()
    FROM public.payment_stock_reservations r
    WHERE r.order_id = v_order.id AND r.state = 'reserved'
      AND b.id = r.batch_id
      AND b.qty_on_hand >= r.quantity
      AND b.qty_reserved >= r.quantity;
    IF EXISTS (
      SELECT 1 FROM public.payment_stock_reservations r
      WHERE r.order_id = v_order.id AND r.state = 'reserved'
        AND NOT EXISTS (
          SELECT 1 FROM public.pharmacy_stock_batches b
          WHERE b.id = r.batch_id
            AND b.qty_on_hand >= r.quantity
            AND b.qty_reserved >= r.quantity
        )
    ) THEN RAISE EXCEPTION 'Reserved pharmacy inventory changed before payment capture' USING ERRCODE = '22023'; END IF;
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
    IF NOT FOUND THEN RAISE EXCEPTION 'Paid home-care booking reservation was not found' USING ERRCODE = 'P0002'; END IF;
  ELSIF v_order.kind = 'insurance' THEN
    UPDATE public.insurance_payment_applications
    SET issuance_status = 'pending_issuance', updated_at = now()
    WHERE order_id = v_order.id AND issuance_status = 'payment_pending';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pending insurance application was not found' USING ERRCODE = 'P0002'; END IF;
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

CREATE OR REPLACE FUNCTION public.authorize_tele_oncology_call(p_user_id uuid, p_appointment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appointment public.appointments%ROWTYPE;
  v_entitlement public.tele_oncology_entitlements%ROWTYPE;
  v_used boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_appointment
  FROM public.appointments
  WHERE id = p_appointment_id
    AND user_id = p_user_id
    AND type = 'teleconsultation'
    AND payment_order_id IS NOT NULL
    AND status = 'scheduled'
    AND appointment_date <= now()
  FOR SHARE;
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM public.payment_orders o
    WHERE o.id = v_appointment.payment_order_id
      AND o.user_id = p_user_id
      AND o.kind = 'tele-oncology'
      AND o.status = 'paid'
  ) THEN
    RAISE EXCEPTION 'A paid, scheduled tele-oncology appointment is required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_refunds r
    WHERE r.order_id = v_appointment.payment_order_id
      AND r.status IN ('requested', 'approved')
  ) THEN
    RAISE EXCEPTION 'Consultation access is paused while cancellation or refund is under review' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.tele_oncology_usage
    WHERE appointment_id = p_appointment_id
  ) INTO v_used;
  IF v_used THEN
    SELECT e.* INTO v_entitlement
    FROM public.tele_oncology_usage u
    JOIN public.tele_oncology_entitlements e ON e.id = u.entitlement_id
    WHERE u.appointment_id = p_appointment_id;
    RETURN jsonb_build_object('allowed', true, 'already_consumed', true,
      'remaining_calls', v_entitlement.remaining_calls);
  END IF;

  SELECT * INTO v_entitlement
  FROM public.tele_oncology_entitlements
  WHERE user_id = p_user_id
    AND valid_from <= now()
    AND remaining_calls > 0
    AND (valid_until IS NULL OR valid_until > now())
  ORDER BY valid_from, created_at
  LIMIT 1;
  RETURN jsonb_build_object(
    'allowed', FOUND,
    'already_consumed', false,
    'remaining_calls', COALESCE(v_entitlement.remaining_calls, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_pharmacy_online_delivery_fee(
  p_actor_user_id uuid,
  p_pharmacy_id uuid,
  p_delivery_fee_in_paise bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_delivery_fee_in_paise < 0 OR NOT EXISTS (
    SELECT 1 FROM public.pharmacy_members m
    WHERE m.org_id = p_pharmacy_id AND m.user_id = p_actor_user_id
      AND m.staff_role = 'pharmacy_admin' AND m.is_active = true
  ) THEN
    RAISE EXCEPTION 'An active pharmacy administrator and a non-negative delivery fee are required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pharmacy_orgs
  SET online_delivery_fee_in_paise = p_delivery_fee_in_paise,
      home_delivery = true,
      updated_at = now()
  WHERE id = p_pharmacy_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pharmacy not found' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, details)
  VALUES (p_pharmacy_id, p_actor_user_id, 'online_delivery_fee.updated', 'pharmacy_orgs',
    jsonb_build_object('delivery_fee_in_paise', p_delivery_fee_in_paise));
  RETURN p_delivery_fee_in_paise;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_incomplete_payment_checkout(p_order_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.payment_orders
  WHERE id = p_order_id AND user_id = p_user_id
    AND status = 'pending'
    AND provider_order_id IS NULL
    AND checkout_state = 'initializing'
    AND updated_at < now() - interval '5 minutes'
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE public.payment_orders
  SET status = 'failed',
      checkout_state = 'failed',
      failure_reason = 'Checkout setup expired before provider order creation',
      updated_at = now()
  WHERE id = v_order.id;
  PERFORM public.release_payment_order_stock(v_order.id);
  UPDATE public.cook_maid_bookings
  SET status = 'cancelled'
  WHERE payment_order_id = v_order.id AND status = 'payment_pending';
  UPDATE public.appointments
  SET status = 'payment_failed'
  WHERE payment_order_id = v_order.id AND status = 'payment_pending';
  UPDATE public.insurance_payment_applications
  SET issuance_status = 'cancelled', updated_at = now()
  WHERE order_id = v_order.id AND issuance_status = 'payment_pending';
  INSERT INTO public.payment_audit_log (action, order_id, details)
  VALUES ('payment.checkout_setup_expired', v_order.id, '{}'::jsonb);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_payment_provider_order(p_order_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.payment_orders
  WHERE id = p_order_id AND user_id = p_user_id
    AND status = 'pending' AND provider_order_id IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_order.checkout_state = 'provider_creating'
     AND v_order.updated_at >= now() - interval '5 minutes' THEN
    RETURN false;
  END IF;
  IF v_order.checkout_state NOT IN ('ready', 'provider_creating') THEN RETURN false; END IF;
  UPDATE public.payment_orders
  SET checkout_state = 'provider_creating', updated_at = now()
  WHERE id = v_order.id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_payment_provider_order(p_order_id uuid, p_user_id uuid, p_provider_order_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.payment_orders
  WHERE id = p_order_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'pending' THEN RETURN false; END IF;
  IF v_order.provider_order_id IS NOT NULL THEN
    RETURN v_order.provider_order_id = p_provider_order_id;
  END IF;
  IF v_order.checkout_state <> 'provider_creating'
     OR NULLIF(btrim(p_provider_order_id), '') IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.payment_orders
  SET provider_order_id = p_provider_order_id,
      checkout_state = 'ready',
      failure_reason = NULL,
      updated_at = now()
  WHERE id = v_order.id;
  INSERT INTO public.payment_audit_log (actor_user_id, action, order_id, details)
  VALUES (p_user_id, 'payment.provider_order_linked', v_order.id,
    jsonb_build_object('provider_order_id', p_provider_order_id));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.capture_pharmacy_online_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.payment_order_items%ROWTYPE;
  v_delivery_fee bigint;
BEGIN
  IF NEW.kind <> 'medicine' THEN RETURN NEW; END IF;
  SELECT * INTO v_item FROM public.payment_order_items
  WHERE order_id = NEW.id AND seller_id IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A pharmacy order item is required before medicine payment capture' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.payment_stock_reservations
    WHERE order_id = NEW.id AND state = 'committed'
  ) THEN
    RAISE EXCEPTION 'Reserved pharmacy inventory is required before payment capture' USING ERRCODE = '22023';
  END IF;

  v_delivery_fee := COALESCE((v_item.terms->>'deliveryFeeInPaise')::bigint, 0);
  IF NULLIF(btrim(COALESCE(NEW.notes->>'deliveryAddress', '')), '') IS NULL THEN
    RAISE EXCEPTION 'A delivery address is required before medicine payment capture' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.pharmacy_online_orders (
    payment_order_id, patient_id, pharmacy_id, amount_in_paise,
    delivery_fee_in_paise, delivery_address, status
  ) VALUES (
    NEW.id, NEW.user_id, v_item.seller_id, NEW.amount_in_paise,
    v_delivery_fee, COALESCE(NEW.notes->>'deliveryAddress', ''), 'pharmacy_review'
  )
  ON CONFLICT (payment_order_id) DO NOTHING;

  UPDATE public.pharmacy_stock_batches b
  SET qty_on_hand = b.qty_on_hand + r.quantity,
      qty_reserved = b.qty_reserved + r.quantity,
      updated_at = now()
  FROM public.payment_stock_reservations r
  WHERE r.order_id = NEW.id AND r.state = 'committed' AND b.id = r.batch_id;
  DELETE FROM public.pharmacy_stock_movements
  WHERE reference = NEW.id::text
    AND movement_type = 'dispense'
    AND reason = 'Paid online order';
  UPDATE public.payment_stock_reservations
  SET state = 'reserved'
  WHERE order_id = NEW.id AND state = 'committed';

  INSERT INTO public.pharmacy_online_order_audit (online_order_id, actor_user_id, action, details)
  SELECT id, NEW.user_id, 'order.payment_captured', jsonb_build_object('payment_order_id', NEW.id)
  FROM public.pharmacy_online_orders WHERE payment_order_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_capture_creates_pharmacy_online_order ON public.payment_orders;
CREATE CONSTRAINT TRIGGER payment_capture_creates_pharmacy_online_order
  AFTER UPDATE OF status ON public.payment_orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.kind = 'medicine')
  EXECUTE FUNCTION public.capture_pharmacy_online_order();

CREATE OR REPLACE FUNCTION public.adjust_pharmacy_commission_delivery_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.payment_order_items%ROWTYPE;
  v_commissionable bigint;
  v_delivery_fee bigint;
  v_basis_points integer;
  v_commission bigint;
BEGIN
  SELECT * INTO v_item FROM public.payment_order_items
  WHERE order_id = NEW.order_id AND seller_id = NEW.seller_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_commissionable := COALESCE((v_item.terms->>'commissionableAmountInPaise')::bigint, v_item.total_amount_in_paise);
  v_delivery_fee := COALESCE((v_item.terms->>'deliveryFeeInPaise')::bigint, 0);
  v_basis_points := COALESCE((v_item.terms->>'commissionBasisPoints')::integer, 0);
  v_commission := floor(v_commissionable * v_basis_points / 10000.0)::bigint;
  UPDATE public.payment_commission_ledger
  SET gross_amount_in_paise = v_item.total_amount_in_paise,
      delivery_fee_in_paise = v_delivery_fee,
      commission_amount_in_paise = v_commission,
      seller_payable_in_paise = v_item.total_amount_in_paise - v_commission
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_commission_tracks_delivery_fee ON public.payment_commission_ledger;
CREATE TRIGGER payment_commission_tracks_delivery_fee
  AFTER INSERT ON public.payment_commission_ledger
  FOR EACH ROW EXECUTE FUNCTION public.adjust_pharmacy_commission_delivery_fee();

CREATE OR REPLACE FUNCTION public.request_pharmacy_order_cancellation(
  p_payment_order_id uuid,
  p_patient_id uuid,
  p_idempotency_key text
)
RETURNS public.payment_refunds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_online_order public.pharmacy_online_orders%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_reserved bigint;
BEGIN
  SELECT * INTO v_order FROM public.payment_orders
  WHERE id = p_payment_order_id AND user_id = p_patient_id AND kind = 'medicine'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Medicine payment order not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_online_order FROM public.pharmacy_online_orders
  WHERE payment_order_id = p_payment_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pharmacy order not found' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_refund FROM public.payment_refunds
  WHERE order_id = p_payment_order_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN RETURN v_refund; END IF;
  IF v_order.status <> 'paid' OR v_online_order.status <> 'pharmacy_review' THEN
    RAISE EXCEPTION 'Only orders awaiting pharmacy review can be cancelled online' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'A cancellation request key is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(amount_in_paise), 0) INTO v_reserved
  FROM public.payment_refunds
  WHERE order_id = p_payment_order_id AND status IN ('requested', 'approved', 'processed');
  IF v_reserved > 0 THEN RAISE EXCEPTION 'A refund request is already in progress' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.payment_refunds (
    order_id, amount_in_paise, reason, status, created_by, idempotency_key
  ) VALUES (
    p_payment_order_id, v_order.amount_in_paise,
    'Patient requested cancellation before pharmacy review',
    'requested', p_patient_id, p_idempotency_key
  ) RETURNING * INTO v_refund;

  UPDATE public.pharmacy_online_orders
  SET status = 'cancellation_requested', updated_at = now()
  WHERE id = v_online_order.id;
  INSERT INTO public.pharmacy_online_order_audit (online_order_id, actor_user_id, action)
  VALUES (v_online_order.id, p_patient_id, 'order.cancellation_requested');
  RETURN v_refund;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_pharmacy_online_order(
  p_payment_order_id uuid,
  p_actor_user_id uuid,
  p_next_status text,
  p_tracking_reference text DEFAULT NULL
)
RETURNS public.pharmacy_online_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.pharmacy_online_orders%ROWTYPE;
  v_staff_role text;
  v_is_admin boolean;
BEGIN
  SELECT * INTO v_order FROM public.pharmacy_online_orders
  WHERE payment_order_id = p_payment_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pharmacy order not found' USING ERRCODE = 'P0002'; END IF;

  SELECT m.staff_role INTO v_staff_role
  FROM public.pharmacy_members m
  WHERE m.org_id = v_order.pharmacy_id AND m.user_id = p_actor_user_id AND m.is_active = true
  ORDER BY CASE m.staff_role
    WHEN 'pharmacy_admin' THEN 1 WHEN 'pharmacist' THEN 2 WHEN 'store_staff' THEN 3 ELSE 4 END
  LIMIT 1;
  v_is_admin := EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_actor_user_id AND r.name IN ('admin', 'super_admin')
  );
  IF v_staff_role IS NULL AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Pharmacy membership or administrator access is required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (v_order.status = 'pharmacy_review' AND p_next_status IN ('accepted', 'refund_pending'))
    OR (v_order.status = 'accepted' AND p_next_status = 'preparing')
    OR (v_order.status = 'preparing' AND p_next_status = 'dispatched')
    OR (v_order.status = 'dispatched' AND p_next_status = 'delivered')
  ) THEN
    RAISE EXCEPTION 'Invalid pharmacy order status transition' USING ERRCODE = '22023';
  END IF;
  IF NOT v_is_admin AND (
    (p_next_status IN ('accepted', 'refund_pending') AND v_staff_role NOT IN ('pharmacy_admin', 'pharmacist', 'store_staff'))
    OR (p_next_status = 'preparing' AND v_staff_role NOT IN ('pharmacy_admin', 'pharmacist', 'store_staff'))
    OR (p_next_status IN ('dispatched', 'delivered') AND v_staff_role NOT IN ('pharmacy_admin', 'delivery_staff'))
  ) THEN
    RAISE EXCEPTION 'This pharmacy role cannot make the requested order transition' USING ERRCODE = '42501';
  END IF;
  IF p_next_status = 'dispatched' AND NULLIF(btrim(p_tracking_reference), '') IS NULL THEN
    RAISE EXCEPTION 'A dispatch reference is required' USING ERRCODE = '22023';
  END IF;

  IF p_next_status = 'dispatched' THEN
    PERFORM 1 FROM public.payment_orders
    WHERE id = v_order.payment_order_id AND status = 'paid'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Paid order is required for dispatch' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_stock_reservations
      WHERE order_id = v_order.payment_order_id AND state = 'reserved'
    ) THEN RAISE EXCEPTION 'Reserved stock is not available for dispatch' USING ERRCODE = '22023'; END IF;

    UPDATE public.pharmacy_stock_batches b
    SET qty_on_hand = b.qty_on_hand - r.quantity,
        qty_reserved = b.qty_reserved - r.quantity,
        updated_at = now()
    FROM public.payment_stock_reservations r
    WHERE r.order_id = v_order.payment_order_id AND r.state = 'reserved'
      AND b.id = r.batch_id AND b.qty_on_hand >= r.quantity AND b.qty_reserved >= r.quantity;
    IF EXISTS (
      SELECT 1 FROM public.payment_stock_reservations
      WHERE order_id = v_order.payment_order_id AND state = 'reserved'
        AND NOT EXISTS (
          SELECT 1 FROM public.pharmacy_stock_batches b
          WHERE b.id = payment_stock_reservations.batch_id
            AND b.qty_on_hand >= payment_stock_reservations.quantity
            AND b.qty_reserved >= payment_stock_reservations.quantity
        )
    ) THEN RAISE EXCEPTION 'Reserved inventory changed before dispatch' USING ERRCODE = '22023'; END IF;
    INSERT INTO public.pharmacy_stock_movements (
      pharmacy_id, product_id, batch_id, movement_type, quantity, reason, reference
    )
    SELECT b.pharmacy_id, b.product_id, b.id, 'dispense', -r.quantity,
      'Pharmacy order dispatched', v_order.payment_order_id::text
    FROM public.payment_stock_reservations r
    JOIN public.pharmacy_stock_batches b ON b.id = r.batch_id
    WHERE r.order_id = v_order.payment_order_id AND r.state = 'reserved';
    UPDATE public.payment_stock_reservations
    SET state = 'committed'
    WHERE order_id = v_order.payment_order_id AND state = 'reserved';
  ELSIF p_next_status IN ('refund_pending') THEN
    INSERT INTO public.payment_refunds (
      order_id, amount_in_paise, reason, status, created_by, idempotency_key
    )
    SELECT v_order.payment_order_id, o.amount_in_paise,
      'Pharmacy rejected the order', 'requested', p_actor_user_id,
      'pharmacy-reject:' || v_order.payment_order_id::text
    FROM public.payment_orders o WHERE o.id = v_order.payment_order_id
    ON CONFLICT (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;

  UPDATE public.pharmacy_online_orders
  SET status = p_next_status,
      tracking_reference = CASE WHEN p_next_status = 'dispatched' THEN left(btrim(p_tracking_reference), 200) ELSE tracking_reference END,
      updated_at = now()
  WHERE id = v_order.id
  RETURNING * INTO v_order;
  INSERT INTO public.pharmacy_online_order_audit (online_order_id, actor_user_id, action, details)
  VALUES (v_order.id, p_actor_user_id, 'order.status_changed',
    jsonb_build_object('status', p_next_status, 'tracking_reference', v_order.tracking_reference));
  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_captured_payment_exception(
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
  v_refund_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.payment_orders
  WHERE provider_order_id = p_provider_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002'; END IF;
  IF v_order.amount_in_paise <> p_amount_in_paise OR v_order.currency <> p_currency THEN
    RAISE EXCEPTION 'Captured payment does not match the stored order' USING ERRCODE = '22023';
  END IF;
  IF v_order.status = 'captured_exception' AND v_order.provider_payment_id = p_provider_payment_id THEN
    RETURN jsonb_build_object('status', 'captured_exception', 'duplicate', true, 'order_id', v_order.id);
  END IF;
  IF v_order.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Only a late capture on a cancelled order is an exception' USING ERRCODE = '22023';
  END IF;

  UPDATE public.payment_orders
  SET status = 'captured_exception',
      provider_payment_id = p_provider_payment_id,
      captured_at = now(),
      failure_reason = 'Provider captured payment after local checkout expiry; fulfillment is held for refund review.',
      updated_at = now()
  WHERE id = v_order.id;

  INSERT INTO public.payment_refunds (
    order_id, amount_in_paise, reason, status, created_by, idempotency_key
  ) VALUES (
    v_order.id, v_order.amount_in_paise,
    'Late provider capture after checkout expiry; manual refund processing required',
    'requested', v_order.user_id, 'late-capture:' || v_order.id::text
  )
  ON CONFLICT (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO UPDATE SET updated_at = now()
  RETURNING id INTO v_refund_id;

  INSERT INTO public.payment_audit_log (action, order_id, details)
  VALUES ('payment.captured_exception', v_order.id,
    jsonb_build_object('provider_payment_id', p_provider_payment_id, 'refund_id', v_refund_id));
  RETURN jsonb_build_object('status', 'captured_exception', 'duplicate', false,
    'order_id', v_order.id, 'refund_id', v_refund_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_stale_provider_payment_order(
  p_order_id uuid,
  p_provider_status text,
  p_has_unresolved_payment boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
BEGIN
  IF p_has_unresolved_payment OR p_provider_status NOT IN ('created', 'attempted') THEN
    RAISE EXCEPTION 'Provider order state is not safe to expire' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_order FROM public.payment_orders
  WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_order.status NOT IN ('pending', 'authorized')
     OR v_order.provider_order_id IS NULL
     OR v_order.expires_at IS NULL
     OR v_order.expires_at > now() THEN
    RETURN false;
  END IF;

  UPDATE public.payment_orders
  SET status = 'cancelled',
      failure_reason = 'Checkout expired after provider reconciliation found no captured payment',
      updated_at = now()
  WHERE id = v_order.id;
  PERFORM public.release_payment_order_stock(v_order.id);
  UPDATE public.cook_maid_bookings
  SET status = 'cancelled'
  WHERE payment_order_id = v_order.id AND status = 'payment_pending';
  UPDATE public.appointments
  SET status = 'payment_failed'
  WHERE payment_order_id = v_order.id AND status = 'payment_pending';
  UPDATE public.insurance_payment_applications
  SET issuance_status = 'cancelled', updated_at = now()
  WHERE order_id = v_order.id AND issuance_status = 'payment_pending';
  INSERT INTO public.payment_audit_log (action, order_id, details)
  VALUES ('payment.expired_after_reconciliation', v_order.id,
    jsonb_build_object('provider_order_id', v_order.provider_order_id, 'provider_status', p_provider_status));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_insurance_payment_application(
  p_application_id uuid,
  p_actor_user_id uuid,
  p_status text,
  p_review_notes text DEFAULT NULL
)
RETURNS public.insurance_payment_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application public.insurance_payment_applications%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_actor_user_id AND r.name IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Platform administrator role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('under_review', 'declined') THEN
    RAISE EXCEPTION 'Only review or decline can be recorded here; policy issuance requires insurer confirmation' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_application
  FROM public.insurance_payment_applications
  WHERE id = p_application_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insurance application not found' USING ERRCODE = 'P0002'; END IF;
  IF v_application.issuance_status NOT IN ('pending_issuance', 'under_review') THEN
    RAISE EXCEPTION 'Insurance application is not awaiting review' USING ERRCODE = '22023';
  END IF;

  UPDATE public.insurance_payment_applications
  SET issuance_status = p_status,
      reviewed_by = p_actor_user_id,
      review_notes = left(NULLIF(btrim(p_review_notes), ''), 1000),
      updated_at = now()
  WHERE id = p_application_id
  RETURNING * INTO v_application;
  IF p_status = 'declined' THEN
    INSERT INTO public.payment_refunds (
      order_id, amount_in_paise, reason, status, created_by, idempotency_key
    )
    SELECT o.id, o.amount_in_paise,
      'Insurance application declined by administrator', 'requested', p_actor_user_id,
      'insurance-decline:' || p_application_id::text
    FROM public.payment_orders o
    WHERE o.id = v_application.order_id AND o.status = 'paid'
    ON CONFLICT (order_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
  END IF;
  INSERT INTO public.payment_audit_log (actor_user_id, action, order_id, details)
  VALUES (p_actor_user_id, 'insurance_application.reviewed', v_application.order_id,
    jsonb_build_object('application_id', p_application_id, 'status', p_status));
  RETURN v_application;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_pharmacy_order_after_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_online_order public.pharmacy_online_orders%ROWTYPE;
  v_refunded bigint;
BEGIN
  IF NEW.status <> 'processed' OR OLD.status = 'processed' THEN RETURN NEW; END IF;
  SELECT * INTO v_order FROM public.payment_orders WHERE id = NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(amount_in_paise), 0) INTO v_refunded
  FROM public.payment_refunds WHERE order_id = NEW.order_id AND status = 'processed';
  IF v_refunded < v_order.amount_in_paise THEN RETURN NEW; END IF;

  UPDATE public.payment_commission_ledger
  SET status = 'reversed'
  WHERE order_id = NEW.order_id;
  UPDATE public.payment_seller_settlements s
  SET status = 'reversed', updated_at = now()
  FROM public.payment_commission_ledger l
  WHERE l.order_id = NEW.order_id
    AND s.commission_ledger_id = l.id
    AND s.status <> 'settled';

  SELECT * INTO v_online_order FROM public.pharmacy_online_orders
  WHERE payment_order_id = NEW.order_id FOR UPDATE;
  IF FOUND AND v_online_order.status IN ('cancellation_requested', 'refund_pending') THEN
    PERFORM public.release_payment_order_stock(NEW.order_id);
    UPDATE public.pharmacy_online_orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_online_order.id;
    INSERT INTO public.pharmacy_online_order_audit (online_order_id, action, details)
    VALUES (v_online_order.id, 'order.cancelled_after_full_refund',
      jsonb_build_object('refund_id', NEW.id));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_payment_fulfillment_after_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_refunded bigint;
BEGIN
  IF NEW.status <> 'processed' OR OLD.status = 'processed' THEN RETURN NEW; END IF;
  SELECT * INTO v_order FROM public.payment_orders WHERE id = NEW.order_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(sum(amount_in_paise), 0) INTO v_refunded
  FROM public.payment_refunds WHERE order_id = NEW.order_id AND status = 'processed';
  IF v_refunded < v_order.amount_in_paise THEN RETURN NEW; END IF;

  IF v_order.kind = 'booking' THEN
    UPDATE public.cook_maid_bookings
    SET status = 'cancelled'
    WHERE payment_order_id = v_order.id AND status = 'confirmed';
  ELSIF v_order.kind = 'insurance' THEN
    UPDATE public.insurance_payment_applications
    SET issuance_status = 'refunded', updated_at = now()
    WHERE order_id = v_order.id AND issuance_status = 'pending_issuance';
  END IF;
  INSERT INTO public.payment_audit_log (action, order_id, details)
  VALUES ('payment.fulfillment_cancelled_after_full_refund', v_order.id,
    jsonb_build_object('kind', v_order.kind, 'refund_id', NEW.id));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_refund_cancels_fully_refunded_pharmacy_order ON public.payment_refunds;
CREATE TRIGGER payment_refund_cancels_fully_refunded_pharmacy_order
  AFTER UPDATE OF status ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.finish_pharmacy_order_after_refund();

DROP TRIGGER IF EXISTS payment_refund_finishes_other_fulfillments ON public.payment_refunds;
CREATE TRIGGER payment_refund_finishes_other_fulfillments
  AFTER UPDATE OF status ON public.payment_refunds
  FOR EACH ROW EXECUTE FUNCTION public.finish_payment_fulfillment_after_refund();

CREATE OR REPLACE FUNCTION public.cancel_tele_appointment_after_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'refunded' AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.kind = 'tele-oncology' THEN
    UPDATE public.appointments
    SET status = 'cancelled'
    WHERE payment_order_id = NEW.id AND status = 'scheduled';
    INSERT INTO public.payment_audit_log (action, order_id, details)
    VALUES ('tele_oncology.appointment_cancelled_after_refund', NEW.id, '{}'::jsonb);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_refund_cancels_tele_appointment ON public.payment_orders;
CREATE TRIGGER payment_refund_cancels_tele_appointment
  AFTER UPDATE OF status ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.cancel_tele_appointment_after_refund();

REVOKE ALL ON FUNCTION public.guard_payment_teleconsultation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_tele_oncology_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_tele_oncology_call(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.authorize_tele_oncology_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_tele_oncology_call(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_pharmacy_online_delivery_fee(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_pharmacy_online_delivery_fee(uuid, uuid, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.expire_incomplete_payment_checkout(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_incomplete_payment_checkout(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_payment_provider_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_provider_order(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.link_payment_provider_order(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_payment_provider_order(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.capture_pharmacy_online_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_pharmacy_commission_delivery_fee() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_pharmacy_order_cancellation(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_pharmacy_order_cancellation(uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.transition_pharmacy_online_order(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_pharmacy_online_order(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.record_captured_payment_exception(text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_captured_payment_exception(text, text, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.expire_stale_provider_payment_order(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_provider_payment_order(uuid, text, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.review_insurance_payment_application(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_insurance_payment_application(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.finish_pharmacy_order_after_refund() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_payment_fulfillment_after_refund() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_tele_appointment_after_refund() FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_order_items TO authenticated;

NOTIFY pgrst, 'reload schema';
