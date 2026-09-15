-- Cancer insurance catalog and authenticated patient enquiries.

CREATE TABLE IF NOT EXISTS public.insurance_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.insurance_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  coverage_amount numeric NOT NULL CHECK (coverage_amount >= 0),
  waiting_period_months integer NOT NULL DEFAULT 0 CHECK (waiting_period_months >= 0),
  estimated_premium numeric NOT NULL DEFAULT 0 CHECK (estimated_premium >= 0),
  cancer_coverage boolean NOT NULL DEFAULT true,
  hospital_network_size integer NOT NULL DEFAULT 0 CHECK (hospital_network_size >= 0),
  benefits text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.insurance_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.insurance_plans(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  city text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'in_progress', 'completed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.insurance_enquiries
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.insurance_enquiries
  ALTER COLUMN user_id SET DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS insurance_plans_provider_id_idx ON public.insurance_plans(provider_id);
CREATE INDEX IF NOT EXISTS insurance_plans_active_idx ON public.insurance_plans(is_active, cancer_coverage);
CREATE INDEX IF NOT EXISTS insurance_enquiries_user_id_idx ON public.insurance_enquiries(user_id);

ALTER TABLE public.insurance_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_enquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_users_read_insurance_providers" ON public.insurance_providers;
CREATE POLICY "authenticated_users_read_insurance_providers" ON public.insurance_providers
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_users_read_active_insurance_plans" ON public.insurance_plans;
CREATE POLICY "authenticated_users_read_active_insurance_plans" ON public.insurance_plans
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "users_read_own_insurance_enquiries" ON public.insurance_enquiries;
CREATE POLICY "users_read_own_insurance_enquiries" ON public.insurance_enquiries
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_create_own_insurance_enquiries" ON public.insurance_enquiries;
CREATE POLICY "users_create_own_insurance_enquiries" ON public.insurance_enquiries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.get_insurance_referrals_by_email(p_email text)
RETURNS TABLE (
  id uuid,
  plan_id uuid,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT enquiry.id, enquiry.plan_id, enquiry.status, enquiry.created_at
  FROM public.insurance_enquiries AS enquiry
  WHERE enquiry.user_id = auth.uid()
  ORDER BY enquiry.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_insurance_referrals_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_insurance_referrals_by_email(text) TO authenticated;
