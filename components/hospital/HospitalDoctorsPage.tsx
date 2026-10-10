'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, UserRoundPlus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { supabase } from '@/lib/supabase-client';
import { useHospital } from '@/lib/hospital/HospitalProvider';
import { callRpc } from '@/lib/hospital/api';

type Department = { id: string; name: string; department_type: 'clinical' | 'diagnostic'; is_active: boolean };
type Doctor = {
  id: string;
  user_id: string | null;
  doctor_name: string;
  specialty: string | null;
  department_id: string | null;
  is_active: boolean;
  employment_status: string;
  designation: string | null;
  qualifications: string | null;
  years_experience: number | null;
  employment_type: string | null;
  opd_room: string | null;
  doctor_identifier: string | null;
  employee_id: string | null;
  email: string | null;
  verification_status: string;
};
type Session = { session_id: string; doctor: string; department: string | null; room: string | null; status: string; waiting: number; completed: number };
type StaffMember = { user_id: string; name: string; email: string; role: string; is_active: boolean; is_demo: boolean };
type Assignment = { id: string; doctor_id: string; staff_user_id: string; staff_role: string; department_id: string | null };
type Shift = { day: number; start: string; end: string };

const STAFF_ROLES = ['nurse', 'front_desk', 'lab_tech', 'radiology_tech', 'admissions_staff', 'care_coordinator'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const inputClass = 'h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm';

export function HospitalDoctorsPage() {
  const t = useTranslations('hospitalOps');
  const { org, can } = useHospital();
  const [tab, setTab] = useState<'departments' | 'doctors' | 'sessions'>('departments');
  const [departments, setDepartments] = useState<Department[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentType, setDepartmentType] = useState<'clinical' | 'diagnostic'>('clinical');
  const [doctorName, setDoctorName] = useState('');
  const [doctorEmail, setDoctorEmail] = useState('');
  const [doctorPhone, setDoctorPhone] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [subspecialty, setSubspecialty] = useState('');
  const [designation, setDesignation] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [registrationNo, setRegistrationNo] = useState('');
  const [registrationCouncil, setRegistrationCouncil] = useState('');
  const [yearsExperience, setYearsExperience] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [opdRoom, setOpdRoom] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [officialPhone, setOfficialPhone] = useState('');
  const [emergencyAvailable, setEmergencyAvailable] = useState(false);
  const [shiftDays, setShiftDays] = useState<number[]>([]);
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:00');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<(typeof STAFF_ROLES)[number]>('nurse');
  const [assignedDoctor, setAssignedDoctor] = useState('');
  const [assignedStaff, setAssignedStaff] = useState('');
  const [assignedDepartment, setAssignedDepartment] = useState('');

  const load = useCallback(async () => {
    if (!org) return;
    const [departmentResult, doctorResult, sessionResult, staffResult, assignmentResult] = await Promise.all([
      supabase.from('hospital_departments').select('id,name,department_type,is_active').eq('hospital_id', org.id).order('name'),
      supabase.from('hospital_doctors').select('id,user_id,doctor_name,specialty,department_id,is_active,employment_status,designation,qualifications,years_experience,employment_type,opd_room,doctor_identifier,employee_id,email,verification_status').eq('hospital_id', org.id).order('doctor_name'),
      callRpc<Session[]>('get_today_sessions', { p_hospital_id: org.id }),
      can('staff.manage') ? callRpc<StaffMember[]>('list_hospital_staff', { p_hospital_id: org.id }) : Promise.resolve([]),
      can('staff.manage')
        ? supabase.from('hospital_doctor_care_team_assignments').select('id,doctor_id,staff_user_id,staff_role,department_id').eq('hospital_id', org.id)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (departmentResult.error) throw departmentResult.error;
    if (doctorResult.error) throw doctorResult.error;
    if (assignmentResult.error) throw assignmentResult.error;
    setDepartments((departmentResult.data ?? []) as Department[]);
    setDoctors((doctorResult.data ?? []) as Doctor[]);
    setSessions(sessionResult ?? []);
    setStaff(staffResult ?? []);
    setAssignments((assignmentResult.data ?? []) as Assignment[]);
  }, [can, org]);

  useEffect(() => {
    void load().catch((cause) => setError(cause instanceof Error ? cause.message : t('operationFailed')));
  }, [load, t]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('operationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const createDepartment = () => org && void run(async () => {
    await callRpc('create_hospital_department', { p_hospital_id: org.id, p_name: departmentName, p_department_type: departmentType });
    setDepartmentName('');
  });

  const toggleDepartment = (item: Department) => void run(() =>
    callRpc('set_hospital_department_active', { p_hospital_id: org?.id, p_department_id: item.id, p_is_active: !item.is_active }));

  const accountRequest = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Authentication required.');
    const response = await fetch('/api/hospital/doctors/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? t('operationFailed'));
  };

  const createDoctor = () => org && void run(async () => {
    const shiftSchedule: Shift[] = shiftDays.map((day) => ({ day, start: shiftStart, end: shiftEnd }));
    await accountRequest({
      action: 'create',
      hospitalId: org.id,
      fullName: doctorName,
      email: doctorEmail,
      phone: doctorPhone,
      specialty,
      subspecialty,
      designation,
      qualifications,
      registrationNo,
      registrationCouncil,
      yearsExperience: yearsExperience === '' ? null : Number(yearsExperience),
      employeeId,
      departmentId: departmentId || null,
      joiningDate: joiningDate || null,
      employmentType: employmentType || '',
      opdRoom,
      officialEmail,
      officialPhone,
      emergencyAvailable,
      shiftSchedule,
    });
    setDoctorName('');
    setDoctorEmail('');
    setDoctorPhone('');
    setSpecialty('');
    setSubspecialty('');
    setDesignation('');
    setQualifications('');
    setRegistrationNo('');
    setRegistrationCouncil('');
    setYearsExperience('');
    setEmployeeId('');
    setDepartmentId('');
    setJoiningDate('');
    setEmploymentType('');
    setOpdRoom('');
    setOfficialEmail('');
    setOfficialPhone('');
    setEmergencyAvailable(false);
    setShiftDays([]);
  });

  const toggleDoctor = (doctor: Doctor) => void run(() =>
    accountRequest({ action: 'set_active', hospitalId: org?.id, doctorId: doctor.id, isActive: !doctor.is_active }));

  const resetDoctor = (doctor: Doctor) => void run(() =>
    accountRequest({ action: 'reset', hospitalId: org?.id, doctorId: doctor.id }));

  const inviteStaff = () => org && void run(async () => {
    await callRpc('invite_hospital_staff', { p_hospital_id: org.id, p_email: inviteEmail, p_staff_role: inviteRole });
    setInviteEmail('');
  });

  const assignStaff = () => org && void run(() =>
    callRpc('set_hospital_doctor_care_team_assignment', {
      p_hospital_id: org.id,
      p_doctor_id: assignedDoctor,
      p_staff_user_id: assignedStaff.split('|')[0],
      p_staff_role: assignedStaff.split('|')[1],
      p_department_id: assignedDepartment || null,
    }));

  const removeAssignment = (assignment: Assignment) => org && void run(() =>
    callRpc('remove_hospital_doctor_care_team_assignment', { p_hospital_id: org.id, p_assignment_id: assignment.id }));

  const eligibleStaff = useMemo(() => staff.filter((member) => member.is_active && STAFF_ROLES.includes(member.role as (typeof STAFF_ROLES)[number])), [staff]);

  if (!org) return null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">{t('doctorsDepartments')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('careTeamConfiguration')}</p>
      </header>

      <div className="flex gap-1 border-b">
        {(['departments', 'doctors', 'sessions'] as const).map((key) => (
          <button key={key} onClick={() => setTab(key)} className={`min-h-11 border-b-2 px-3 text-sm font-semibold ${tab === key ? 'border-teal-800 text-teal-900' : 'border-transparent text-slate-600'}`}>{t(key)}</button>
        ))}
      </div>
      {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {tab === 'departments' && (
        <div className="space-y-4">
          <form onSubmit={(event) => { event.preventDefault(); createDepartment(); }} className="flex flex-wrap gap-2 rounded-xl border bg-white p-4">
            <input required value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} placeholder={t('departmentName')} className="h-11 min-w-48 flex-1 rounded-md border px-3 text-sm" />
            <select value={departmentType} onChange={(event) => setDepartmentType(event.target.value as typeof departmentType)} className="h-11 rounded-md border px-3 text-sm">
              <option value="clinical">{t('clinical')}</option><option value="diagnostic">{t('diagnostic')}</option>
            </select>
            <button disabled={busy || !can('config.manage')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-teal-800 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{t('addDepartment')}</button>
          </form>
          <div className="grid gap-3 md:grid-cols-2">
            {departments.map((item) => (
              <article key={item.id} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4">
                <div><h2 className="font-semibold text-slate-950">{item.name}</h2><p className="text-sm text-slate-600">{t(item.department_type)}</p></div>
                <button disabled={!can('config.manage') || busy} onClick={() => toggleDepartment(item)} className="min-h-10 rounded-md border px-3 text-sm">{item.is_active ? t('deactivate') : t('activate')}</button>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === 'doctors' && (
        <div className="space-y-5">
          <form onSubmit={(event: FormEvent) => { event.preventDefault(); createDoctor(); }} className="space-y-4 rounded-xl border bg-white p-4">
            <div><h2 className="font-semibold">{t('addDoctor')}</h2><p className="mt-1 text-sm text-slate-600">Doctor ID and temporary credentials are generated by OncoCare. Verification remains submitted for review.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field required label={t('doctorName')} value={doctorName} setValue={setDoctorName} />
              <Field required label={t('email')} type="email" value={doctorEmail} setValue={setDoctorEmail} />
              <Field label={t('phone')} value={doctorPhone} setValue={setDoctorPhone} />
              <Field label="Hospital Employee ID" value={employeeId} setValue={setEmployeeId} />
              <Field label="Professional designation" value={designation} setValue={setDesignation} placeholder="Consultant Medical Oncologist" />
              <Field required label="Specialty" value={specialty} setValue={setSpecialty} />
              <Field label="Sub-specialty" value={subspecialty} setValue={setSubspecialty} />
              <Field label="Medical qualifications" value={qualifications} setValue={setQualifications} placeholder="MBBS, MD, DM" />
              <Field required label="Medical registration number" value={registrationNo} setValue={setRegistrationNo} />
              <Field required label="Registration council" value={registrationCouncil} setValue={setRegistrationCouncil} />
              <label className="text-sm font-medium text-slate-700">Department<select required value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className={`${inputClass} mt-1`}>
                <option value="">Select department</option>{departments.filter((item) => item.department_type === 'clinical' && item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select></label>
              <Field label="Years of experience" type="number" value={yearsExperience} setValue={setYearsExperience} min="0" max="80" />
              <Field label="Joining date" type="date" value={joiningDate} setValue={setJoiningDate} />
              <label className="text-sm font-medium text-slate-700">Employment type<select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className={`${inputClass} mt-1`}>
                <option value="">Not specified</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="consultant">Consultant</option><option value="visiting">Visiting</option><option value="contract">Contract</option>
              </select></label>
              <Field label="OPD / consultation room" value={opdRoom} setValue={setOpdRoom} />
              <Field label="Official email" type="email" value={officialEmail} setValue={setOfficialEmail} />
              <Field label="Official phone" value={officialPhone} setValue={setOfficialPhone} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Working schedule</p>
              <div className="flex flex-wrap gap-3">{WEEKDAYS.map((day, index) => (
                <label key={day} className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={shiftDays.includes(index)} onChange={(event) => setShiftDays((current) => event.target.checked ? [...current, index].sort() : current.filter((value) => value !== index))} />{day}</label>
              ))}</div>
              <div className="flex gap-2"><label className="text-xs text-slate-600">Start<input type="time" value={shiftStart} onChange={(event) => setShiftStart(event.target.value)} className={`${inputClass} mt-1`} /></label><label className="text-xs text-slate-600">End<input type="time" value={shiftEnd} onChange={(event) => setShiftEnd(event.target.value)} className={`${inputClass} mt-1`} /></label></div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={emergencyAvailable} onChange={(event) => setEmergencyAvailable(event.target.checked)} />Available for emergency / on-call coverage</label>
            <button disabled={busy || !can('config.manage')} className="min-h-11 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{t('addDoctor')}</button>
          </form>

          <div className="grid gap-4 lg:grid-cols-2">
            <form onSubmit={(event) => { event.preventDefault(); inviteStaff(); }} className="space-y-3 rounded-xl border bg-white p-4">
              <h2 className="font-semibold">Invite hospital care-team staff</h2>
              <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder={t('email')} className={inputClass} />
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as (typeof STAFF_ROLES)[number])} className={inputClass}>
                {STAFF_ROLES.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}
              </select>
              <button disabled={busy || !can('staff.manage')} className="inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-semibold disabled:opacity-50"><UserRoundPlus className="h-4 w-4" />Invite staff</button>
            </form>
            <form onSubmit={(event) => { event.preventDefault(); assignStaff(); }} className="space-y-3 rounded-xl border bg-white p-4">
              <h2 className="font-semibold">Assign care-team member</h2>
              <select required value={assignedDoctor} onChange={(event) => setAssignedDoctor(event.target.value)} className={inputClass}>
                <option value="">Select doctor</option>{doctors.filter((doctor) => doctor.is_active).map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.doctor_name} · {doctor.doctor_identifier ?? doctor.employee_id ?? doctor.id}</option>)}
              </select>
              <select required value={assignedStaff} onChange={(event) => setAssignedStaff(event.target.value)} className={inputClass}>
                <option value="">Select active staff</option>{eligibleStaff.map((member) => <option key={`${member.user_id}-${member.role}`} value={`${member.user_id}|${member.role}`}>{member.name} · {member.role.replaceAll('_', ' ')}</option>)}
              </select>
              <select value={assignedDepartment} onChange={(event) => setAssignedDepartment(event.target.value)} className={inputClass}>
                <option value="">Assignment is not department-specific</option>{departments.filter((department) => department.is_active).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
              <button disabled={busy || !can('staff.manage') || !assignedDoctor || !assignedStaff} className="min-h-11 rounded-md bg-teal-800 px-4 text-sm font-semibold text-white disabled:opacity-50">Assign to doctor</button>
            </form>
          </div>

          {!eligibleStaff.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Invite staff and wait for them to join the hospital before creating care-team assignments.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {doctors.map((doctor) => {
              const team = assignments.filter((assignment) => assignment.doctor_id === doctor.id);
              return (
                <article key={doctor.id} className="space-y-3 rounded-xl border bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-950">{doctor.doctor_name}</h3>
                      <p className="mt-1 text-sm text-slate-600">{doctor.doctor_identifier ?? '—'} · {doctor.employee_id ?? 'No employee ID'} · {doctor.designation ?? doctor.specialty}</p>
                      <p className="text-sm text-slate-600">{doctor.qualifications ?? 'Qualifications not entered'} · {departments.find((item) => item.id === doctor.department_id)?.name} · {doctor.opd_room ?? 'Room not set'}</p>
                      <p className="text-xs text-slate-500">Medical verification: {doctor.verification_status ?? 'profile pending'} · Employment: {doctor.employment_status.replaceAll('_', ' ')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={!can('config.manage') || busy || !doctor.is_active || !doctor.user_id || !doctor.email || !doctor.doctor_identifier} onClick={() => resetDoctor(doctor)} title={!doctor.user_id || !doctor.email || !doctor.doctor_identifier ? t('doctorAccountNotProvisioned') : undefined} className="min-h-10 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50">Reset password</button>
                      <button disabled={!can('config.manage') || busy} onClick={() => toggleDoctor(doctor)} className="min-h-10 rounded-md border px-3 text-sm">{doctor.is_active ? t('deactivate') : t('activate')}</button>
                    </div>
                  </div>
                  {(!doctor.user_id || !doctor.email || !doctor.doctor_identifier) && <p role="status" className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">{t('doctorAccountNotProvisioned')}</p>}
                  <div className="border-t pt-3">
                    <p className="text-sm font-semibold text-slate-800">Assigned care team</p>
                    {!team.length && <p className="mt-1 text-sm text-slate-500">No staff assigned.</p>}
                    <ul className="mt-2 space-y-2">{team.map((assignment) => {
                      const member = staff.find((item) => item.user_id === assignment.staff_user_id);
                      return <li key={assignment.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{member?.name ?? 'Staff member'} · {assignment.staff_role.replaceAll('_', ' ')}{assignment.department_id ? ` · ${departments.find((item) => item.id === assignment.department_id)?.name ?? ''}` : ''}</span>
                        <button type="button" aria-label="Remove care-team assignment" disabled={busy || !can('staff.manage')} onClick={() => removeAssignment(assignment)} className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><X className="h-4 w-4" /></button>
                      </li>;
                    })}</ul>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'sessions' && <div className="grid gap-3 md:grid-cols-2">{sessions.map((session) => (
        <article key={session.session_id} className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">{session.doctor}</h2><p className="text-sm text-slate-600">{session.department ?? '—'} · {session.room ?? '—'}</p>
          <p className="mt-2 text-sm">Status: {session.status} · Waiting: {session.waiting} · Completed: {session.completed}</p>
        </article>
      ))}{!sessions.length && <p className="text-sm text-slate-600">{t('todaySessions')}: —</p>}</div>}
    </div>
  );
}

function Field({
  label, value, setValue, type = 'text', required = false, placeholder, min, max,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return <label className="text-sm font-medium text-slate-700">{label}<input required={required} type={type} min={min} max={max} value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className={`${inputClass} mt-1`} /></label>;
}
