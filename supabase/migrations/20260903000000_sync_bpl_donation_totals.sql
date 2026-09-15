-- Keep campaign totals consistent when a donation is recorded.
CREATE OR REPLACE FUNCTION public.sync_bpl_donation_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'successful' THEN
    UPDATE bpl_patients
    SET raised_amount = raised_amount + NEW.amount,
        donors_count = donors_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.patient_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_bpl_donation_totals ON bpl_donations;
CREATE TRIGGER sync_bpl_donation_totals
  AFTER INSERT ON bpl_donations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_bpl_donation_totals();
