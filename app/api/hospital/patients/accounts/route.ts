import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type PatientInput = {
  hospitalId?: string;
  patientIdentifier?: string;
  fullName?: string;
  email?: string;
  mobile?: string;
  dateOfBirth?: string;
  age?: number | null;
  gender?: string;
};

function temporaryPassword() {
  return `Onco-${randomBytes(18).toString('base64url')}-9!`;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character);
}

function loginUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured) {
    if (process.env.NODE_ENV === 'development') return 'http://localhost:3000/auth/sign-in';
    throw new Error('NEXT_PUBLIC_APP_URL must be configured before patient credentials can be emailed.');
  }
  const parsed = new URL(configured);
  if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && parsed.hostname === 'localhost')) {
    throw new Error('NEXT_PUBLIC_APP_URL must use HTTPS in production.');
  }
  if (parsed.username || parsed.password) throw new Error('NEXT_PUBLIC_APP_URL is invalid.');
  parsed.pathname = '/auth/sign-in';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}

async function sendOnboardingEmail(input: {
  to: string;
  patientId: string;
  hospitalName: string;
  password: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ONCOCARE_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error('Transactional email is not configured. Set RESEND_API_KEY and ONCOCARE_EMAIL_FROM before provisioning patients.');
  }
  const hospitalName = escapeHtml(input.hospitalName);
  const patientId = escapeHtml(input.patientId);
  const email = escapeHtml(input.to);
  const password = escapeHtml(input.password);
  const signInUrl = escapeHtml(loginUrl());
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: 'Your OncoCare patient account',
      html: `<p>Hello ${escapeHtml(input.patientId)},</p><p>${hospitalName} has created your OncoCare patient account.</p><p><strong>Patient ID:</strong> ${patientId}<br><strong>Login email:</strong> ${email}<br><strong>Temporary password:</strong> ${password}</p><p>Sign in at <a href="${signInUrl}">${signInUrl}</a>. Keep these credentials private and contact your hospital if you did not expect this email.</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Onboarding email failed (${response.status}).`);
}

function actorClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error('Supabase authentication is not configured.');
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.startsWith('Bearer ')
    ? request.headers.get('authorization')!.slice(7).trim()
    : '';
  if (!token) return jsonError('Authentication required.', 401);

  let createdUserId: string | null = null;
  let createdPatientId: string | null = null;
  let credentialsSent = false;
  try {
    const client = actorClient(token);
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return jsonError('Authentication required.', 401);

    const input = (await request.json()) as PatientInput;
    const hospitalId = input.hospitalId?.trim();
    const fullName = input.fullName?.trim();
    const email = input.email?.trim().toLowerCase();
    const mobile = input.mobile?.trim() || null;
    const dateOfBirth = input.dateOfBirth || null;
    const birthDate = dateOfBirth ? new Date(`${dateOfBirth}T00:00:00Z`) : null;
    if (!hospitalId || !fullName || !email) return jsonError('Hospital, patient name, and email are required.', 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('A valid email is required.', 400);
    if (dateOfBirth && (
      !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)
      || !birthDate
      || Number.isNaN(birthDate.getTime())
      || birthDate.toISOString().slice(0, 10) !== dateOfBirth
      || dateOfBirth > new Date().toISOString().slice(0, 10)
    )) {
      return jsonError('Date of birth must be a valid date that is not in the future.', 400);
    }
    if (input.age != null && (!Number.isInteger(input.age) || input.age < 0 || input.age > 150)) {
      return jsonError('Patient age must be a whole number between 0 and 150.', 400);
    }
    if (input.gender && !['male', 'female', 'other', 'prefer_not_to_say'].includes(input.gender)) {
      return jsonError('Patient gender is invalid.', 400);
    }

    const { data: canRegister, error: capabilityError } = await client.rpc('hospital_has_cap', {
      p_hospital_id: hospitalId,
      p_cap: 'patients.register',
    });
    if (capabilityError) throw capabilityError;
    if (!canRegister) return jsonError('Hospital patient-registration permission is required.', 403);

    const admin = createSupabaseAdminClient();
    const { data: hospital, error: hospitalError } = await admin
      .from('hospital_orgs')
      .select('name')
      .eq('id', hospitalId)
      .single();
    if (hospitalError) throw hospitalError;

    const password = temporaryPassword();
    const { data: createdAuth, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'patient' },
    });
    if (createError) {
      if (createError.code === 'email_exists' || /already registered|already exists/i.test(createError.message)) {
        return jsonError('An OncoCare account already exists for this email. It was not changed; link the existing account through the approved patient-account process.', 409);
      }
      throw createError;
    }
    if (!createdAuth.user) throw new Error('Patient account could not be created.');
    createdUserId = createdAuth.user.id;

    const { data: role, error: roleLookupError } = await admin.from('roles').select('id').eq('name', 'patient').single();
    if (roleLookupError) throw roleLookupError;
    const { error: roleError } = await admin.from('user_roles').insert({ user_id: createdUserId, role_id: role.id });
    if (roleError) throw roleError;

    const { error: profileError } = await admin.from('profiles').upsert({
      id: createdUserId,
      email,
      full_name: fullName,
      phone: mobile,
    });
    if (profileError) throw profileError;

    const { data: patient, error: patientError } = await client.rpc('register_hospital_patient', {
      p_hospital_id: hospitalId,
      p_identifier: input.patientIdentifier?.trim() || '',
      p_name: fullName,
      p_mobile: mobile,
      p_dob: dateOfBirth,
      p_age: dateOfBirth ? null : input.age ?? null,
      p_gender: input.gender || null,
    });
    if (patientError) throw patientError;
    if (!patient || typeof patient !== 'object' || !('id' in patient) || !('patient_identifier' in patient)) {
      throw new Error('Hospital patient registration returned an invalid record.');
    }
    const registeredPatient = patient as { id: string; patient_identifier: string };
    createdPatientId = registeredPatient.id;

    const { data: linkedPatient, error: linkError } = await admin
      .from('hospital_patients')
      .update({ patient_user_id: createdUserId })
      .eq('id', createdPatientId)
      .eq('hospital_id', hospitalId)
      .is('patient_user_id', null)
      .select('id')
      .maybeSingle();
    if (linkError) throw linkError;
    if (!linkedPatient) throw new Error('Patient account could not be linked to the hospital record.');

    await sendOnboardingEmail({
      to: email,
      patientId: registeredPatient.patient_identifier,
      hospitalName: hospital.name,
      password,
    });
    credentialsSent = true;

    const { error: auditError } = await admin.from('hospital_access_audit').insert({
      hospital_id: hospitalId,
      patient_id: createdPatientId,
      actor_user_id: authData.user.id,
      action: 'patient_account_created',
      details: { patient_identifier: registeredPatient.patient_identifier, user_id: createdUserId },
    });
    if (auditError) throw auditError;

    return NextResponse.json({
      ok: true,
      patientId: createdPatientId,
      patientIdentifier: registeredPatient.patient_identifier,
    });
  } catch (cause) {
    const cleanupErrors: string[] = [];
    if (!credentialsSent) {
      if (createdPatientId) {
        const cleanup = createSupabaseAdminClient();
        const { error } = await cleanup.from('hospital_patients').delete().eq('id', createdPatientId);
        if (error) cleanupErrors.push(`Patient-record cleanup failed: ${error.message}`);
      }
      if (createdUserId) {
        const cleanup = createSupabaseAdminClient();
        const { error } = await cleanup.auth.admin.deleteUser(createdUserId);
        if (error) cleanupErrors.push(`Account cleanup failed: ${error.message}`);
      }
    }
    const message = cause instanceof Error ? cause.message : 'Patient account operation failed.';
    return jsonError(cleanupErrors.length ? `${message} ${cleanupErrors.join(' ')}` : message, 500);
  }
}
