ALTER TABLE public.payment_donations
  ADD COLUMN IF NOT EXISTS bpl_patient_id bigint
    REFERENCES public.bpl_patients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS donor_name text,
  ADD COLUMN IF NOT EXISTS donor_email text,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'razorpay';

ALTER TABLE public.bpl_donations
  ADD COLUMN IF NOT EXISTS payment_order_id uuid
    REFERENCES public.payment_orders(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bpl_donations_payment_order
  ON public.bpl_donations (payment_order_id)
  WHERE payment_order_id IS NOT NULL;

ALTER TABLE public.bpl_donations
  DROP CONSTRAINT IF EXISTS valid_payment_method;
ALTER TABLE public.bpl_donations
  ADD CONSTRAINT valid_payment_method
  CHECK (payment_method IN ('upi', 'card', 'netbanking', 'razorpay'));

CREATE OR REPLACE FUNCTION public.sync_live_bpl_donation_after_capture()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_donation public.payment_donations%ROWTYPE;
BEGIN
  IF NEW.kind <> 'donation'
     OR NEW.is_demo IS TRUE
     OR NEW.payment_mode <> 'live'
     OR NEW.status <> 'paid'
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_donation
  FROM public.payment_donations
  WHERE order_id = NEW.id
  FOR SHARE;
  IF NOT FOUND
     OR v_donation.bpl_patient_id IS NULL
     OR NULLIF(btrim(v_donation.donor_name), '') IS NULL
     OR NULLIF(btrim(v_donation.donor_email), '') IS NULL THEN
    RAISE EXCEPTION 'Paid BPL donation is missing its verified campaign or donor record'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.bpl_donations (
    patient_id, donor_id, donor_name, donor_email, amount,
    payment_method, status, payment_order_id
  ) VALUES (
    v_donation.bpl_patient_id,
    NEW.user_id,
    v_donation.donor_name,
    v_donation.donor_email,
    NEW.amount_in_paise::numeric / 100,
    'razorpay',
    'successful',
    NEW.id
  )
  ON CONFLICT (payment_order_id) WHERE payment_order_id IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_live_bpl_donation_after_capture() FROM PUBLIC;

DROP TRIGGER IF EXISTS payment_order_sync_live_bpl_donation ON public.payment_orders;
CREATE TRIGGER payment_order_sync_live_bpl_donation
  AFTER UPDATE OF status ON public.payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.sync_live_bpl_donation_after_capture();

NOTIFY pgrst, 'reload schema';