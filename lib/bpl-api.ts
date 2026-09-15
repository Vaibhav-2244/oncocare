'use client';

import { supabase } from '@/lib/supabase-client';

// Type definitions for BPL tables
export interface BplPatient {
  id?: number;
  name: string;
  age: number;
  gender: string;
  cancer_type: string;
  stage: string;
  location: string;
  treatment: string;
  goal_amount: number | string;
  raised_amount: number | string;
  donors_count: number;
  urgent: boolean;
  verified: boolean;
  image_url?: string | null;
  summary?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}

export interface BplDonation {
  id?: string;
  patient_id: number;
  donor_id?: string | null;
  donor_name: string;
  donor_email: string;
  amount: number | string;
  payment_method: 'upi' | 'card' | 'netbanking';
  status: string;
  receipt_path?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BplVerification {
  id?: number;
  patient_id: number;
  bpl_status_verified: boolean;
  medical_documents_verified: boolean;
  beneficiary_account_verified: boolean;
  verified_by?: string | null;
  verification_date?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

// ========================================================================
// PATIENT QUERIES
// ========================================================================

export async function fetchBplPatients(verified_only = false) {
  const query = supabase
    .from('bpl_patients')
    .select('*')
    .order('created_at', { ascending: false });

  if (verified_only) {
    query.eq('verified', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchBplPatientById(patientId: number) {
  const { data, error } = await supabase
    .from('bpl_patients')
    .select('*')
    .eq('id', patientId)
    .single();

  if (error) throw error;
  return data;
}

export async function searchBplPatients(query: string) {
  const searchTerm = `%${query.toLowerCase()}%`;
  
  const { data, error } = await supabase
    .from('bpl_patients')
    .select('*')
    .or(`name.ilike.${searchTerm},cancer_type.ilike.${searchTerm},location.ilike.${searchTerm}`)
    .eq('verified', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createBplPatient(patientData: Omit<BplPatient, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('bpl_patients')
    .insert([patientData])
    .select();

  if (error) throw error;
  return data[0];
}

export async function updateBplPatient(patientId: number, updates: Partial<BplPatient>) {
  const { data, error } = await supabase
    .from('bpl_patients')
    .update(updates)
    .eq('id', patientId)
    .select();

  if (error) throw error;
  return data[0];
}

// ========================================================================
// DONATION QUERIES
// ========================================================================

export async function fetchDonations(userId?: string) {
  let query = supabase
    .from('bpl_donations')
    .select('*')
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('donor_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function fetchPatientDonations(patientId: number) {
  const { data, error } = await supabase
    .from('bpl_donations')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}

export async function createDonation(donationData: Omit<BplDonation, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('bpl_donations')
    .insert([donationData])
    .select();

  if (error) throw error;

  return data[0];
}

// ========================================================================
// VERIFICATION QUERIES
// ========================================================================

export async function fetchPatientVerification(patientId: number) {
  const { data, error } = await supabase
    .from('bpl_verification')
    .select('*')
    .eq('patient_id', patientId)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function updatePatientVerification(
  patientId: number,
  verificationData: Partial<BplVerification>
) {
  const { data, error } = await supabase
    .from('bpl_verification')
    .upsert({
      patient_id: patientId,
      ...verificationData,
    })
    .select();

  if (error) throw error;
  return data[0];
}

// ========================================================================
// STATISTICS
// ========================================================================

export async function fetchBplStatistics(userId?: string) {
  const [patients, donations] = await Promise.all([
    fetchBplPatients(),
    fetchDonations(userId),
  ]);

  const totalRaised = donations.reduce((sum, d) => sum + (d.amount || 0), 0);
  const uniqueDonors = new Set(donations.map((d) => d.donor_id).filter(Boolean)).size;

  return {
    totalRaised,
    totalDonations: donations.length,
    uniqueDonors,
    activeCampaigns: patients.filter((p) => p.verified).length,
    totalPatients: patients.length,
  };
}
