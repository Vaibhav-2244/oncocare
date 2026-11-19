CREATE OR REPLACE FUNCTION public.guard_caregiver_payment_booking_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('payment_pending', 'requested', 'confirmed') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('caregiver-payment-booking:' || NEW.caregiver_id::text, 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.caregiver_payment_bookings AS booking
    WHERE booking.id <> NEW.id
      AND booking.caregiver_id = NEW.caregiver_id
      AND booking.requested_date = NEW.requested_date
      AND booking.status IN ('payment_pending', 'requested', 'confirmed')
      AND booking.requested_start_time < NEW.requested_end_time
      AND booking.requested_end_time > NEW.requested_start_time
  ) THEN
    RAISE EXCEPTION 'Caregiver is already reserved for an overlapping time'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_caregiver_payment_booking_overlap
  ON public.caregiver_payment_bookings;
CREATE TRIGGER guard_caregiver_payment_booking_overlap
  BEFORE INSERT OR UPDATE OF caregiver_id, requested_date, requested_start_time,
    requested_end_time, status
  ON public.caregiver_payment_bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_caregiver_payment_booking_overlap();

REVOKE ALL ON FUNCTION public.guard_caregiver_payment_booking_overlap()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
