-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================================================
-- BPL PATIENTS TABLE
-- ========================================================================
CREATE TABLE IF NOT EXISTS bpl_patients (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  age INTEGER NOT NULL,
  gender VARCHAR(20) NOT NULL,
  cancer_type VARCHAR(100) NOT NULL,
  stage VARCHAR(50) NOT NULL,
  location VARCHAR(100) NOT NULL,
  treatment VARCHAR(255) NOT NULL,
  goal_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  raised_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
  donors_count INTEGER NOT NULL DEFAULT 0,
  urgent BOOLEAN NOT NULL DEFAULT FALSE,
  image_url TEXT,
  summary TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  CONSTRAINT goal_positive CHECK (goal_amount > 0),
  CONSTRAINT raised_non_negative CHECK (raised_amount >= 0),
  CONSTRAINT donors_non_negative CHECK (donors_count >= 0)
);

-- ========================================================================
-- BPL DONATIONS TABLE
-- ========================================================================
CREATE TABLE IF NOT EXISTS bpl_donations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id BIGINT NOT NULL REFERENCES bpl_patients(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  donor_name VARCHAR(255) NOT NULL,
  donor_email VARCHAR(255) NOT NULL,
  amount DECIMAL(12, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'upi',
  status VARCHAR(50) NOT NULL DEFAULT 'successful',
  receipt_path TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT amount_positive CHECK (amount > 0),
  CONSTRAINT valid_payment_method CHECK (payment_method IN ('upi', 'card', 'netbanking'))
);

-- ========================================================================
-- BPL VERIFICATION TABLE
-- ========================================================================
CREATE TABLE IF NOT EXISTS bpl_verification (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES bpl_patients(id) ON DELETE CASCADE,
  bpl_status_verified BOOLEAN NOT NULL DEFAULT FALSE,
  medical_documents_verified BOOLEAN NOT NULL DEFAULT FALSE,
  beneficiary_account_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verification_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(patient_id)
);

-- ========================================================================
-- INDEXES
-- ========================================================================
CREATE INDEX idx_bpl_patients_verified ON bpl_patients(verified);
CREATE INDEX idx_bpl_patients_urgent ON bpl_patients(urgent);
CREATE INDEX idx_bpl_patients_created_by ON bpl_patients(created_by);
CREATE INDEX idx_bpl_donations_patient_id ON bpl_donations(patient_id);
CREATE INDEX idx_bpl_donations_donor_id ON bpl_donations(donor_id);
CREATE INDEX idx_bpl_donations_created_at ON bpl_donations(created_at);
CREATE INDEX idx_bpl_donations_status ON bpl_donations(status);
CREATE INDEX idx_bpl_verification_patient_id ON bpl_verification(patient_id);

-- ========================================================================
-- ROW LEVEL SECURITY (RLS)
-- ========================================================================

-- Enable RLS on all tables
ALTER TABLE bpl_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpl_donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bpl_verification ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- BPL_PATIENTS RLS POLICIES
-- ========================================================================

-- Public can view verified patients
CREATE POLICY "public_view_verified_patients" ON bpl_patients
  FOR SELECT
  USING (verified = TRUE);

-- Authenticated users can view all patients (for dashboard)
CREATE POLICY "auth_view_all_patients" ON bpl_patients
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- Only admin/healthcare provider can create patients
CREATE POLICY "admin_create_patients" ON bpl_patients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  );

-- Patient creator and admin can update
CREATE POLICY "update_own_or_admin_patients" ON bpl_patients
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  )
  WITH CHECK (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  );

-- ========================================================================
-- BPL_DONATIONS RLS POLICIES
-- ========================================================================

-- Authenticated users can create donations
CREATE POLICY "auth_create_donations" ON bpl_donations
  FOR INSERT
  TO authenticated
  WITH CHECK (donor_id = auth.uid() OR donor_id IS NULL);

-- Users can view their own donations, admins see all
CREATE POLICY "view_own_or_admin_donations" ON bpl_donations
  FOR SELECT
  TO authenticated
  USING (
    donor_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  );

-- Donors can update their own donations
CREATE POLICY "update_own_donations" ON bpl_donations
  FOR UPDATE
  TO authenticated
  USING (donor_id = auth.uid())
  WITH CHECK (donor_id = auth.uid());

-- ========================================================================
-- BPL_VERIFICATION RLS POLICIES
-- ========================================================================

-- Authenticated users can view verification status for verified patients
CREATE POLICY "view_verification" ON bpl_verification
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bpl_patients
      WHERE bpl_patients.id = bpl_verification.patient_id
      AND bpl_patients.verified = TRUE
    ) OR
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  );

-- Only admin/healthcare provider can create/update verification
CREATE POLICY "admin_manage_verification" ON bpl_verification
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.name IN ('admin', 'healthcare_provider', 'hospital_manager')
    )
  );

-- ========================================================================
-- TRIGGERS FOR UPDATED_AT TIMESTAMPS
-- ========================================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bpl_patients_update_timestamp
  BEFORE UPDATE ON bpl_patients
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER bpl_donations_update_timestamp
  BEFORE UPDATE ON bpl_donations
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER bpl_verification_update_timestamp
  BEFORE UPDATE ON bpl_verification
  FOR EACH ROW
  EXECUTE FUNCTION update_timestamp();

-- ========================================================================
-- GRANT PERMISSIONS
-- ========================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON bpl_patients TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bpl_donations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bpl_verification TO authenticated;
