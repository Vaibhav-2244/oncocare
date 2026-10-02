CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pharmacy_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  medicine_id uuid REFERENCES public.medicines(id) ON DELETE SET NULL,
  name text NOT NULL,
  generic_name text,
  strength text,
  form text,
  manufacturer text,
  category text,
  schedule text NOT NULL DEFAULT 'otc' CHECK (schedule IN ('otc', 'h', 'h1', 'x', 'ndps')),
  requires_prescription boolean NOT NULL DEFAULT false,
  cold_chain boolean NOT NULL DEFAULT false,
  hsn_code text,
  gst_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (gst_rate >= 0),
  mrp numeric(12,2) NOT NULL CHECK (mrp > 0),
  selling_price numeric(12,2) NOT NULL CHECK (selling_price >= 0 AND selling_price <= mrp),
  reorder_level integer NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE CASCADE,
  batch_no text NOT NULL,
  expiry_date date NOT NULL,
  qty_on_hand integer NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
  qty_reserved integer NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0 AND qty_reserved <= qty_on_hand),
  purchase_price numeric(12,2) NOT NULL DEFAULT 0,
  supplier_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined', 'expired', 'written_off')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_stock_batches_org_batch
  ON public.pharmacy_stock_batches (pharmacy_id, product_id, lower(btrim(batch_no)));

CREATE TABLE IF NOT EXISTS public.pharmacy_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES public.pharmacy_stock_batches(id) ON DELETE SET NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('receive', 'adjust', 'write_off', 'reserve', 'dispense')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  reason text,
  reference text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_products_org_active ON public.pharmacy_products (pharmacy_id, is_active, name);
CREATE INDEX IF NOT EXISTS idx_pharmacy_products_org_schedule ON public.pharmacy_products (pharmacy_id, schedule, category);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_batches_product_expiry ON public.pharmacy_stock_batches (product_id, expiry_date, status);
CREATE INDEX IF NOT EXISTS idx_pharmacy_stock_movements_product ON public.pharmacy_stock_movements (pharmacy_id, product_id, created_at DESC);

ALTER TABLE public.pharmacy_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_stock_movements ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.pharmacy_product_stock
WITH (security_invoker = true) AS
SELECT
  p.pharmacy_id,
  p.id AS product_id,
  p.name,
  p.mrp,
  p.selling_price,
  COALESCE(SUM(CASE WHEN b.status = 'active' AND b.expiry_date > CURRENT_DATE THEN b.qty_on_hand ELSE 0 END), 0) AS on_hand,
  COALESCE(SUM(CASE WHEN b.status = 'active' AND b.expiry_date > CURRENT_DATE THEN b.qty_reserved ELSE 0 END), 0) AS reserved,
  COALESCE(SUM(CASE WHEN b.status = 'active' AND b.expiry_date > CURRENT_DATE THEN (b.qty_on_hand - b.qty_reserved) ELSE 0 END), 0) AS available,
  MIN(CASE WHEN b.status = 'active' AND b.expiry_date > CURRENT_DATE THEN b.expiry_date END) AS nearest_expiry,
  MAX(CASE WHEN b.status = 'active' AND b.expiry_date < CURRENT_DATE THEN 1 ELSE 0 END) AS expired_flag
FROM public.pharmacy_products p
LEFT JOIN public.pharmacy_stock_batches b
  ON b.product_id = p.id
GROUP BY p.pharmacy_id, p.id, p.name, p.mrp, p.selling_price;

