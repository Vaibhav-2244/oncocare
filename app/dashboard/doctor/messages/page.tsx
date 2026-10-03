'use client';

import { FormEvent, useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { DashboardLayout, DOCTOR_ROLES } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ensureDoctorWorkspace, listDoctorPatients, type DoctorPatient } from '@/lib/doctor/api';
import { supabase } from '@/lib/supabase-client';

type Message = { id: string; sender_id: string; content: string; created_at: string };
function DoctorMessagesContent() {
  const [patients, setPatients] = useState<DoctorPatient[]>([]);
  const [patientId, setPatientId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void (async () => { try { await ensureDoctorWorkspace(); const roster = await listDoctorPatients(); setPatients(roster.rows.filter((patient) => patient.patient_user_id)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load patients.'); } })(); }, []);
  useEffect(() => { if (!patientId) return; void supabase.rpc('doctor_list_messages', { p_doctor_patient_id: patientId }).then(({ data, error: rpcError }) => { if (rpcError) setError(rpcError.message); else setMessages((data || []) as Message[]); }); }, [patientId]);
  const send = async (event: FormEvent) => { event.preventDefault(); const { data, error: rpcError } = await supabase.rpc('doctor_send_message', { p_doctor_patient_id: patientId, p_content: content }); if (rpcError) setError(rpcError.message); else { setMessages((current) => [...current, data as Message]); setContent(''); } };
  return <div className="grid gap-6 lg:grid-cols-[18rem_1fr]"><section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h1 className="text-xl font-bold text-slate-900">Messages</h1><p className="mt-1 text-sm text-slate-500">Only patients with messaging consent appear here.</p><div className="mt-4 space-y-1">{patients.map((patient) => <button type="button" key={patient.id} onClick={() => setPatientId(patient.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${patient.id === patientId ? 'bg-teal-50 font-semibold text-teal-800' : 'hover:bg-slate-50'}`}>{patient.full_name}</button>)}{patients.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No consented patients.</p>}</div></section><section className="flex min-h-[32rem] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 border-b border-slate-100 pb-4"><MessageSquare className="h-5 w-5 text-teal-700" /><h2 className="font-semibold text-slate-900">{patients.find((patient) => patient.id === patientId)?.full_name || 'Select a patient'}</h2></div>{error && <div role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}<div className="flex-1 space-y-3 overflow-y-auto py-4">{messages.map((message) => <div key={message.id} className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{message.content}<p className="mt-1 text-[11px] text-slate-400">{new Date(message.created_at).toLocaleString()}</p></div>)}</div><form onSubmit={send} className="flex gap-2 border-t border-slate-100 pt-4"><input required disabled={!patientId} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write a secure message" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50" /><button type="submit" disabled={!patientId || !content.trim()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send</button></form></section></div>;
}
export default function DoctorMessagesPage() { return <ProtectedRoute allowedRoles={DOCTOR_ROLES}><DashboardLayout dashboardTitle="Messages"><DoctorMessagesContent /></DashboardLayout></ProtectedRoute>; }
