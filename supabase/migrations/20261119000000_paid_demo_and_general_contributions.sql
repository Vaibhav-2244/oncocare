ALTER TABLE public.caregiver_profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paid donation is missing its donation record'
      USING ERRCODE = 'P0002';
  END IF;

  IF COALESCE(v_donation.purpose, '') = 'General OncoCare+ platform contribution' THEN
    RETURN NEW;
  END IF;

  IF v_donation.bpl_patient_id IS NULL
     OR NULLIF(btrim(v_donation.donor_name), '') IS NULL
     OR NULLIF(btrim(v_donation.donor_email), '') IS NULL THEN
    RAISE EXCEPTION 'Paid patient-specific donation is missing its verified campaign or donor record'
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

NOTIFY pgrst, 'reload schema';
