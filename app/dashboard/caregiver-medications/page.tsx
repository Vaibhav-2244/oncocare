'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, Clock3, Pill, RefreshCw, Settings2, Users } from 'lucide-react';
import { DashboardLayout, type NavItem } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import {
  getAssignedPatients,
  getCaregiverNotifications,
  getCaregiverSettings,
  getPatientHistory,
  getPatientMedications,
  markCaregiverNotificationRead,
  updateCaregiverSettings,
  type AssignedPatient,
  type CaregiverHistoryItem,
  type CaregiverMedication,
  type CaregiverNotification,
} from '@/lib/caregiver-medication';

const navItems: NavItem[] = [
  { label: 'Overview', href: '/dashboard', icon: Users },
  { label: 'Patient Medications', href: '/dashboard/caregiver-medications', icon: Pill },
  { label: 'Notifications', href: '/dashboard/notifications', icon: Bell },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings2 },
];

function formatDate(value: string | null) {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function CaregiverMedicationsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<AssignedPatient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [medications, setMedications] = useState<CaregiverMedication[]>([]);
  const [history, setHistory] = useState<CaregiverHistoryItem[]>([]);
  const [notifications, setNotifications] = useState<CaregiverNotification[]>([]);
  const [settings, setSettings] = useState<AssignedPatient[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [patientsResult, notificationsResult, settingsResult] = await Promise.all([
        getAssignedPatients(), getCaregiverNotifications(), getCaregiverSettings(),
      ]);
      if (patientsResult.error) throw patientsResult.error;
      if (notificationsResult.error) throw notificationsResult.error;
      if (settingsResult.error) throw settingsResult.error;
      const assigned = (patientsResult.data || []) as AssignedPatient[];
      setPatients(assigned);
      setNotifications((notificationsResult.data || []) as CaregiverNotification[]);
      setSettings((settingsResult.data || []) as AssignedPatient[]);
      const patientId = selectedPatientId && assigned.some((patient) => patient.patient_id === selectedPatientId)
        ? selectedPatientId : assigned[0]?.patient_id || '';
      setSelectedPatientId(patientId);
      if (patientId) {
        const [medicationsResult, historyResult] = await Promise.all([
          getPatientMedications(patientId), getPatientHistory(patientId),
        ]);
        if (medicationsResult.error) throw medicationsResult.error;
        if (historyResult.error) throw historyResult.error;
        setMedications((medicationsResult.data || []) as CaregiverMedication[]);
        setHistory((historyResult.data || []) as CaregiverHistoryItem[]);
      } else {
        setMedications([]); setHistory([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load caregiver medication data.');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [selectedPatientId]);

  useEffect(() => { if (user) void load(); }, [user, load]);

  const selectedPatient = patients.find((patient) => patient.patient_id === selectedPatientId);
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => filter === 'all' || !notification.is_read),
    [filter, notifications],
  );

  const selectPatient = async (patientId: string) => {
    setSelectedPatientId(patientId);
    const [medicationsResult, historyResult] = await Promise.all([
      getPatientMedications(patientId), getPatientHistory(patientId),
    ]);
    if (!medicationsResult.error) setMedications((medicationsResult.data || []) as CaregiverMedication[]);
    if (!historyResult.error) setHistory((historyResult.data || []) as CaregiverHistoryItem[]);
  };

  const markRead = async (id: string) => {
    const result = await markCaregiverNotificationRead(id);
    if (!result.error && result.data) setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
  };

  const togglePreference = async (setting: AssignedPatient) => {
    const result = await updateCaregiverSettings(setting.relationship_id, !setting.notification_enabled);
    if (!result.error && result.data) setSettings((current) => current.map((item) => item.relationship_id === setting.relationship_id ? { ...item, notification_enabled: !setting.notification_enabled } : item));
  };

  if (loading) return <ProtectedRoute allowedRoles={['family_caregiver']}><DashboardLayout dashboardTitle="Caregiver Dashboard"><div className="flex min-h-64 items-center justify-center"><RefreshCw className="animate-spin text-teal-600" /></div></DashboardLayout></ProtectedRoute>;

  return (
    <ProtectedRoute allowedRoles={['family_caregiver']}>
      <DashboardLayout navItems={navItems} dashboardTitle="Caregiver Dashboard">
        <div className="space-y-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div><p className="text-sm font-semibold text-teal-700">Caregiver medication monitoring</p><h1 className="mt-1 text-2xl font-bold text-slate-900">Assigned patient care</h1><p className="mt-1 text-sm text-slate-500">Medication data is limited to your active patient relationships.</p></div>
            <button onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600"><RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh</button>
          </div>
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2"><Users className="h-5 w-5 text-teal-600" /><h2 className="font-bold text-slate-900">Assigned patients</h2></div>
                {patients.length === 0 ? <p className="mt-4 text-sm text-slate-500">No active patient assignments are available.</p> : <select value={selectedPatientId} onChange={(event) => void selectPatient(event.target.value)} className="mt-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="">Select a patient</option>{patients.map((patient) => <option key={patient.patient_id} value={patient.patient_id}>{patient.patient_name}</option>)}</select>}
                {selectedPatient && <p className="mt-3 text-xs text-slate-500">Relationship: {selectedPatient.relationship} · Assigned {formatDate(selectedPatient.relationship_created_at)}</p>}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Medication schedule</h2><span className="text-xs text-slate-500">{medications.length} medications</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2">{medications.map((medication) => <div key={medication.id} className="rounded-xl border border-slate-100 p-4"><div className="flex items-start gap-3"><Pill className="mt-0.5 h-5 w-5 text-teal-600" /><div><h3 className="font-semibold text-slate-900">{medication.name}</h3><p className="text-sm text-slate-500">{medication.dosage} · {medication.frequency}</p><p className="mt-2 text-xs text-slate-500">{medication.times?.join(' · ') || 'As needed'}</p>{medication.last_taken_at && <p className="mt-2 text-xs text-emerald-700">Last taken {formatDate(medication.last_taken_at)}</p>}</div></div></div>)}{selectedPatient && medications.length === 0 && <p className="text-sm text-slate-500">No medications recorded for this patient.</p>}</div></section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-teal-600" /><h2 className="font-bold text-slate-900">Medication history</h2></div><div className="mt-4 space-y-2">{history.slice(0, 12).map((item) => <div key={item.id} className="flex items-center justify-between border-b border-slate-100 py-3 text-sm"><div><p className="font-medium text-slate-800">{item.medication_name} · {item.dosage}</p><p className="text-xs text-slate-500">Scheduled {formatDate(item.scheduled_at)} · {item.patient_response || item.status}</p></div><span className={item.status === 'taken' ? 'text-emerald-600' : 'text-amber-600'}>{item.taken_at ? 'Taken' : 'Pending'}</span></div>)}{history.length === 0 && <p className="text-sm text-slate-500">No medication history recorded.</p>}</div></section>
            </div>
            <aside className="space-y-6"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Caregiver alerts</h2><div className="flex gap-1"><button onClick={() => setFilter('all')} className={filter === 'all' ? 'rounded-lg bg-teal-50 px-2 py-1 text-xs text-teal-700' : 'rounded-lg px-2 py-1 text-xs text-slate-500'}>All</button><button onClick={() => setFilter('unread')} className={filter === 'unread' ? 'rounded-lg bg-teal-50 px-2 py-1 text-xs text-teal-700' : 'rounded-lg px-2 py-1 text-xs text-slate-500'}>Unread</button></div></div><div className="mt-4 space-y-3">{visibleNotifications.slice(0, 8).map((notification) => <div key={notification.id} className="rounded-xl border border-slate-100 p-3"><div className="flex gap-2"><Bell className="mt-0.5 h-4 w-4 text-amber-500" /><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-800">{notification.title}</p><p className="mt-1 text-xs text-slate-500">{notification.message}</p><p className="mt-2 text-[11px] text-slate-400">{formatDate(notification.created_at)}</p></div>{!notification.is_read && <button onClick={() => void markRead(notification.id)} aria-label="Mark notification as read" className="text-teal-600"><Check className="h-4 w-4" /></button>}</div></div>)}{visibleNotifications.length === 0 && <p className="text-sm text-slate-500">No alerts to show.</p>}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Settings2 className="h-5 w-5 text-teal-600" /><h2 className="font-bold text-slate-900">Notification preferences</h2></div><div className="mt-4 space-y-3">{settings.map((setting) => <label key={setting.relationship_id} className="flex items-center justify-between gap-3 text-sm text-slate-700"><span>{setting.patient_name}</span><input type="checkbox" checked={setting.notification_enabled} onChange={() => void togglePreference(setting)} className="h-4 w-4 accent-teal-600" /></label>)}{settings.length === 0 && <p className="text-sm text-slate-500">No active relationships.</p>}</div></section></aside>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}