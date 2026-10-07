-- Hospital-managed doctor account metadata. Passwords remain exclusively in Supabase Auth.
ALTER TABLE public.hospital_doctors
  ADD COLUMN IF NOT EXISTS doctor_identifier text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS registration_no text,
  ADD COLUMN IF NOT EXISTS registration_council text;

CREATE UNIQUE INDEX IF NOT EXISTS hospital_doctors_doctor_identifier_unique
  ON public.hospital_doctors (doctor_identifier)
  WHERE doctor_identifier IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS hospital_doctors_email_unique
  ON public.hospital_doctors (lower(email))
  WHERE email IS NOT NULL;

REVOKE ALL ON FUNCTION public.create_hospital_doctor(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_hospital_doctor_active(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_hospital_doctor(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_hospital_doctor_active(uuid, uuid, boolean) TO authenticated;
