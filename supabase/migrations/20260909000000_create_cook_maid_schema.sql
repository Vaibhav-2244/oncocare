CREATE TABLE IF NOT EXISTS cook_maid_helpers (
  id text PRIMARY KEY,
  name text NOT NULL,
  service text NOT NULL CHECK (service IN ('Cook', 'Maid', 'Cook + Maid')),
  location text NOT NULL,
  experience text NOT NULL,
  rating numeric(3,2) NOT NULL DEFAULT 4.8,
  reviews integer NOT NULL DEFAULT 0,
  price_per_day integer NOT NULL DEFAULT 700,
  avatar text NOT NULL,
  verified boolean NOT NULL DEFAULT true,
  skills text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  about text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cook_maid_bookings (
  id text PRIMARY KEY,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  helper_id text NOT NULL,
  helper_name text NOT NULL,
  service text NOT NULL CHECK (service IN ('Cook', 'Maid', 'Cook + Maid')),
  location text NOT NULL,
  patient_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  duration_days integer NOT NULL CHECK (duration_days > 0),
  price_per_day integer NOT NULL,
  total_amount integer NOT NULL,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cook_maid_helpers_location ON cook_maid_helpers (location);
CREATE INDEX IF NOT EXISTS idx_cook_maid_bookings_user ON cook_maid_bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_cook_maid_bookings_helper ON cook_maid_bookings (helper_id);
CREATE INDEX IF NOT EXISTS idx_cook_maid_bookings_dates ON cook_maid_bookings (start_date, end_date);

ALTER TABLE cook_maid_helpers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cook_maid_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_cook_maid_helpers" ON cook_maid_helpers;
CREATE POLICY "select_own_cook_maid_helpers" ON cook_maid_helpers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "select_own_cook_maid_bookings" ON cook_maid_bookings;
CREATE POLICY "select_own_cook_maid_bookings" ON cook_maid_bookings FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_cook_maid_bookings" ON cook_maid_bookings;
CREATE POLICY "insert_own_cook_maid_bookings" ON cook_maid_bookings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_cook_maid_bookings" ON cook_maid_bookings;
CREATE POLICY "update_own_cook_maid_bookings" ON cook_maid_bookings FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_cook_maid_bookings" ON cook_maid_bookings;
CREATE POLICY "delete_own_cook_maid_bookings" ON cook_maid_bookings FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
