export type PharmacyVerificationStatus = 'pending' | 'verified' | 'suspended';
export type PharmacyStaffRole = 'pharmacy_admin' | 'pharmacist' | 'store_staff' | 'delivery_staff';

export interface PharmacyOrg {
  id: string;
  name: string;
  owner_user_id: string | null;
  drug_licence_no: string | null;
  gstin: string | null;
  pharmacist_name: string | null;
  pharmacist_reg_no: string | null;
  phone: string | null;
  email: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  opening_hours: Record<string, unknown>;
  is_open: boolean;
  home_delivery: boolean;
  accepts_online_orders: boolean;
  listing_enabled: boolean;
  verification_status: PharmacyVerificationStatus;
  verification_requested_at: string | null;
  directory_pharmacy_id: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PharmacyMember {
  id: string;
  org_id: string;
  user_id: string;
  staff_role: PharmacyStaffRole;
  is_active: boolean;
  created_at: string;
}
