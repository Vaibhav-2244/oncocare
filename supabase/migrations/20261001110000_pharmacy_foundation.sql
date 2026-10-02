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
