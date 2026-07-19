/*
# Medicine Price Intelligence — Database Schema

## Overview
Creates the full data model for OncoCare+'s Medicine Finder feature — a medicine
discovery and price comparison platform that aggregates medicine information from
verified pharmacy partners. This is NOT an e-commerce store; it helps patients
compare prices and availability across pharmacies.

## New Tables

1. **pharmacies** — Verified pharmacy partners
   - id (uuid, PK)
   - name (text) — pharmacy name
   - logo_url (text) — logo image URL
   - address (text) — street address
   - city (text) — city
   - state (text) — state
   - pincode (text) — postal code
   - latitude (numeric) — map latitude
   - longitude (numeric) — map longitude
   - contact_number (text) — phone
   - operating_hours (text) — e.g. "9 AM - 9 PM"
   - is_24x7 (boolean) — open 24 hours
   - home_delivery (boolean) — offers home delivery
   - cancer_medicines (boolean) — stocks cancer medicines
   - injectables (boolean) — stocks injectables
   - discount_available (boolean) — offers discounts
   - is_verified (boolean) — verified pharmacy badge
   - rating (numeric) — average rating 0-5
   - review_count (int) — number of reviews
   - gst_number (text) — GST registration
   - license_number (text) — pharmacy license
   - created_at (timestamptz)

2. **pharmacy_reviews** — Reviews for pharmacies
   - id (uuid, PK)
   - pharmacy_id (uuid, FK → pharmacies)
   - author_name (text)
   - rating (int, 1-5)
   - comment (text)
   - created_at (timestamptz)

3. **medicines** — Medicine catalog
   - id (uuid, PK)
   - name (text) — brand name
   - generic_name (text) — generic / salt name
   - category (text) — e.g. "Targeted Therapy", "Chemotherapy", "Hormonal"
   - strength (text) — e.g. "200mg"
   - form (text) — e.g. "Tablet", "Injection"
   - manufacturer (text) — manufacturer name
   - prescription_required (boolean) — Rx needed
   - mrp (numeric) — maximum retail price
   - description (text) — medicine description
   - image_url (text) — medicine image
   - is_oncology (boolean) — cancer medicine flag
   - created_at (timestamptz)

4. **medicine_prices** — Price entries per pharmacy per medicine
   - id (uuid, PK)
   - medicine_id (uuid, FK → medicines)
   - pharmacy_id (uuid, FK → pharmacies)
   - current_price (numeric) — selling price
   - discount_percent (numeric) — discount off MRP
   - availability (text) — 'in_stock' | 'low_stock' | 'out_of_stock'
   - distance_km (numeric) — distance from a reference point
   - delivery_time_hours (int) — estimated delivery in hours
   - updated_at (timestamptz)

5. **generic_alternatives** — Doctor-approved generic equivalents
   - id (uuid, PK)
   - brand_medicine_id (uuid, FK → medicines) — the branded medicine
   - generic_medicine_id (uuid, FK → medicines) — the generic equivalent
   - estimated_savings (numeric) — savings vs brand
   - is_doctor_approved (boolean)

6. **user_watchlist** — Saved medicines (single-tenant, no auth)
   - id (uuid, PK)
   - medicine_id (uuid, FK → medicines)
   - price_alert_threshold (numeric) — alert when price drops below this
   - notify_restock (boolean) — alert when back in stock
   - created_at (timestamptz)

7. **user_favourite_pharmacies** — Favourite pharmacies (single-tenant)
   - id (uuid, PK)
   - pharmacy_id (uuid, FK → pharmacies)
   - created_at (timestamptz)

8. **recently_viewed** — Recently viewed medicines (single-tenant)
   - id (uuid, PK)
   - medicine_id (uuid, FK → medicines)
   - viewed_at (timestamptz)

## Security
- RLS enabled on ALL tables.
- This is a no-auth (single-tenant) app — all policies use `TO anon, authenticated`
  so the anon-key client can read/write.
- All data is intentionally public/shared (medicine catalog, pharmacy info, prices).

## Important Notes
1. All tables use `gen_random_uuid()` for primary keys.
2. Foreign keys have `ON DELETE CASCADE` to maintain referential integrity.
3. Indexes added on frequently queried columns (medicine name, pharmacy id, availability).
4. No user_id columns — single-tenant app with no sign-in.
*/

