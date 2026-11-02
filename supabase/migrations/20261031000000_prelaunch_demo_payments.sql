ALTER TABLE public.payment_orders
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'test'
    CHECK (payment_mode IN ('test', 'live')),
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS live_demo_consent_at timestamptz;

ALTER TABLE public.cook_maid_helpers
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT true;

ALTER FUNCTION public.finalize_razorpay_payment(text, text, bigint, text)
  RENAME TO finalize_razorpay_payment_non_demo;

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
BEGIN
  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE provider_order_id = p_provider_order_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found' USING ERRCODE = 'P0002'; END IF;
  IF v_order.amount_in_paise <> p_amount_in_paise OR v_order.currency <> p_currency THEN
    RAISE EXCEPTION 'Payment amount or currency mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_order.is_demo IS TRUE THEN
    IF v_order.status = 'paid' AND v_order.provider_payment_id = p_provider_payment_id THEN
      RETURN jsonb_build_object('status', 'paid', 'duplicate', true, 'order_id', v_order.id, 'demo', true);
    END IF;
    IF v_order.status <> 'pending' THEN
      RAISE EXCEPTION 'Demo payment order is not pending' USING ERRCODE = '22023';
    END IF;
    UPDATE public.payment_orders
    SET status = 'paid',
        provider_payment_id = p_provider_payment_id,
        captured_at = now(),
        updated_at = now()
    WHERE id = v_order.id;
    RETURN jsonb_build_object('status', 'paid', 'duplicate', false, 'order_id', v_order.id, 'demo', true);
  END IF;

  RETURN public.finalize_razorpay_payment_non_demo(
    p_provider_order_id,
    p_provider_payment_id,
    p_amount_in_paise,
    p_currency
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_razorpay_payment(text, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_razorpay_payment(text, text, bigint, text) TO service_role;

CREATE TABLE IF NOT EXISTS public.prelaunch_demo_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('caregiver', 'booking', 'tele-oncology', 'medicine', 'insurance')),
  provider_label text NOT NULL CHECK (left(btrim(provider_label), 5) = 'DEMO:'),
  service_name text NOT NULL CHECK (left(btrim(service_name), 5) = 'DEMO:'),
  description text NOT NULL DEFAULT '',
  amount_in_paise bigint NOT NULL CHECK (amount_in_paise BETWEEN 100 AND 100000000),
  pricing_unit text NOT NULL DEFAULT 'per demo booking',
  available_weekdays integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  daily_start_time time NOT NULL DEFAULT '00:00',
  daily_end_time time NOT NULL DEFAULT '23:59',
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (daily_end_time > daily_start_time),
  CHECK (available_weekdays <@ ARRAY[0,1,2,3,4,5,6])
);

CREATE TABLE IF NOT EXISTS public.prelaunch_demo_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  catalog_id uuid REFERENCES public.prelaunch_demo_catalog(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('caregiver', 'booking', 'tele-oncology', 'medicine', 'insurance', 'donation')),
  provider_label text NOT NULL,
  service_name text NOT NULL,
  requested_date date,
  requested_start_time time,
  requested_end_time time,
  amount_in_paise bigint NOT NULL CHECK (amount_in_paise > 0),
  payment_mode text NOT NULL CHECK (payment_mode IN ('test', 'live')),
  disclosure_version text NOT NULL,
  status text NOT NULL DEFAULT 'payment_pending'
    CHECK (status IN ('payment_pending', 'paid_demo', 'payment_failed', 'cancelled', 'refunded', 'partially_refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((requested_start_time IS NULL AND requested_end_time IS NULL)
    OR (requested_start_time IS NOT NULL AND requested_end_time > requested_start_time))
);

