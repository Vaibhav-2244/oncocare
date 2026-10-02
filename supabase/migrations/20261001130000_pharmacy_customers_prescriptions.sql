CREATE TABLE IF NOT EXISTS public.pharmacy_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  customer_type text NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail', 'corporate', 'priority', 'walk_in')),
  total_orders integer NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  last_visit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_customers_pharmacy_name
  ON public.pharmacy_customers (pharmacy_id, full_name);
CREATE INDEX IF NOT EXISTS idx_pharmacy_customers_pharmacy_phone
  ON public.pharmacy_customers (pharmacy_id, phone);

ALTER TABLE public.pharmacy_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pharmacy_customers_member_select"
  ON public.pharmacy_customers
  FOR SELECT TO authenticated
  USING (public.is_pharmacy_member(pharmacy_id));

CREATE POLICY "pharmacy_customers_member_insert"
  ON public.pharmacy_customers
  FOR INSERT TO authenticated
  WITH CHECK (public.is_pharmacy_member(pharmacy_id));

CREATE POLICY "pharmacy_customers_member_update"
  ON public.pharmacy_customers
  FOR UPDATE TO authenticated
  USING (public.is_pharmacy_member(pharmacy_id))
  WITH CHECK (public.is_pharmacy_member(pharmacy_id));

CREATE POLICY "pharmacy_customers_member_delete"
  ON public.pharmacy_customers
  FOR DELETE TO authenticated
  USING (public.is_pharmacy_member(pharmacy_id));

CREATE TABLE IF NOT EXISTS public.pharmacy_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_name text NOT NULL,
  doctor_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'verified', 'rejected', 'dispensed')),
  prescription_note text,
  total_items integer NOT NULL DEFAULT 0 CHECK (total_items >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_prescriptions_pharmacy_status
  ON public.pharmacy_prescriptions (pharmacy_id, status, created_at DESC);

ALTER TABLE public.pharmacy_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pharmacy_prescriptions_member_select"
  ON public.pharmacy_prescriptions
  FOR SELECT TO authenticated
  USING (public.is_pharmacy_member(pharmacy_id));

CREATE POLICY "pharmacy_prescriptions_member_insert"
  ON public.pharmacy_prescriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_pharmacy_member(pharmacy_id));

CREATE POLICY "pharmacy_prescriptions_member_update"
  ON public.pharmacy_prescriptions
  FOR UPDATE TO authenticated
  USING (public.is_pharmacy_member(pharmacy_id))
  WITH CHECK (public.is_pharmacy_member(pharmacy_id));

CREATE POLICY "pharmacy_prescriptions_member_delete"
  ON public.pharmacy_prescriptions
  FOR DELETE TO authenticated
  USING (public.is_pharmacy_member(pharmacy_id));

CREATE OR REPLACE FUNCTION public.upsert_pharmacy_customer(
  p_org_id uuid,
  p_patient_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_customer_type text DEFAULT 'retail',
  p_total_orders integer DEFAULT 0,
  p_last_visit_at timestamptz DEFAULT now()
)
RETURNS public.pharmacy_customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pharmacy_customers;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'customer.manage') THEN
    RAISE EXCEPTION 'customer.manage capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.pharmacy_customers
  WHERE pharmacy_id = p_org_id AND patient_id IS NOT DISTINCT FROM p_patient_id
  LIMIT 1;

  IF v_row.id IS NULL THEN
    INSERT INTO public.pharmacy_customers (
      pharmacy_id, patient_id, full_name, phone, email, customer_type, total_orders, last_visit_at, updated_at
    )
    VALUES (
      p_org_id,
      p_patient_id,
      NULLIF(btrim(p_full_name), ''),
      NULLIF(btrim(p_phone), ''),
      NULLIF(btrim(p_email), ''),
      COALESCE(NULLIF(btrim(p_customer_type), ''), 'retail'),
      COALESCE(p_total_orders, 0),
      COALESCE(p_last_visit_at, now()),
      now()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.pharmacy_customers
    SET patient_id = p_patient_id,
        full_name = NULLIF(btrim(p_full_name), ''),
        phone = NULLIF(btrim(p_phone), ''),
        email = NULLIF(btrim(p_email), ''),
        customer_type = COALESCE(NULLIF(btrim(p_customer_type), ''), 'retail'),
        total_orders = COALESCE(p_total_orders, total_orders),
        last_visit_at = COALESCE(p_last_visit_at, now()),
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_pharmacy_customer(uuid, uuid, text, text, text, text, integer, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_pharmacy_customer(uuid, uuid, text, text, text, text, integer, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_pharmacy_prescription(
  p_org_id uuid,
  p_patient_id uuid,
  p_patient_name text,
  p_doctor_name text,
  p_status text DEFAULT 'pending',
  p_prescription_note text DEFAULT NULL,
  p_total_items integer DEFAULT 0
)
RETURNS public.pharmacy_prescriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pharmacy_prescriptions;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'prescription.manage') THEN
    RAISE EXCEPTION 'prescription.manage capability required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.pharmacy_prescriptions (
    pharmacy_id, patient_id, patient_name, doctor_name, status, prescription_note, total_items, created_by, updated_at
  )
  VALUES (
    p_org_id,
    p_patient_id,
    NULLIF(btrim(p_patient_name), ''),
    NULLIF(btrim(p_doctor_name), ''),
    COALESCE(NULLIF(btrim(p_status), ''), 'pending'),
    NULLIF(btrim(p_prescription_note), ''),
    COALESCE(p_total_items, 0),
    auth.uid(),
    now()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_pharmacy_prescription(uuid, uuid, text, text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_pharmacy_prescription(uuid, uuid, text, text, text, text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
