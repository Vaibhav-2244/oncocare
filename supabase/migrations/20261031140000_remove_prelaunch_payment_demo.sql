DROP TRIGGER IF EXISTS payment_order_sync_prelaunch_demo_booking ON public.payment_orders;
DROP FUNCTION IF EXISTS public.sync_prelaunch_demo_booking_status();

DO $$
BEGIN
  IF to_regclass('public.prelaunch_demo_bookings') IS NOT NULL
     AND to_regclass('public.payment_orders') IS NOT NULL THEN
    EXECUTE $archive$
      UPDATE public.payment_orders AS payment
      SET notes = COALESCE(payment.notes, '{}'::jsonb) || jsonb_build_object(
        'legacyPilotRecord',
        jsonb_build_object(
          'archivedAt', now(),
          'booking', to_jsonb(booking),
          'catalog', CASE WHEN catalog.id IS NULL THEN NULL ELSE to_jsonb(catalog) END
        )
      )
      FROM public.prelaunch_demo_bookings AS booking
      LEFT JOIN public.prelaunch_demo_catalog AS catalog ON catalog.id = booking.catalog_id
      WHERE payment.id = booking.payment_order_id
    $archive$;
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.prelaunch_demo_bookings;
DROP TABLE IF EXISTS public.prelaunch_demo_catalog;

NOTIFY pgrst, 'reload schema';
