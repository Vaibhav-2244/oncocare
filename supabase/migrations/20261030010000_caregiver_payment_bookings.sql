ALTER TABLE public.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_kind_check;
ALTER TABLE public.payment_orders
  ADD CONSTRAINT payment_orders_kind_check
  CHECK (kind IN ('medicine', 'insurance', 'tele-oncology', 'booking', 'caregiver', 'donation'));

CREATE TABLE IF NOT EXISTS public.caregiver_payment_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_order_id uuid NOT NULL UNIQUE REFERENCES public.payment_orders(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  caregiver_id uuid NOT NULL,
  service_id uuid NOT NULL,
  requested_date date NOT NULL,
  requested_start_time time NOT NULL,
  requested_end_time time NOT NULL,
  location text NOT NULL,
  requirements text NOT NULL DEFAULT '',
  amount_in_paise bigint NOT NULL CHECK (amount_in_paise > 0),
  status text NOT NULL DEFAULT 'payment_pending'
    CHECK (status IN ('payment_pending', 'requested', 'confirmed', 'payment_failed', 'cancelled', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_end_time > requested_start_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_caregiver_payment_bookings_active_slot
  ON public.caregiver_payment_bookings (
    patient_id, caregiver_id, service_id, requested_date, requested_start_time, requested_end_time
  )
  WHERE status IN ('payment_pending', 'requested', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_caregiver_payment_bookings_patient
  ON public.caregiver_payment_bookings (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caregiver_payment_bookings_provider
  ON public.caregiver_payment_bookings (caregiver_id, requested_date, requested_start_time);

ALTER TABLE public.caregiver_payment_bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS caregiver_payment_bookings_patient_read ON public.caregiver_payment_bookings;
CREATE POLICY caregiver_payment_bookings_patient_read ON public.caregiver_payment_bookings
  FOR SELECT TO authenticated USING (patient_id = auth.uid());
DROP POLICY IF EXISTS caregiver_payment_bookings_admin_read ON public.caregiver_payment_bookings;
CREATE POLICY caregiver_payment_bookings_admin_read ON public.caregiver_payment_bookings
  FOR SELECT TO authenticated USING (public.is_platform_admin());
GRANT SELECT ON public.caregiver_payment_bookings TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_caregiver_payment_booking_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind <> 'caregiver' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
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

DROP TRIGGER IF EXISTS payment_order_sync_caregiver_booking ON public.payment_orders;
CREATE TRIGGER payment_order_sync_caregiver_booking
  AFTER UPDATE OF status ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_caregiver_payment_booking_status();

NOTIFY pgrst, 'reload schema';
