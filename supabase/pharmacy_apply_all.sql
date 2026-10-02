-- 20261001110000_pharmacy_foundation.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.pharmacy_orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  drug_licence_no text,
  gstin text,
  pharmacist_name text,
  pharmacist_reg_no text,
  phone text,
  email text,
  address_line text,
  city text,
  state text,
  pincode text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_open boolean NOT NULL DEFAULT false,
  home_delivery boolean NOT NULL DEFAULT false,
  accepts_online_orders boolean NOT NULL DEFAULT false,
  listing_enabled boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending', 'verified', 'suspended')),
  verification_requested_at timestamptz,
  directory_pharmacy_id uuid REFERENCES public.pharmacies(id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_role text NOT NULL CHECK (staff_role IN ('pharmacy_admin', 'pharmacist', 'store_staff', 'delivery_staff')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, staff_role)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  email text NOT NULL,
  staff_role text NOT NULL CHECK (staff_role IN ('pharmacy_admin', 'pharmacist', 'store_staff', 'delivery_staff')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, email, staff_role)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_counters (
  org_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (org_id, kind)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.pharmacy_orgs(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_orgs_owner ON public.pharmacy_orgs (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pharmacy_orgs_owner_unique
  ON public.pharmacy_orgs (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacy_members_user_active ON public.pharmacy_members (user_id, is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_pharmacy_members_org_active ON public.pharmacy_members (org_id, is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_pharmacy_invites_pending_email ON public.pharmacy_invites (lower(email), expires_at) WHERE accepted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_org_created ON public.pharmacy_audit (org_id, created_at DESC);

ALTER TABLE public.pharmacy_orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_audit ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_pharmacy_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pharmacy_members pm
    WHERE pm.org_id = p_org_id AND pm.user_id = auth.uid() AND pm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_pharmacy_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pharmacy_members pm
    WHERE pm.org_id = p_org_id AND pm.user_id = auth.uid()
      AND pm.staff_role = 'pharmacy_admin' AND pm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.pharmacy_role_can(p_role text, p_cap text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE p_cap
    WHEN 'orders.read' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'orders.create' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'orders.progress' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'prescriptions.read' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'prescriptions.verify' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist'])
    WHEN 'prescription.manage' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist'])
    WHEN 'inventory.read' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'inventory.write' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist'])
    WHEN 'inventory.receive' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'inventory.adjust' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist'])
    WHEN 'catalogue.manage' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist'])
    WHEN 'pricing.manage' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist'])
    WHEN 'payments.record' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'payments.refund' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist'])
    WHEN 'deliveries.manage' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff', 'delivery_staff'])
    WHEN 'customers.read' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'customers.write' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'customer.manage' THEN p_role = ANY (ARRAY['pharmacy_admin', 'pharmacist', 'store_staff'])
    WHEN 'reports.read' THEN p_role = 'pharmacy_admin'
    WHEN 'settings.manage' THEN p_role = 'pharmacy_admin'
    WHEN 'staff.manage' THEN p_role = 'pharmacy_admin'
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.pharmacy_has_cap(p_org_id uuid, p_cap text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pharmacy_members pm
    WHERE pm.org_id = p_org_id AND pm.user_id = auth.uid() AND pm.is_active = true
      AND public.pharmacy_role_can(pm.staff_role, p_cap)
  );
$$;

CREATE OR REPLACE FUNCTION public.pharmacy_is_verified(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_pharmacy_member(p_org_id) AND EXISTS (
    SELECT 1 FROM public.pharmacy_orgs po
    WHERE po.id = p_org_id AND po.verification_status = 'verified'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.name IN ('admin', 'super_admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_pharmacy_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_pharmacy_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_pharmacy_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.pharmacy_role_can(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pharmacy_role_can(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pharmacy_has_cap(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pharmacy_has_cap(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.pharmacy_is_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pharmacy_is_verified(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;

DROP POLICY IF EXISTS pharmacy_orgs_member_select ON public.pharmacy_orgs;
CREATE POLICY pharmacy_orgs_member_select ON public.pharmacy_orgs
  FOR SELECT TO authenticated USING (public.is_pharmacy_member(id));
DROP POLICY IF EXISTS pharmacy_members_self_or_admin_select ON public.pharmacy_members;
CREATE POLICY pharmacy_members_self_or_admin_select ON public.pharmacy_members
  FOR SELECT TO authenticated USING (
    public.is_pharmacy_member(org_id)
    AND (user_id = auth.uid() OR public.is_pharmacy_admin(org_id))
  );
DROP POLICY IF EXISTS pharmacy_invites_admin_select ON public.pharmacy_invites;
CREATE POLICY pharmacy_invites_admin_select ON public.pharmacy_invites
  FOR SELECT TO authenticated USING (public.is_pharmacy_admin(org_id));
DROP POLICY IF EXISTS pharmacy_audit_admin_select ON public.pharmacy_audit;
CREATE POLICY pharmacy_audit_admin_select ON public.pharmacy_audit
  FOR SELECT TO authenticated USING (public.is_pharmacy_admin(org_id));

REVOKE ALL ON TABLE public.pharmacy_orgs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pharmacy_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pharmacy_invites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pharmacy_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.pharmacy_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.pharmacy_orgs TO authenticated;
GRANT SELECT ON TABLE public.pharmacy_members TO authenticated;
GRANT SELECT ON TABLE public.pharmacy_invites TO authenticated;
GRANT SELECT ON TABLE public.pharmacy_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.seed_pharmacy_defaults(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pharmacy_counters (org_id, kind, last_value)
  VALUES (p_org_id, 'customer', 0), (p_org_id, 'prescription', 0), (p_org_id, 'order', 0),
         (p_org_id, 'delivery', 0), (p_org_id, 'payment', 0)
  ON CONFLICT (org_id, kind) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_pharmacy_defaults(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ensure_pharmacy_workspace()
RETURNS public.pharmacy_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_org_name text;
  v_org_id uuid;
  v_staff_role text;
  v_org public.pharmacy_orgs;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text));

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_user_id AND r.name = 'pharmacy'
  ) THEN
    RAISE EXCEPTION 'pharmacy role required' USING ERRCODE = '42501';
  END IF;

  SELECT pm.org_id INTO v_org_id
  FROM public.pharmacy_members pm
  WHERE pm.user_id = v_user_id AND pm.is_active = true
  ORDER BY pm.created_at, pm.org_id
  LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    PERFORM public.seed_pharmacy_defaults(v_org_id);
    SELECT * INTO v_org FROM public.pharmacy_orgs WHERE id = v_org_id;
    RETURN v_org;
  END IF;

  SELECT u.email,
         COALESCE(NULLIF(btrim(p.full_name), ''), split_part(u.email, '@', 1)) || ' Pharmacy'
    INTO v_email, v_org_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = v_user_id;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_user_id AND u.email_confirmed_at IS NOT NULL
  ) THEN
    SELECT pi.org_id, pi.staff_role INTO v_org_id, v_staff_role
    FROM public.pharmacy_invites pi
    WHERE lower(pi.email) = lower(v_email)
      AND pi.accepted_at IS NULL AND pi.expires_at > now()
    ORDER BY pi.created_at, pi.org_id
    LIMIT 1 FOR UPDATE;
    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.pharmacy_members (org_id, user_id, staff_role)
      VALUES (v_org_id, v_user_id, v_staff_role)
      ON CONFLICT (org_id, user_id, staff_role) DO UPDATE SET is_active = true;
      UPDATE public.pharmacy_invites SET accepted_at = now()
      WHERE org_id = v_org_id AND lower(email) = lower(v_email)
        AND staff_role = v_staff_role AND accepted_at IS NULL;
      PERFORM public.seed_pharmacy_defaults(v_org_id);
      INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, details)
      VALUES (v_org_id, v_user_id, 'staff.invite_accepted', 'pharmacy_member', jsonb_build_object('staff_role', v_staff_role));
      SELECT * INTO v_org FROM public.pharmacy_orgs WHERE id = v_org_id;
      RETURN v_org;
    END IF;
  END IF;

  SELECT po.id INTO v_org_id
  FROM public.pharmacy_orgs po
  WHERE po.owner_user_id = v_user_id
  ORDER BY po.created_at
  LIMIT 1 FOR UPDATE;
  IF v_org_id IS NOT NULL THEN
    INSERT INTO public.pharmacy_members (org_id, user_id, staff_role)
    VALUES (v_org_id, v_user_id, 'pharmacy_admin')
    ON CONFLICT (org_id, user_id, staff_role) DO UPDATE SET is_active = true;
    PERFORM public.seed_pharmacy_defaults(v_org_id);
    INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, details)
    VALUES (v_org_id, v_user_id, 'workspace.membership_recovered', 'pharmacy_member', jsonb_build_object('staff_role', 'pharmacy_admin'));
    SELECT * INTO v_org FROM public.pharmacy_orgs WHERE id = v_org_id;
    RETURN v_org;
  END IF;

  INSERT INTO public.pharmacy_orgs (name, owner_user_id, verification_status, timezone)
  VALUES (COALESCE(NULLIF(btrim(v_org_name), ''), 'Pharmacy'), v_user_id, 'pending', 'Asia/Kolkata')
  RETURNING * INTO v_org;
  INSERT INTO public.pharmacy_members (org_id, user_id, staff_role)
  VALUES (v_org.id, v_user_id, 'pharmacy_admin');
  PERFORM public.seed_pharmacy_defaults(v_org.id);
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, entity_id, details)
  VALUES (v_org.id, v_user_id, 'workspace.created', 'pharmacy_org', v_org.id,
          jsonb_build_object('source', 'ensure_pharmacy_workspace'));
  RETURN v_org;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_pharmacy_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_pharmacy_workspace() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_pharmacy_org(p_org_id uuid, p_updates jsonb)
RETURNS public.pharmacy_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.pharmacy_orgs;
  v_key text;
  v_allowed constant text[] := ARRAY[
    'name', 'drug_licence_no', 'gstin', 'pharmacist_name', 'pharmacist_reg_no', 'phone', 'email',
    'address_line', 'city', 'state', 'pincode', 'latitude', 'longitude', 'timezone', 'opening_hours',
    'is_open', 'home_delivery', 'accepts_online_orders', 'listing_enabled', 'settings'
  ];
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'settings.manage') THEN
    RAISE EXCEPTION 'settings.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF p_updates IS NULL OR jsonb_typeof(p_updates) <> 'object' OR p_updates = '{}'::jsonb THEN
    RAISE EXCEPTION 'A non-empty settings object is required' USING ERRCODE = '22023';
  END IF;
  SELECT key INTO v_key FROM jsonb_object_keys(p_updates) AS supplied(key)
  WHERE NOT (key = ANY (v_allowed)) LIMIT 1;
  IF v_key IS NOT NULL THEN
    RAISE EXCEPTION 'Unsupported pharmacy setting: %', v_key USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_orgs WHERE id = p_org_id AND verification_status = 'suspended') THEN
    RAISE EXCEPTION 'Suspended pharmacy workspaces are read-only' USING ERRCODE = '42501';
  END IF;
  IF p_updates ? 'name' AND NULLIF(btrim(p_updates->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'Pharmacy name is required' USING ERRCODE = '22023';
  END IF;
  IF p_updates ? 'timezone' AND NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = p_updates->>'timezone'
  ) THEN
    RAISE EXCEPTION 'Invalid pharmacy timezone' USING ERRCODE = '22023';
  END IF;
  IF p_updates ? 'opening_hours' AND jsonb_typeof(p_updates->'opening_hours') <> 'object' THEN
    RAISE EXCEPTION 'Opening hours must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_updates ? 'settings' AND jsonb_typeof(p_updates->'settings') <> 'object' THEN
    RAISE EXCEPTION 'Settings must be an object' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_updates) AS setting(key, value)
    WHERE key IN ('is_open', 'home_delivery', 'accepts_online_orders', 'listing_enabled')
      AND jsonb_typeof(value) <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'Operational flags must be booleans' USING ERRCODE = '22023';
  END IF;
  IF p_updates ? 'listing_enabled'
     AND (p_updates->>'listing_enabled')::boolean
     AND NOT EXISTS (
       SELECT 1 FROM public.pharmacy_orgs
       WHERE id = p_org_id AND verification_status = 'verified'
     ) THEN
    RAISE EXCEPTION 'Pharmacy listing requires platform verification' USING ERRCODE = '42501';
  END IF;

  UPDATE public.pharmacy_orgs
  SET name = CASE WHEN p_updates ? 'name' THEN btrim(p_updates->>'name') ELSE name END,
      drug_licence_no = CASE WHEN p_updates ? 'drug_licence_no' THEN NULLIF(btrim(p_updates->>'drug_licence_no'), '') ELSE drug_licence_no END,
      gstin = CASE WHEN p_updates ? 'gstin' THEN NULLIF(btrim(p_updates->>'gstin'), '') ELSE gstin END,
      pharmacist_name = CASE WHEN p_updates ? 'pharmacist_name' THEN NULLIF(btrim(p_updates->>'pharmacist_name'), '') ELSE pharmacist_name END,
      pharmacist_reg_no = CASE WHEN p_updates ? 'pharmacist_reg_no' THEN NULLIF(btrim(p_updates->>'pharmacist_reg_no'), '') ELSE pharmacist_reg_no END,
      phone = CASE WHEN p_updates ? 'phone' THEN NULLIF(btrim(p_updates->>'phone'), '') ELSE phone END,
      email = CASE WHEN p_updates ? 'email' THEN NULLIF(btrim(p_updates->>'email'), '') ELSE email END,
      address_line = CASE WHEN p_updates ? 'address_line' THEN NULLIF(btrim(p_updates->>'address_line'), '') ELSE address_line END,
      city = CASE WHEN p_updates ? 'city' THEN NULLIF(btrim(p_updates->>'city'), '') ELSE city END,
      state = CASE WHEN p_updates ? 'state' THEN NULLIF(btrim(p_updates->>'state'), '') ELSE state END,
      pincode = CASE WHEN p_updates ? 'pincode' THEN NULLIF(btrim(p_updates->>'pincode'), '') ELSE pincode END,
      latitude = CASE WHEN p_updates ? 'latitude' THEN NULLIF(p_updates->>'latitude', '')::numeric ELSE latitude END,
      longitude = CASE WHEN p_updates ? 'longitude' THEN NULLIF(p_updates->>'longitude', '')::numeric ELSE longitude END,
      timezone = CASE WHEN p_updates ? 'timezone' THEN p_updates->>'timezone' ELSE timezone END,
      opening_hours = CASE WHEN p_updates ? 'opening_hours' THEN p_updates->'opening_hours' ELSE opening_hours END,
      is_open = CASE WHEN p_updates ? 'is_open' THEN (p_updates->>'is_open')::boolean ELSE is_open END,
      home_delivery = CASE WHEN p_updates ? 'home_delivery' THEN (p_updates->>'home_delivery')::boolean ELSE home_delivery END,
      accepts_online_orders = CASE WHEN p_updates ? 'accepts_online_orders' THEN (p_updates->>'accepts_online_orders')::boolean ELSE accepts_online_orders END,
      listing_enabled = CASE WHEN p_updates ? 'listing_enabled' THEN (p_updates->>'listing_enabled')::boolean ELSE listing_enabled END,
      settings = CASE WHEN p_updates ? 'settings' THEN p_updates->'settings' ELSE settings END,
      updated_at = now()
  WHERE id = p_org_id
  RETURNING * INTO v_org;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Pharmacy workspace not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, entity_id, details)
  VALUES (p_org_id, auth.uid(), 'workspace.updated', 'pharmacy_org', p_org_id,
          jsonb_build_object('fields', (SELECT jsonb_agg(key) FROM jsonb_object_keys(p_updates) AS changed(key))));
  RETURN v_org;
END;
$$;
REVOKE ALL ON FUNCTION public.update_pharmacy_org(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_pharmacy_org(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.request_pharmacy_verification(p_org_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_at timestamptz;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'settings.manage') THEN
    RAISE EXCEPTION 'settings.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pharmacy_orgs po
    WHERE po.id = p_org_id AND po.verification_status = 'pending'
      AND NULLIF(btrim(po.drug_licence_no), '') IS NOT NULL
      AND NULLIF(btrim(po.gstin), '') IS NOT NULL
      AND NULLIF(btrim(po.pharmacist_reg_no), '') IS NOT NULL
      AND NULLIF(btrim(po.address_line), '') IS NOT NULL
      AND NULLIF(btrim(po.city), '') IS NOT NULL
      AND NULLIF(btrim(po.state), '') IS NOT NULL
      AND NULLIF(btrim(po.pincode), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Complete licence, GSTIN, pharmacist registration, and address details before requesting verification' USING ERRCODE = '22023';
  END IF;
  UPDATE public.pharmacy_orgs
  SET verification_requested_at = COALESCE(verification_requested_at, now()), updated_at = now()
  WHERE id = p_org_id
  RETURNING verification_requested_at INTO v_requested_at;
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, entity_id)
  VALUES (p_org_id, auth.uid(), 'verification.requested', 'pharmacy_org', p_org_id);
  RETURN v_requested_at;
END;
$$;
REVOKE ALL ON FUNCTION public.request_pharmacy_verification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_pharmacy_verification(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_pharmacy_verification(p_org_id uuid, p_status text)
RETURNS public.pharmacy_orgs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org public.pharmacy_orgs;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'system admin role required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pending', 'verified', 'suspended') THEN
    RAISE EXCEPTION 'Invalid pharmacy verification status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.pharmacy_orgs
  SET verification_status = p_status, updated_at = now()
  WHERE id = p_org_id
  RETURNING * INTO v_org;
  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Pharmacy workspace not found' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, entity_id, details)
  VALUES (p_org_id, auth.uid(), 'verification.changed', 'pharmacy_org', p_org_id, jsonb_build_object('status', p_status));
  RETURN v_org;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_pharmacy_verification(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pharmacy_verification(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.invite_pharmacy_staff(p_org_id uuid, p_email text, p_staff_role text)
RETURNS public.pharmacy_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite public.pharmacy_invites;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_orgs WHERE id = p_org_id AND verification_status = 'suspended') THEN
    RAISE EXCEPTION 'Suspended pharmacy workspaces are read-only' USING ERRCODE = '42501';
  END IF;
  IF p_staff_role NOT IN ('pharmacy_admin', 'pharmacist', 'store_staff', 'delivery_staff') THEN
    RAISE EXCEPTION 'Invalid pharmacy staff role' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(p_email), '') IS NULL OR position('@' IN p_email) < 2 THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.pharmacy_invites (org_id, email, staff_role, expires_at, accepted_at)
  VALUES (p_org_id, lower(btrim(p_email)), p_staff_role, now() + interval '7 days', NULL)
  ON CONFLICT (org_id, email, staff_role)
  DO UPDATE SET expires_at = EXCLUDED.expires_at, accepted_at = NULL
  RETURNING * INTO v_invite;
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, entity_id, details)
  VALUES (p_org_id, auth.uid(), 'staff.invited', 'pharmacy_invite', v_invite.id,
          jsonb_build_object('email', lower(btrim(p_email)), 'staff_role', p_staff_role));
  RETURN v_invite;
END;
$$;
REVOKE ALL ON FUNCTION public.invite_pharmacy_staff(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_pharmacy_staff(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_pharmacy_invite(p_org_id uuid, p_invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted boolean;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_orgs WHERE id = p_org_id AND verification_status = 'suspended') THEN
    RAISE EXCEPTION 'Suspended pharmacy workspaces are read-only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.pharmacy_invites
  WHERE id = p_invite_id AND org_id = p_org_id AND accepted_at IS NULL;
  v_deleted := FOUND;
  IF v_deleted THEN
    INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, entity_id)
    VALUES (p_org_id, auth.uid(), 'staff.invite_revoked', 'pharmacy_invite', p_invite_id);
  END IF;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_pharmacy_invite(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_pharmacy_invite(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_pharmacy_member_active(p_org_id uuid, p_user_id uuid, p_active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed boolean;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_orgs WHERE id = p_org_id AND verification_status = 'suspended') THEN
    RAISE EXCEPTION 'Suspended pharmacy workspaces are read-only' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));
  UPDATE public.pharmacy_members
  SET is_active = p_active
  WHERE org_id = p_org_id AND user_id = p_user_id;
  v_changed := FOUND;
  IF NOT v_changed THEN
    RAISE EXCEPTION 'Pharmacy member not found in this workspace' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pharmacy_members
    WHERE org_id = p_org_id AND staff_role = 'pharmacy_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'The pharmacy must keep at least one active administrator' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, details)
  VALUES (p_org_id, auth.uid(), 'staff.active_changed', 'pharmacy_member',
          jsonb_build_object('user_id', p_user_id, 'is_active', p_active));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.set_pharmacy_member_active(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pharmacy_member_active(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_pharmacy_member_roles(p_org_id uuid, p_user_id uuid, p_roles text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_active boolean;
  v_role text;
BEGIN
  IF NOT public.pharmacy_has_cap(p_org_id, 'staff.manage') THEN
    RAISE EXCEPTION 'staff.manage capability required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_orgs WHERE id = p_org_id AND verification_status = 'suspended') THEN
    RAISE EXCEPTION 'Suspended pharmacy workspaces are read-only' USING ERRCODE = '42501';
  END IF;
  IF p_roles IS NULL OR cardinality(p_roles) = 0 OR EXISTS (
    SELECT 1 FROM unnest(p_roles) AS requested(role_name)
    WHERE requested.role_name NOT IN ('pharmacy_admin', 'pharmacist', 'store_staff', 'delivery_staff')
  ) THEN
    RAISE EXCEPTION 'At least one valid pharmacy staff role is required' USING ERRCODE = '22023';
  END IF;
  IF cardinality(p_roles) <> (SELECT count(DISTINCT role_name) FROM unnest(p_roles) AS requested(role_name)) THEN
    RAISE EXCEPTION 'Duplicate pharmacy staff roles are not allowed' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));
  SELECT bool_or(is_active) INTO v_is_active
  FROM public.pharmacy_members WHERE org_id = p_org_id AND user_id = p_user_id;
  IF v_is_active IS NULL THEN
    RAISE EXCEPTION 'Pharmacy member not found in this workspace' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM public.pharmacy_members WHERE org_id = p_org_id AND user_id = p_user_id;
  FOREACH v_role IN ARRAY p_roles LOOP
    INSERT INTO public.pharmacy_members (org_id, user_id, staff_role, is_active)
    VALUES (p_org_id, p_user_id, v_role, v_is_active);
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM public.pharmacy_members
    WHERE org_id = p_org_id AND staff_role = 'pharmacy_admin' AND is_active = true
  ) THEN
    RAISE EXCEPTION 'The pharmacy must keep at least one active administrator' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.pharmacy_audit (org_id, actor_user_id, action, entity, details)
  VALUES (p_org_id, auth.uid(), 'staff.roles_changed', 'pharmacy_member',
          jsonb_build_object('user_id', p_user_id, 'staff_roles', to_jsonb(p_roles)));
  RETURN p_roles;
END;
$$;
REVOKE ALL ON FUNCTION public.set_pharmacy_member_roles(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pharmacy_member_roles(uuid, uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.next_pharmacy_number(p_org_id uuid, p_kind text, p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  IF NOT public.is_pharmacy_member(p_org_id) THEN
    RAISE EXCEPTION 'Active pharmacy membership required' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_orgs WHERE id = p_org_id AND verification_status = 'suspended') THEN
    RAISE EXCEPTION 'Suspended pharmacy workspaces are read-only' USING ERRCODE = '42501';
  END IF;
  IF p_kind NOT IN ('customer', 'prescription', 'order', 'delivery', 'payment')
     OR p_prefix IS NULL OR length(p_prefix) > 24 THEN
    RAISE EXCEPTION 'Invalid pharmacy number kind or prefix' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.pharmacy_counters (org_id, kind, last_value)
  VALUES (p_org_id, p_kind, 1)
  ON CONFLICT (org_id, kind)
  DO UPDATE SET last_value = public.pharmacy_counters.last_value + 1
  RETURNING last_value INTO v_next;
  RETURN p_prefix || lpad(v_next::text, 6, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_pharmacy_number(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_pharmacy_number(uuid, text, text) TO authenticated;

DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY[
      'pharmacy_orgs', 'pharmacy_members', 'pharmacy_invites', 'pharmacy_counters', 'pharmacy_audit'
    ] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', v_table);
      END IF;
    END LOOP;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- 20261001120000_pharmacy_inventory_catalogue.sql
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

-- 20261001130000_pharmacy_customers_prescriptions.sql
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
