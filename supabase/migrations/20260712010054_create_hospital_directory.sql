/*
# Hospital Directory Schema

## Overview
Creates a hospitals table for nearby hospital lookup in the Emergency SOS feature.

## New Table
1. **hospitals** — Hospital directory with location data
   - id, name, address, city, state, pincode, latitude, longitude, phone, emergency_phone, is_24x7, has_emergency, has_icu, has_oncology, rating, created_at

## Security
- RLS enabled. All authenticated users can read. No inserts/updates/deletes from the app.
*/
CREATE TABLE IF NOT EXISTS hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text,
  pincode text,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  phone text,
  emergency_phone text,
  is_24x7 boolean DEFAULT true,
  has_emergency boolean DEFAULT true,
  has_icu boolean DEFAULT true,
  has_oncology boolean DEFAULT true,
  rating numeric(2, 1) DEFAULT 4.0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_city ON hospitals (city);
CREATE INDEX IF NOT EXISTS idx_hospitals_oncology ON hospitals (has_oncology);

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_hospitals" ON hospitals;
CREATE POLICY "select_hospitals" ON hospitals FOR SELECT TO authenticated USING (true);

-- Seed data: major Indian hospitals with oncology departments
INSERT INTO hospitals (name, address, city, state, pincode, latitude, longitude, phone, emergency_phone, is_24x7, has_emergency, has_icu, has_oncology, rating) VALUES
('Tata Memorial Hospital', 'Dr. E Borges Road, Parel', 'Mumbai', 'Maharashtra', '400012', 18.9735, 72.8374, '02224177000', '02224177000', true, true, true, true, 4.8),
('AIIMS Delhi', 'Ansari Nagar, Aurobindo Marg', 'New Delhi', 'Delhi', '110029', 28.5956, 77.2522, '01126588500', '01126588600', true, true, true, true, 4.7),
('Apollo Hospitals', 'Greams Road, Thousand Lights', 'Chennai', 'Tamil Nadu', '600006', 13.0524, 80.2509, '04428293333', '04428293333', true, true, true, true, 4.6),
('Kidwai Memorial Institute of Oncology', 'Hosur Road, Ramanara Pura', 'Bengaluru', 'Karnataka', '560029', 12.9352, 77.6245, '08026598900', '08026598900', true, true, true, true, 4.5),
('Rajiv Gandhi Cancer Institute', 'Sector 5, Rohini', 'New Delhi', 'Delhi', '110085', 28.7256, 77.0909, '01127057070', '01127057070', true, true, true, true, 4.6),
('Cancer Institute (WIA)', 'Gandhi Mandapam Road, Kotturpuram', 'Chennai', 'Tamil Nadu', '600036', 13.0151, 80.2336, '04424911500', '04424911500', true, true, true, true, 4.5),
('Homi Bhabha Cancer Hospital', 'Navi Mumbai, Varap', 'Navi Mumbai', 'Maharashtra', '410210', 19.1071, 73.1295, '02267477000', '02267477000', true, true, true, true, 4.4),
('Christian Medical College', 'Ida Scudder Road, Vellore', 'Vellore', 'Tamil Nadu', '632004', 12.9249, 79.1326, '04162282000', '04162282000', true, true, true, true, 4.7),
('Kokilaben Dhirubhai Ambani Hospital', 'Four Bungalows, Andheri West', 'Mumbai', 'Maharashtra', '400053', 19.1361, 72.8216, '02242696969', '02242696969', true, true, true, true, 4.6),
('Fortis Memorial Research Institute', 'Sector 62, Mohali', 'Mohali', 'Punjab', '160062', 30.7046, 76.7179, '01725055000', '01715055000', true, true, true, true, 4.5),
('Medanta The Medicity', 'Sector 38, Golf Course Road', 'Gurugram', 'Haryana', '122001', 28.4285, 77.0917, '01244141414', '01244141414', true, true, true, true, 4.6),
('Max Super Speciality Hospital', '1 Press Enclave Road, Saket', 'New Delhi', 'Delhi', '110017', 28.5245, 77.1855, '01126511555', '01126511555', true, true, true, true, 4.5),
('HCG Cancer Centre', 'No. 1, Margapalla Garden, Babughed', 'Bengaluru', 'Karnataka', '560027', 12.9279, 77.5786, '08049000000', '08049000000', true, true, true, true, 4.4),
('Amrita Institute of Medical Sciences', 'Amrita Nagar, Edappally', 'Kochi', 'Kerala', '682041', 10.0231, 76.3073, '04842855555', '04842855555', true, true, true, true, 4.6),
('PGIMER', 'Sector 12, Chandigarh', 'Chandigarh', 'Chandigarh', '160012', 30.7333, 76.7794, '01712754500', '01712754500', true, true, true, true, 4.7)
ON CONFLICT DO NOTHING;