CREATE INDEX IF NOT EXISTS idx_prelaunch_demo_catalog_kind_active
  ON public.prelaunch_demo_catalog (kind, active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prelaunch_demo_bookings_patient
  ON public.prelaunch_demo_bookings (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prelaunch_demo_bookings_mode_status
  ON public.prelaunch_demo_bookings (payment_mode, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prelaunch_demo_booking_slot
  ON public.prelaunch_demo_bookings (catalog_id, requested_date, requested_start_time, requested_end_time)
  WHERE catalog_id IS NOT NULL
    AND requested_date IS NOT NULL
    AND status IN ('payment_pending', 'paid_demo');

ALTER TABLE public.prelaunch_demo_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prelaunch_demo_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS prelaunch_demo_catalog_admin_read ON public.prelaunch_demo_catalog;
CREATE POLICY prelaunch_demo_catalog_admin_read ON public.prelaunch_demo_catalog
  FOR SELECT TO authenticated USING (public.is_platform_admin());
DROP POLICY IF EXISTS prelaunch_demo_bookings_patient_read ON public.prelaunch_demo_bookings;
CREATE POLICY prelaunch_demo_bookings_patient_read ON public.prelaunch_demo_bookings
  FOR SELECT TO authenticated USING (patient_id = auth.uid());
DROP POLICY IF EXISTS prelaunch_demo_bookings_admin_read ON public.prelaunch_demo_bookings;
CREATE POLICY prelaunch_demo_bookings_admin_read ON public.prelaunch_demo_bookings
  FOR SELECT TO authenticated USING (public.is_platform_admin());

GRANT SELECT ON public.prelaunch_demo_catalog, public.prelaunch_demo_bookings TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_prelaunch_demo_booking_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_demo IS NOT TRUE OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    UPDATE public.prelaunch_demo_bookings
    SET status = 'paid_demo', updated_at = now()
    WHERE payment_order_id = NEW.id AND status = 'payment_pending';
  ELSIF NEW.status IN ('failed', 'cancelled') THEN
    UPDATE public.prelaunch_demo_bookings
    SET status = CASE WHEN NEW.status = 'failed' THEN 'payment_failed' ELSE 'cancelled' END,
        updated_at = now()
    WHERE payment_order_id = NEW.id AND status = 'payment_pending';
  ELSIF NEW.status = 'refunded' THEN
    UPDATE public.prelaunch_demo_bookings
    SET status = 'refunded', updated_at = now()
    WHERE payment_order_id = NEW.id AND status = 'paid_demo';
  ELSIF NEW.status = 'partially_refunded' THEN
    UPDATE public.prelaunch_demo_bookings
    SET status = 'partially_refunded', updated_at = now()
    WHERE payment_order_id = NEW.id AND status = 'paid_demo';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_caregiver_payment_booking_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind <> 'caregiver'
     OR NEW.is_demo IS TRUE
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' THEN
    UPDATE public.caregiver_payment_bookings
    SET status = 'requested', updated_at = now()
    WHERE payment_order_id = NEW.id AND status = 'payment_pending';
    IF NOT FOUND AND NOT EXISTS (
      SELECT 1 FROM public.caregiver_payment_bookings
      WHERE payment_order_id = NEW.id AND status IN ('requested', 'confirmed')
    ) THEN
      RAISE EXCEPTION 'Paid caregiver checkout has no pending booking' USING ERRCODE = 'P0002';
    END IF;
  ELSIF NEW.status IN ('failed', 'cancelled') THEN
    UPDATE public.caregiver_payment_bookings
    SET status = 'payment_failed', updated_at = now()
    WHERE payment_order_id = NEW.id AND status = 'payment_pending';
  ELSIF NEW.status = 'refunded' THEN
    UPDATE public.caregiver_payment_bookings
    SET status = 'refunded', updated_at = now()
    WHERE payment_order_id = NEW.id AND status IN ('requested', 'confirmed');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_order_sync_prelaunch_demo_booking ON public.payment_orders;
CREATE TRIGGER payment_order_sync_prelaunch_demo_booking
  AFTER UPDATE OF status ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_prelaunch_demo_booking_status();

INSERT INTO public.prelaunch_demo_catalog
  (slug, kind, provider_label, service_name, description, amount_in_paise, pricing_unit)
VALUES
  ('demo-caregiver-session', 'caregiver', 'DEMO: OncoCare Training Provider', 'DEMO: Caregiver booking simulation', 'Pre-launch demonstration only. No care provider or service is being supplied.', 10000, 'per demo booking'),
  ('demo-cook-maid-session', 'booking', 'DEMO: OncoCare Household Provider', 'DEMO: Cook/maid booking simulation', 'Pre-launch demonstration only. No cook, maid, or household service is being supplied.', 10000, 'per demo booking'),
  ('demo-tele-oncology-session', 'tele-oncology', 'DEMO: OncoCare Consultation Profile', 'DEMO: Consultation booking simulation', 'Pre-launch demonstration only. No medical consultation, diagnosis, or treatment is provided.', 10000, 'per demo booking'),
  ('demo-medicine-order', 'medicine', 'DEMO: OncoCare Training Catalogue', 'DEMO: Medicine checkout simulation', 'No medicine, prescription, or pharmacy fulfilment is provided.', 10000, 'per demo order'),
  ('demo-insurance-application', 'insurance', 'DEMO: OncoCare Training Catalogue', 'DEMO: Insurance checkout simulation', 'No insurance coverage, policy, or insurer service is provided.', 10000, 'per demo application')
ON CONFLICT (slug) DO NOTHING;

NOTIFY pgrst, 'reload schema';