CREATE OR REPLACE FUNCTION public.is_pharmacy_inventory_manager(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.pharmacy_has_cap(p_org_id, 'inventory.write') OR public.pharmacy_has_cap(p_org_id, 'inventory.receive') OR public.pharmacy_has_cap(p_org_id, 'catalogue.manage');
$$;
REVOKE ALL ON FUNCTION public.is_pharmacy_inventory_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_inventory_manager(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_global_medicines(p_query text, p_limit integer DEFAULT 20)
RETURNS TABLE (
  id uuid,
  name text,
  generic_name text,
  strength text,
  form text,
  manufacturer text,
  category text,
  schedule text,
  mrp numeric,
  is_active boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.name, m.generic_name, m.strength, m.form, m.manufacturer, m.category, m.schedule,
         m.mrp, m.is_active
  FROM public.medicines m
  WHERE m.is_active = true
    AND (
      NULLIF(btrim(p_query), '') IS NULL
      OR m.name ILIKE '%' || btrim(p_query) || '%'
      OR COALESCE(m.generic_name, '') ILIKE '%' || btrim(p_query) || '%'
      OR COALESCE(m.strength, '') ILIKE '%' || btrim(p_query) || '%'
    )
  ORDER BY m.name
  LIMIT GREATEST(COALESCE(p_limit, 20), 1);
$$;
REVOKE ALL ON FUNCTION public.search_global_medicines(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_global_medicines(text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_pharmacy_product(
  p_org_id uuid,
  p_name text,
  p_generic_name text,
  p_strength text,
  p_form text,
  p_manufacturer text,
  p_category text,
  p_schedule text,
  p_requires_prescription boolean,
  p_cold_chain boolean,
  p_hsn_code text,
  p_gst_rate numeric,
  p_mrp numeric,
  p_selling_price numeric,
  p_reorder_level integer,
  p_is_active boolean DEFAULT true,
  p_medicine_id uuid DEFAULT NULL
)
RETURNS public.pharmacy_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_record public.pharmacy_orgs;
  v_is_requires_prescription boolean;
  v_row public.pharmacy_products;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'catalogue.manage') THEN
    RAISE EXCEPTION 'catalogue.manage capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_org_record FROM public.pharmacy_orgs WHERE id = p_org_id;
  IF v_org_record.id IS NULL THEN
    RAISE EXCEPTION 'Pharmacy workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF NULLIF(btrim(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Product name is required' USING ERRCODE = '22023';
  END IF;
  IF p_schedule NOT IN ('otc', 'h', 'h1', 'x', 'ndps') THEN
    RAISE EXCEPTION 'Invalid product schedule' USING ERRCODE = '22023';
  END IF;
  IF p_requires_prescription IS NULL THEN
    v_is_requires_prescription := p_schedule IN ('h', 'h1', 'x', 'ndps');
  ELSE
    v_is_requires_prescription := p_requires_prescription OR p_schedule IN ('h', 'h1', 'x', 'ndps');
  END IF;
  IF p_mrp IS NULL OR p_mrp <= 0 THEN
    RAISE EXCEPTION 'MRP must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 OR p_selling_price > p_mrp THEN
    RAISE EXCEPTION 'Selling price cannot exceed MRP' USING ERRCODE = '22023';
  END IF;
  IF p_reorder_level IS NULL OR p_reorder_level < 0 THEN
    RAISE EXCEPTION 'Reorder level must be zero or greater' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.pharmacy_products
  WHERE pharmacy_id = p_org_id
    AND lower(name) = lower(btrim(p_name))
    AND lower(COALESCE(strength, '')) = lower(COALESCE(NULLIF(btrim(p_strength), ''), ''))
    AND lower(COALESCE(form, '')) = lower(COALESCE(NULLIF(btrim(p_form), ''), ''));

  IF v_row.id IS NULL THEN
    INSERT INTO public.pharmacy_products (
      pharmacy_id, medicine_id, name, generic_name, strength, form, manufacturer, category, schedule,
      requires_prescription, cold_chain, hsn_code, gst_rate, mrp, selling_price, reorder_level, is_active, updated_at
    )
    VALUES (
      p_org_id, p_medicine_id, btrim(p_name), NULLIF(btrim(p_generic_name), ''), NULLIF(btrim(p_strength), ''),
      NULLIF(btrim(p_form), ''), NULLIF(btrim(p_manufacturer), ''), NULLIF(btrim(p_category), ''), p_schedule,
      v_is_requires_prescription, COALESCE(p_cold_chain, false), NULLIF(btrim(p_hsn_code), ''), COALESCE(p_gst_rate, 0), p_mrp,
      p_selling_price, p_reorder_level, COALESCE(p_is_active, true), now()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.pharmacy_products
    SET medicine_id = p_medicine_id,
        generic_name = NULLIF(btrim(p_generic_name), ''),
        strength = NULLIF(btrim(p_strength), ''),
        form = NULLIF(btrim(p_form), ''),
        manufacturer = NULLIF(btrim(p_manufacturer), ''),
        category = NULLIF(btrim(p_category), ''),
        schedule = p_schedule,
        requires_prescription = v_is_requires_prescription,
        cold_chain = COALESCE(p_cold_chain, false),
        hsn_code = NULLIF(btrim(p_hsn_code), ''),
        gst_rate = COALESCE(p_gst_rate, 0),
        mrp = p_mrp,
        selling_price = p_selling_price,
        reorder_level = p_reorder_level,
        is_active = COALESCE(p_is_active, true),
        updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;

  INSERT INTO public.pharmacy_stock_movements (pharmacy_id, product_id, movement_type, quantity, reason, created_by)
  SELECT p_org_id, v_row.id, 'adjust', 0, 'catalogue.sync', auth.uid()
  WHERE EXISTS (SELECT 1 FROM public.pharmacy_products WHERE id = v_row.id);

  RETURN v_row;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_pharmacy_product(uuid, text, text, text, text, text, text, text, boolean, boolean, text, numeric, numeric, numeric, integer, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_pharmacy_product(uuid, text, text, text, text, text, text, text, boolean, boolean, text, numeric, numeric, numeric, integer, boolean, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_product_from_global(p_org_id uuid, p_medicine_id uuid, p_selling_price numeric, p_reorder_level integer DEFAULT 10)
RETURNS public.pharmacy_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_medicine public.medicines;
  v_product public.pharmacy_products;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'catalogue.manage') THEN
    RAISE EXCEPTION 'catalogue.manage capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_medicine FROM public.medicines WHERE id = p_medicine_id AND is_active = true;
  IF v_medicine.id IS NULL THEN
    RAISE EXCEPTION 'Selected medicine not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_selling_price IS NULL OR p_selling_price < 0 OR p_selling_price > v_medicine.mrp THEN
    RAISE EXCEPTION 'Selling price cannot exceed MRP' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_product
  FROM public.upsert_pharmacy_product(
    p_org_id,
    v_medicine.name,
    v_medicine.generic_name,
    v_medicine.strength,
    v_medicine.form,
    v_medicine.manufacturer,
    v_medicine.category,
    v_medicine.schedule,
    v_medicine.requires_prescription,
    v_medicine.cold_chain,
    v_medicine.hsn_code,
    v_medicine.gst_rate,
    v_medicine.mrp,
    p_selling_price,
    COALESCE(p_reorder_level, 10),
    true,
    v_medicine.id
  );

  RETURN v_product;
END;
$$;
REVOKE ALL ON FUNCTION public.add_product_from_global(uuid, uuid, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_product_from_global(uuid, uuid, numeric, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.receive_stock(
  p_org_id uuid,
  p_product_id uuid,
  p_batch_no text,
  p_expiry_date date,
  p_qty integer,
  p_purchase_price numeric,
  p_supplier_name text
)
RETURNS public.pharmacy_stock_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.pharmacy_stock_batches;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'inventory.receive') THEN
    RAISE EXCEPTION 'inventory.receive capability required' USING ERRCODE = '42501';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Receipt quantity must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF p_expiry_date IS NULL OR p_expiry_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Expiry date must be in the future' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_batch_no), '') IS NULL THEN
    RAISE EXCEPTION 'Batch number is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch
  FROM public.pharmacy_stock_batches
  WHERE pharmacy_id = p_org_id
    AND product_id = p_product_id
    AND lower(batch_no) = lower(btrim(p_batch_no));

  IF v_batch.id IS NULL THEN
    INSERT INTO public.pharmacy_stock_batches (
      pharmacy_id, product_id, batch_no, expiry_date, qty_on_hand, qty_reserved, purchase_price, supplier_name, status, updated_at
    )
    VALUES (
      p_org_id, p_product_id, btrim(p_batch_no), p_expiry_date, p_qty, 0, COALESCE(p_purchase_price, 0), NULLIF(btrim(p_supplier_name), ''), 'active', now()
    )
    RETURNING * INTO v_batch;
  ELSE
    UPDATE public.pharmacy_stock_batches
    SET expiry_date = p_expiry_date,
        qty_on_hand = qty_on_hand + p_qty,
        purchase_price = COALESCE(p_purchase_price, 0),
        supplier_name = NULLIF(btrim(p_supplier_name), ''),
        status = CASE WHEN status = 'written_off' THEN 'active' ELSE status END,
        updated_at = now()
    WHERE id = v_batch.id
    RETURNING * INTO v_batch;
  END IF;

  INSERT INTO public.pharmacy_stock_movements (
    pharmacy_id, product_id, batch_id, movement_type, quantity, reason, reference, created_by
  )
  VALUES (
    p_org_id, p_product_id, v_batch.id, 'receive', p_qty, 'stock_receipt', btrim(p_batch_no), auth.uid()
  );

  RETURN v_batch;
END;
$$;
REVOKE ALL ON FUNCTION public.receive_stock(uuid, uuid, text, date, integer, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_stock(uuid, uuid, text, date, integer, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.adjust_stock(
  p_org_id uuid,
  p_product_id uuid,
  p_batch_id uuid,
  p_qty_delta integer,
  p_reason text
)
RETURNS public.pharmacy_stock_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.pharmacy_stock_batches;
  v_new_on_hand integer;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'inventory.adjust') THEN
    RAISE EXCEPTION 'inventory.adjust capability required' USING ERRCODE = '42501';
  END IF;
  IF p_qty_delta IS NULL OR p_qty_delta = 0 THEN
    RAISE EXCEPTION 'Adjustment quantity is required' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Adjustment reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch
  FROM public.pharmacy_stock_batches
  WHERE id = p_batch_id AND product_id = p_product_id AND pharmacy_id = p_org_id;
  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch not found for this pharmacy' USING ERRCODE = 'P0002';
  END IF;

  v_new_on_hand := v_batch.qty_on_hand + p_qty_delta;
  IF v_new_on_hand < 0 THEN
    RAISE EXCEPTION 'Adjustment would make stock negative' USING ERRCODE = '23514';
  END IF;

  UPDATE public.pharmacy_stock_batches
  SET qty_on_hand = v_new_on_hand,
      qty_reserved = CASE WHEN v_new_on_hand < qty_reserved THEN v_new_on_hand ELSE qty_reserved END,
      status = CASE WHEN v_new_on_hand = 0 THEN 'written_off' ELSE status END,
      updated_at = now()
  WHERE id = v_batch.id
  RETURNING * INTO v_batch;

  INSERT INTO public.pharmacy_stock_movements (pharmacy_id, product_id, batch_id, movement_type, quantity, reason, created_by)
  VALUES (p_org_id, p_product_id, v_batch.id, 'adjust', p_qty_delta, p_reason, auth.uid());

  RETURN v_batch;
END;
$$;
REVOKE ALL ON FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(uuid, uuid, uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.write_off_batch(
  p_org_id uuid,
  p_batch_id uuid,
  p_reason text
)
RETURNS public.pharmacy_stock_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch public.pharmacy_stock_batches;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'inventory.adjust') THEN
    RAISE EXCEPTION 'inventory.adjust capability required' USING ERRCODE = '42501';
  END IF;
  IF NULLIF(btrim(p_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Write-off reason is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.pharmacy_stock_batches
  SET qty_on_hand = 0,
      qty_reserved = 0,
      status = 'written_off',
      updated_at = now()
  WHERE id = p_batch_id AND pharmacy_id = p_org_id
  RETURNING * INTO v_batch;

  IF v_batch.id IS NULL THEN
    RAISE EXCEPTION 'Batch not found for this pharmacy' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.pharmacy_stock_movements (pharmacy_id, product_id, batch_id, movement_type, quantity, reason, created_by)
  VALUES (p_org_id, v_batch.product_id, v_batch.id, 'write_off', -v_batch.qty_on_hand, p_reason, auth.uid());

  RETURN v_batch;
END;
$$;
REVOKE ALL ON FUNCTION public.write_off_batch(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_off_batch(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sync_pharmacy_directory(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.pharmacy_orgs;
  v_dir_id uuid;
  v_available integer;
BEGIN
  SELECT * INTO v_org FROM public.pharmacy_orgs WHERE id = p_org_id;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Pharmacy workspace not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_org.verification_status <> 'verified' OR v_org.listing_enabled = false THEN
    UPDATE public.pharmacies
    SET is_verified = false,
        is_open = false,
        org_id = p_org_id,
        updated_at = now()
    WHERE org_id = p_org_id;
    RETURN false;
  END IF;

  SELECT id INTO v_dir_id
  FROM public.pharmacies
  WHERE org_id = p_org_id
  LIMIT 1;

  IF v_dir_id IS NULL THEN
    INSERT INTO public.pharmacies (
      name, phone, email, address, city, state, pincode, latitude, longitude, opening_hours, is_open,
      home_delivery, accepts_online_orders, is_verified, listing_enabled, org_id, updated_at
    )
    VALUES (
      v_org.name, v_org.phone, v_org.email, v_org.address_line, v_org.city, v_org.state, v_org.pincode,
      v_org.latitude, v_org.longitude, v_org.opening_hours, v_org.is_open, v_org.home_delivery,
      v_org.accepts_online_orders, true, true, p_org_id, now()
    )
    RETURNING id INTO v_dir_id;
  ELSE
    UPDATE public.pharmacies
    SET name = v_org.name,
        phone = v_org.phone,
        email = v_org.email,
        address = v_org.address_line,
        city = v_org.city,
        state = v_org.state,
        pincode = v_org.pincode,
        latitude = v_org.latitude,
        longitude = v_org.longitude,
        opening_hours = v_org.opening_hours,
        is_open = v_org.is_open,
        home_delivery = v_org.home_delivery,
        accepts_online_orders = v_org.accepts_online_orders,
        is_verified = true,
        listing_enabled = true,
        org_id = p_org_id,
        updated_at = now()
    WHERE id = v_dir_id;
  END IF;

  WITH stock AS (
    SELECT p.id AS product_id,
           p.pharmacy_id,
           p.name,
           p.selling_price,
           COALESCE(ps.available, 0) AS available,
           p.reorder_level,
           p.medicine_id
    FROM public.pharmacy_products p
    LEFT JOIN public.pharmacy_product_stock ps ON ps.product_id = p.id
    WHERE p.pharmacy_id = p_org_id AND p.is_active = true
  )
  UPDATE public.medicine_prices mp
  SET current_price = stock.selling_price,
      availability = CASE
        WHEN stock.available <= 0 THEN 'out_of_stock'
        WHEN stock.available <= COALESCE(stock.reorder_level, 0) THEN 'low_stock'
        ELSE 'in_stock'
      END,
      updated_at = now()
  FROM stock
  WHERE mp.pharmacy_id = v_dir_id AND mp.medicine_id = stock.medicine_id;

  INSERT INTO public.medicine_prices (pharmacy_id, medicine_id, current_price, availability, cta_text, updated_at)
  SELECT v_dir_id,
         p.medicine_id,
         p.selling_price,
         CASE WHEN COALESCE(ps.available, 0) <= 0 THEN 'out_of_stock' WHEN COALESCE(ps.available, 0) <= COALESCE(p.reorder_level, 0) THEN 'low_stock' ELSE 'in_stock' END,
         'Buy now',
         now()
  FROM public.pharmacy_products p
  LEFT JOIN public.pharmacy_product_stock ps ON ps.product_id = p.id
  WHERE p.pharmacy_id = p_org_id AND p.medicine_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.medicine_prices mp
      WHERE mp.pharmacy_id = v_dir_id AND mp.medicine_id = p.medicine_id
    );

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_pharmacy_directory(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_pharmacy_directory(uuid) TO authenticated;

ALTER TABLE public.pharmacies ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.pharmacy_orgs(id) ON DELETE SET NULL;
ALTER TABLE public.pharmacies ALTER COLUMN is_verified SET DEFAULT false;

DROP POLICY IF EXISTS "authenticated_insert_pharmacies" ON public.pharmacies;
DROP POLICY IF EXISTS "authenticated_update_pharmacies" ON public.pharmacies;
DROP POLICY IF EXISTS "authenticated_delete_pharmacies" ON public.pharmacies;
CREATE POLICY "pharmacies_public_read" ON public.pharmacies FOR SELECT TO public USING (
  org_id IS NULL OR is_verified = true OR public.is_pharmacy_member(org_id)
);
CREATE POLICY "pharmacies_block_client_write" ON public.pharmacies FOR INSERT WITH CHECK (false);
CREATE POLICY "pharmacies_block_client_write_update" ON public.pharmacies FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "pharmacies_block_client_write_delete" ON public.pharmacies FOR DELETE USING (false);

ALTER TABLE public.pharmacy_reviews ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();
DROP POLICY IF EXISTS "authenticated_insert_reviews" ON public.pharmacy_reviews;
DROP POLICY IF EXISTS "authenticated_update_reviews" ON public.pharmacy_reviews;
DROP POLICY IF EXISTS "authenticated_delete_reviews" ON public.pharmacy_reviews;
CREATE POLICY "pharmacy_reviews_own_insert" ON public.pharmacy_reviews FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pharmacy_reviews_own_update" ON public.pharmacy_reviews FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pharmacy_reviews_own_delete" ON public.pharmacy_reviews FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "authenticated_insert_medicines" ON public.medicines;
DROP POLICY IF EXISTS "authenticated_update_medicines" ON public.medicines;
DROP POLICY IF EXISTS "authenticated_delete_medicines" ON public.medicines;
CREATE POLICY "medicines_public_read" ON public.medicines FOR SELECT USING (true);
CREATE POLICY "medicines_block_client_write" ON public.medicines FOR INSERT WITH CHECK (false);
CREATE POLICY "medicines_block_client_update" ON public.medicines FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "medicines_block_client_delete" ON public.medicines FOR DELETE USING (false);

DROP POLICY IF EXISTS "authenticated_insert_prices" ON public.medicine_prices;
DROP POLICY IF EXISTS "authenticated_update_prices" ON public.medicine_prices;
DROP POLICY IF EXISTS "authenticated_delete_prices" ON public.medicine_prices;
CREATE POLICY "medicine_prices_public_read" ON public.medicine_prices FOR SELECT USING (true);
CREATE POLICY "medicine_prices_block_client_write" ON public.medicine_prices FOR INSERT WITH CHECK (false);
CREATE POLICY "medicine_prices_block_client_update" ON public.medicine_prices FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "medicine_prices_block_client_delete" ON public.medicine_prices FOR DELETE USING (false);

DROP POLICY IF EXISTS "authenticated_insert_generics" ON public.generic_alternatives;
DROP POLICY IF EXISTS "authenticated_update_generics" ON public.generic_alternatives;
DROP POLICY IF EXISTS "authenticated_delete_generics" ON public.generic_alternatives;
CREATE POLICY "generic_alternatives_public_read" ON public.generic_alternatives FOR SELECT USING (true);
CREATE POLICY "generic_alternatives_block_client_write" ON public.generic_alternatives FOR INSERT WITH CHECK (false);
CREATE POLICY "generic_alternatives_block_client_update" ON public.generic_alternatives FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "generic_alternatives_block_client_delete" ON public.generic_alternatives FOR DELETE USING (false);

ALTER TABLE public.pharmacy_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharmacy_products_member_select" ON public.pharmacy_products FOR SELECT TO authenticated USING (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_products_member_modify" ON public.pharmacy_products FOR INSERT TO authenticated WITH CHECK (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_products_member_update" ON public.pharmacy_products FOR UPDATE TO authenticated USING (public.is_pharmacy_member(pharmacy_id)) WITH CHECK (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_products_member_delete" ON public.pharmacy_products FOR DELETE TO authenticated USING (public.is_pharmacy_member(pharmacy_id));

ALTER TABLE public.pharmacy_stock_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharmacy_stock_batches_member_select" ON public.pharmacy_stock_batches FOR SELECT TO authenticated USING (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_stock_batches_member_modify" ON public.pharmacy_stock_batches FOR INSERT TO authenticated WITH CHECK (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_stock_batches_member_update" ON public.pharmacy_stock_batches FOR UPDATE TO authenticated USING (public.is_pharmacy_member(pharmacy_id)) WITH CHECK (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_stock_batches_member_delete" ON public.pharmacy_stock_batches FOR DELETE TO authenticated USING (public.is_pharmacy_member(pharmacy_id));

ALTER TABLE public.pharmacy_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharmacy_stock_movements_member_select" ON public.pharmacy_stock_movements FOR SELECT TO authenticated USING (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_stock_movements_member_insert" ON public.pharmacy_stock_movements FOR INSERT TO authenticated WITH CHECK (public.is_pharmacy_member(pharmacy_id));
CREATE POLICY "pharmacy_stock_movements_block_update" ON public.pharmacy_stock_movements FOR UPDATE USING (false) WITH CHECK (false);
CREATE POLICY "pharmacy_stock_movements_block_delete" ON public.pharmacy_stock_movements FOR DELETE USING (false);

NOTIFY pgrst, 'reload schema';