-- Pharmacies
CREATE TABLE IF NOT EXISTS pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  logo_url text,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  pincode text,
  latitude numeric,
  longitude numeric,
  contact_number text,
  operating_hours text DEFAULT '9 AM - 9 PM',
  is_24x7 boolean DEFAULT false,
  home_delivery boolean DEFAULT true,
  cancer_medicines boolean DEFAULT true,
  injectables boolean DEFAULT false,
  discount_available boolean DEFAULT false,
  is_verified boolean DEFAULT true,
  rating numeric DEFAULT 4.0,
  review_count integer DEFAULT 0,
  gst_number text,
  license_number text,
  created_at timestamptz DEFAULT now()
);

-- Pharmacy reviews
CREATE TABLE IF NOT EXISTS pharmacy_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz DEFAULT now()
);

-- Medicines
CREATE TABLE IF NOT EXISTS medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  generic_name text,
  category text,
  strength text,
  form text DEFAULT 'Tablet',
  manufacturer text,
  prescription_required boolean DEFAULT true,
  mrp numeric NOT NULL DEFAULT 0,
  description text,
  image_url text,
  is_oncology boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Medicine prices (per pharmacy)
CREATE TABLE IF NOT EXISTS medicine_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  current_price numeric NOT NULL DEFAULT 0,
  discount_percent numeric DEFAULT 0,
  availability text NOT NULL DEFAULT 'in_stock' CHECK (availability IN ('in_stock', 'low_stock', 'out_of_stock')),
  distance_km numeric DEFAULT 0,
  delivery_time_hours integer DEFAULT 24,
  updated_at timestamptz DEFAULT now()
);

-- Generic alternatives
CREATE TABLE IF NOT EXISTS generic_alternatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_medicine_id uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  generic_medicine_id uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  estimated_savings numeric DEFAULT 0,
  is_doctor_approved boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- User watchlist (single-tenant)
CREATE TABLE IF NOT EXISTS user_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  price_alert_threshold numeric,
  notify_restock boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- User favourite pharmacies (single-tenant)
CREATE TABLE IF NOT EXISTS user_favourite_pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id uuid NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Recently viewed medicines (single-tenant)
CREATE TABLE IF NOT EXISTS recently_viewed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES medicines(id) ON DELETE CASCADE,
  viewed_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines (name);
