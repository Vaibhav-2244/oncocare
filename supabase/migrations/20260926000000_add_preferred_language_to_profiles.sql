ALTER TABLE public.profiles
  ADD COLUMN preferred_language text NOT NULL DEFAULT 'en'
  CHECK (preferred_language IN ('en', 'hi'));
