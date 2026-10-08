import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type DoctorInput = {
  action?: 'create' | 'reset' | 'set_active';
  hospitalId?: string;
  doctorId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  specialty?: string;
  departmentId?: string | null;
  registrationNo?: string;
  registrationCouncil?: string;
  designation?: string;
  subspecialty?: string;
  qualifications?: string;
  yearsExperience?: number | null;
  employeeId?: string;
  joiningDate?: string | null;
  employmentType?: 'full_time' | 'part_time' | 'consultant' | 'visiting' | 'contract' | '';
  opdRoom?: string;
  shiftSchedule?: Array<{ day: number; start: string; end: string }>;
  emergencyAvailable?: boolean;
  officialEmail?: string;
  officialPhone?: string;
  isActive?: boolean;
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
    throw new Error('NEXT_PUBLIC_APP_URL must be configured before doctor credentials can be emailed.');
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

async function authenticatedUser(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : data.user;
}

async function hospitalAdmin(admin: ReturnType<typeof createSupabaseAdminClient>, hospitalId: string, userId: string) {
  const { data, error } = await admin
    .from('hospital_members')
    .select('staff_role')
    .eq('hospital_id', hospitalId)
    .eq('user_id', userId)
    .eq('is_active', true);
  if (error) throw error;
  return (data ?? []).some((member) => member.staff_role === 'hospital_admin');
}

async function sendOnboardingEmail(input: {
  to: string;
  doctorId: string;
  hospitalName: string;
  password: string;
  reset: boolean;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.ONCOCARE_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new Error('Transactional email is not configured. Set RESEND_API_KEY and ONCOCARE_EMAIL_FROM before provisioning doctors.');
  }
  const safeHospital = escapeHtml(input.hospitalName);
  const safeDoctorId = escapeHtml(input.doctorId);
  const safeEmail = escapeHtml(input.to);
  const safePassword = escapeHtml(input.password);
  const safeLoginUrl = escapeHtml(loginUrl());
  const subject = input.reset ? 'Your OncoCare doctor password was reset' : 'Your OncoCare doctor account';
  const html = `<p>Hello Doctor,</p><p>${input.reset ? 'Your hospital has reset your OncoCare password.' : 'Your hospital has created your OncoCare doctor account.'}</p><p><strong>Hospital:</strong> ${safeHospital}<br><strong>Doctor ID:</strong> ${safeDoctorId}<br><strong>Login email:</strong> ${safeEmail}<br><strong>Temporary password:</strong> ${safePassword}</p><p>Sign in at <a href="${safeLoginUrl}">${safeLoginUrl}</a>. Do not forward this email. Contact your hospital administrator if you did not request this change.</p>`;
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [input.to], subject, html }),
  });
  if (!response.ok) throw new Error(`Onboarding email failed (${response.status}).`);
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;
  let createdDoctorId: string | null = null;
  let credentialsSent = false;
  try {
    const actor = await authenticatedUser(request);
    if (!actor) return jsonError('Authentication required.', 401);
    const body = (await request.json()) as DoctorInput;
    const hospitalId = body.hospitalId?.trim();
    if (!hospitalId || !body.action) return jsonError('Hospital and action are required.', 400);
    const admin = createSupabaseAdminClient();
    if (!(await hospitalAdmin(admin, hospitalId, actor.id))) return jsonError('Hospital administrator access is required.', 403);

    if (body.action === 'set_active') {
      if (!body.doctorId || typeof body.isActive !== 'boolean') return jsonError('Doctor and active status are required.', 400);
      const { data: doctor, error: doctorError } = await admin.from('hospital_doctors').select('id,user_id').eq('id', body.doctorId).eq('hospital_id', hospitalId).maybeSingle();
      if (doctorError) throw doctorError;
      if (!doctor) return jsonError('Doctor not found.', 404);
      if (doctor.user_id && !body.isActive) {
        const { error: authError } = await admin.auth.admin.updateUserById(doctor.user_id, { ban_duration: '876000h' });
        if (authError) throw authError;
      }
      const { error } = await admin.from('hospital_doctors').update({
        is_active: body.isActive,
        employment_status: body.isActive ? 'active' : 'suspended',
      }).eq('id', doctor.id).eq('hospital_id', hospitalId);
      if (error) throw error;
      if (doctor.user_id) {
        const { error: membershipError } = await admin.from('hospital_members').update({ is_active: body.isActive })
          .eq('hospital_id', hospitalId).eq('user_id', doctor.user_id).eq('staff_role', 'doctor');
        if (membershipError) throw membershipError;
        if (body.isActive) {
          const { error: authError } = await admin.auth.admin.updateUserById(doctor.user_id, { ban_duration: 'none' });
          if (authError) throw authError;
        }
      }
      const { error: auditError } = await admin.from('hospital_access_audit').insert({ hospital_id: hospitalId, actor_user_id: actor.id, action: body.isActive ? 'doctor_activated' : 'doctor_deactivated', details: { doctor_id: doctor.id } });
      if (auditError) throw auditError;
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'reset') {
      if (!body.doctorId) return jsonError('Doctor is required.', 400);
      const { data: doctor, error: doctorError } = await admin.from('hospital_doctors').select('id,user_id,email,doctor_identifier').eq('id', body.doctorId).eq('hospital_id', hospitalId).eq('is_active', true).maybeSingle();
      if (doctorError) throw doctorError;
      if (!doctor?.user_id || !doctor.email || !doctor.doctor_identifier) return jsonError('Doctor account is not provisioned.', 409);
      const password = temporaryPassword();
      const { data: hospital, error: hospitalError } = await admin.from('hospital_orgs').select('name').eq('id', hospitalId).single();
      if (hospitalError) throw hospitalError;
      const { error: authError } = await admin.auth.admin.updateUserById(doctor.user_id, { password, ban_duration: 'none' });
      if (authError) throw authError;
      try {
        await sendOnboardingEmail({ to: doctor.email, doctorId: doctor.doctor_identifier, hospitalName: hospital.name, password, reset: true });
      } catch (emailError) {
        const { error: banError } = await admin.auth.admin.updateUserById(doctor.user_id, { ban_duration: '876000h' });
        if (banError) throw new Error('Password email failed and the account could not be disabled. Contact the platform administrator immediately.');
        throw emailError;
      }
      credentialsSent = true;
      const { error: auditError } = await admin.from('hospital_access_audit').insert({ hospital_id: hospitalId, actor_user_id: actor.id, action: 'doctor_password_reset', details: { doctor_id: doctor.id } });
      if (auditError) throw auditError;
      return NextResponse.json({ ok: true });
    }

    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim();
    if (!email || !fullName || !body.registrationNo?.trim() || !body.registrationCouncil?.trim()) return jsonError('Full name, email, registration number, and registration council are required.', 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError('A valid email is required.', 400);
    if (!body.specialty?.trim()) return jsonError('Specialization is required.', 400);
    if (body.yearsExperience != null && (!Number.isInteger(body.yearsExperience) || body.yearsExperience < 0 || body.yearsExperience > 80)) return jsonError('Years of experience must be between 0 and 80.', 400);
    if (body.joiningDate && (!/^\d{4}-\d{2}-\d{2}$/.test(body.joiningDate) || Number.isNaN(Date.parse(`${body.joiningDate}T00:00:00Z`)))) return jsonError('Joining date must be a valid date.', 400);
    const schedule = body.shiftSchedule ?? [];
    if (!Array.isArray(schedule) || schedule.some((shift) => !shift || !Number.isInteger(shift.day) || shift.day < 0 || shift.day > 6 || typeof shift.start !== 'string' || typeof shift.end !== 'string' || !/^\d{2}:\d{2}$/.test(shift.start) || !/^\d{2}:\d{2}$/.test(shift.end) || shift.start >= shift.end)) {
      return jsonError('Working schedule contains an invalid shift.', 400);
    }
    if (body.departmentId) {
      const { data: department } = await admin.from('hospital_departments').select('id').eq('id', body.departmentId).eq('hospital_id', hospitalId).eq('is_active', true).maybeSingle();
      if (!department) return jsonError('Department does not belong to this hospital.', 400);
    }
    const { data: existing, error: duplicateError } = await admin.from('hospital_doctors').select('id').ilike('email', email).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (existing) return jsonError('A doctor account already exists for this email.', 409);
    const password = temporaryPassword();
    const doctorIdentifier = `DOC-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
    const { data: authData, error: authError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName, role: 'doctor' } });
    if (authError) {
      if (authError.code === 'email_exists' || /already registered|already exists/i.test(authError.message)) {
        return jsonError('An account already exists for this email.', 409);
      }
      throw authError;
    }
    if (!authData.user) throw new Error('Doctor account could not be created.');
    createdUserId = authData.user.id;
    const { data: role } = await admin.from('roles').select('id').eq('name', 'doctor').single();
    if (!role) throw new Error('Doctor role is not configured.');
    const { error: roleError } = await admin.from('user_roles').insert({ user_id: createdUserId, role_id: role.id });
    if (roleError) throw roleError;
    const { error: profileError } = await admin.from('doctor_profiles').upsert({ user_id: createdUserId, full_name: fullName, registration_no: body.registrationNo.trim(), registration_council: body.registrationCouncil.trim(), specialization: body.specialty.trim(), verification_status: 'submitted' });
    if (profileError) throw profileError;
    const { data: hospital, error: hospitalError } = await admin.from('hospital_orgs').select('name').eq('id', hospitalId).single();
    if (hospitalError) throw hospitalError;
    const { data: doctor, error: doctorError } = await admin.from('hospital_doctors').insert({
      hospital_id: hospitalId,
      user_id: createdUserId,
      doctor_name: fullName,
      specialty: body.specialty.trim(),
      department_id: body.departmentId || null,
      email,
      phone: body.phone?.trim() || null,
      registration_no: body.registrationNo.trim(),
      registration_council: body.registrationCouncil.trim(),
      doctor_identifier: doctorIdentifier,
      employee_id: body.employeeId?.trim() || null,
      designation: body.designation?.trim() || null,
      subspecialty: body.subspecialty?.trim() || null,
      qualifications: body.qualifications?.trim() || null,
      years_experience: body.yearsExperience ?? null,
      joining_date: body.joiningDate || null,
      employment_type: body.employmentType || null,
      opd_room: body.opdRoom?.trim() || null,
      shift_schedule: schedule,
      emergency_available: body.emergencyAvailable === true,
      official_email: body.officialEmail?.trim() || email,
      official_phone: body.officialPhone?.trim() || body.phone?.trim() || null,
      verification_status: 'submitted',
    }).select('id').single();
    if (doctorError) throw doctorError;
    createdDoctorId = doctor.id;
    const { error: memberError } = await admin.from('hospital_members').insert({ hospital_id: hospitalId, user_id: createdUserId, staff_role: 'doctor', is_active: true });
    if (memberError) throw memberError;
    await sendOnboardingEmail({ to: email, doctorId: doctorIdentifier, hospitalName: hospital.name, password, reset: false });
    credentialsSent = true;
    const { error: auditError } = await admin.from('hospital_access_audit').insert({ hospital_id: hospitalId, actor_user_id: actor.id, action: 'doctor_account_created', details: { doctor_id: doctor.id, doctor_identifier: doctorIdentifier, user_id: createdUserId } });
    if (auditError) throw auditError;
    return NextResponse.json({ ok: true, doctorId: doctorIdentifier });
  } catch (error) {
    if (createdUserId && !credentialsSent) {
      try {
        const cleanup = createSupabaseAdminClient();
        if (createdDoctorId) {
          await cleanup.from('hospital_members').delete().eq('user_id', createdUserId);
          await cleanup.from('hospital_doctors').delete().eq('id', createdDoctorId);
        }
        await cleanup.auth.admin.deleteUser(createdUserId);
      } catch { /* best-effort compensation */ }
    }
    return jsonError(error instanceof Error ? error.message : 'Doctor account operation failed.', 500);
  }
}