CREATE INDEX IF NOT EXISTS idx_medicines_generic_name ON medicines (generic_name);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines (category);
CREATE INDEX IF NOT EXISTS idx_medicine_prices_medicine ON medicine_prices (medicine_id);
CREATE INDEX IF NOT EXISTS idx_medicine_prices_pharmacy ON medicine_prices (pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_medicine_prices_availability ON medicine_prices (availability);
CREATE INDEX IF NOT EXISTS idx_pharmacy_reviews_pharmacy ON pharmacy_reviews (pharmacy_id);
CREATE INDEX IF NOT EXISTS idx_user_watchlist_medicine ON user_watchlist (medicine_id);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_medicine ON recently_viewed (medicine_id);

-- Enable RLS on all tables
ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicine_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE generic_alternatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_favourite_pharmacies ENABLE ROW LEVEL SECURITY;
ALTER TABLE recently_viewed ENABLE ROW LEVEL SECURITY;

-- Pharmacies: public read, public write (single-tenant)
DROP POLICY IF EXISTS "anon_read_pharmacies" ON pharmacies;
CREATE POLICY "anon_read_pharmacies" ON pharmacies FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_pharmacies" ON pharmacies;
CREATE POLICY "anon_insert_pharmacies" ON pharmacies FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_pharmacies" ON pharmacies;
CREATE POLICY "anon_update_pharmacies" ON pharmacies FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_pharmacies" ON pharmacies;
CREATE POLICY "anon_delete_pharmacies" ON pharmacies FOR DELETE
  TO anon, authenticated USING (true);

-- Pharmacy reviews: public CRUD
DROP POLICY IF EXISTS "anon_read_reviews" ON pharmacy_reviews;
CREATE POLICY "anon_read_reviews" ON pharmacy_reviews FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_reviews" ON pharmacy_reviews;
CREATE POLICY "anon_insert_reviews" ON pharmacy_reviews FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_reviews" ON pharmacy_reviews;
CREATE POLICY "anon_update_reviews" ON pharmacy_reviews FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_reviews" ON pharmacy_reviews;
CREATE POLICY "anon_delete_reviews" ON pharmacy_reviews FOR DELETE
  TO anon, authenticated USING (true);

-- Medicines: public CRUD
DROP POLICY IF EXISTS "anon_read_medicines" ON medicines;
CREATE POLICY "anon_read_medicines" ON medicines FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_medicines" ON medicines;
CREATE POLICY "anon_insert_medicines" ON medicines FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_medicines" ON medicines;
CREATE POLICY "anon_update_medicines" ON medicines FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_medicines" ON medicines;
CREATE POLICY "anon_delete_medicines" ON medicines FOR DELETE
  TO anon, authenticated USING (true);

-- Medicine prices: public CRUD
DROP POLICY IF EXISTS "anon_read_prices" ON medicine_prices;
CREATE POLICY "anon_read_prices" ON medicine_prices FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_prices" ON medicine_prices;
CREATE POLICY "anon_insert_prices" ON medicine_prices FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_prices" ON medicine_prices;
CREATE POLICY "anon_update_prices" ON medicine_prices FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_prices" ON medicine_prices;
CREATE POLICY "anon_delete_prices" ON medicine_prices FOR DELETE
  TO anon, authenticated USING (true);

-- Generic alternatives: public CRUD
DROP POLICY IF EXISTS "anon_read_generics" ON generic_alternatives;
CREATE POLICY "anon_read_generics" ON generic_alternatives FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_generics" ON generic_alternatives;
CREATE POLICY "anon_insert_generics" ON generic_alternatives FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_generics" ON generic_alternatives;
CREATE POLICY "anon_update_generics" ON generic_alternatives FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_generics" ON generic_alternatives;
CREATE POLICY "anon_delete_generics" ON generic_alternatives FOR DELETE
  TO anon, authenticated USING (true);

-- User watchlist: public CRUD (single-tenant)
DROP POLICY IF EXISTS "anon_read_watchlist" ON user_watchlist;
CREATE POLICY "anon_read_watchlist" ON user_watchlist FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_watchlist" ON user_watchlist;
CREATE POLICY "anon_insert_watchlist" ON user_watchlist FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_watchlist" ON user_watchlist;
CREATE POLICY "anon_update_watchlist" ON user_watchlist FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_watchlist" ON user_watchlist;
CREATE POLICY "anon_delete_watchlist" ON user_watchlist FOR DELETE
  TO anon, authenticated USING (true);

-- User favourite pharmacies: public CRUD
DROP POLICY IF EXISTS "anon_read_fav_pharmacies" ON user_favourite_pharmacies;
CREATE POLICY "anon_read_fav_pharmacies" ON user_favourite_pharmacies FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_fav_pharmacies" ON user_favourite_pharmacies;
CREATE POLICY "anon_insert_fav_pharmacies" ON user_favourite_pharmacies FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_fav_pharmacies" ON user_favourite_pharmacies;
CREATE POLICY "anon_update_fav_pharmacies" ON user_favourite_pharmacies FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_fav_pharmacies" ON user_favourite_pharmacies;
CREATE POLICY "anon_delete_fav_pharmacies" ON user_favourite_pharmacies FOR DELETE
  TO anon, authenticated USING (true);

-- Recently viewed: public CRUD
DROP POLICY IF EXISTS "anon_read_recently_viewed" ON recently_viewed;
CREATE POLICY "anon_read_recently_viewed" ON recently_viewed FOR SELECT
  TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_recently_viewed" ON recently_viewed;
CREATE POLICY "anon_insert_recently_viewed" ON recently_viewed FOR INSERT
  TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_recently_viewed" ON recently_viewed;
CREATE POLICY "anon_update_recently_viewed" ON recently_viewed FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_recently_viewed" ON recently_viewed;
CREATE POLICY "anon_delete_recently_viewed" ON recently_viewed FOR DELETE
  TO anon, authenticated USING (true);
