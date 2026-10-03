import { createClient } from '@supabase/supabase-js';

async function main() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const doctorId = process.env.DOCTOR_USER_ID;
const patientId = process.env.DOCTOR_PATIENT_ID;

if (!url || !key || !doctorId || !patientId) {
  throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DOCTOR_USER_ID, and DOCTOR_PATIENT_ID.');
}

const supabase = createClient(url, key);
const { data: patient, error: patientError } = await supabase
  .from('doctor_patients')
  .select('patient_user_id')
  .eq('id', patientId)
  .eq('doctor_id', doctorId)
  .single();
if (patientError || !patient?.patient_user_id) throw new Error(patientError?.message || 'Patient is not linked.');

await supabase.from('symptoms').insert({ user_id: patient.patient_user_id, name: 'Fatigue', severity: 6, notes: 'Simulation data' });
await supabase.from('side_effect_entries').insert({ user_id: patient.patient_user_id, name: 'Nausea', severity: 5, notes: 'Simulation data', source: 'doctor-simulation' });
console.log('Inserted simulation symptom and side-effect entries for the linked patient.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
