'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, ArrowUpRight, Send, ShieldAlert, Sparkles } from 'lucide-react';
import { DashboardLayout, PATIENT_CAREGIVER_ROLES, caregiverNavItems, patientNavItems } from '@/components/auth/dashboard-layout';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase-client';
import { readStoredProfile, writeStoredProfile } from '@/lib/symptom-monitor';
import { useTranslations } from 'next-intl';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

const STORAGE_KEY = (userId?: string) => `oncocare_symptom_checker_${userId ?? 'guest'}`;

export default function SymptomCheckerPage() {
  const t = useTranslations('symptoms.checker');
  const { user } = useAuth();
  const navItems = user?.primaryRole === 'family_caregiver' ? caregiverNavItems : patientNavItems;
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant', text: 'Hi! I’m your OncoCare symptom support assistant. Tell me what you are experiencing, and I’ll help you reflect on urgency, pattern, and next steps.' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState({ symptom: 'Fatigue', severity: 5, trend: 'Stable', duration: 'This week', notes: '', cancerType: '', treatmentType: '', journeyPhase: '' });
  const [emergencyDetected, setEmergencyDetected] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!user) return;
    const profile = readStoredProfile(user.id);
    setAssessment((current) => ({
      ...current,
      cancerType: current.cancerType || profile.cancerType || '',
      treatmentType: current.treatmentType || profile.treatmentType || '',
      journeyPhase: current.journeyPhase || profile.journeyPhase || '',
    }));

    const stored = localStorage.getItem(STORAGE_KEY(user.id));
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Message[];
        if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed);
      } catch {
        // ignore invalid storage
      }
    }
  }, [user]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (user) {
      writeStoredProfile(
        {
          cancerType: assessment.cancerType,
          treatmentType: assessment.treatmentType,
          journeyPhase: assessment.journeyPhase,
        },
        user.id,
      );
    }
  }, [assessment, user]);

  useEffect(() => {
    if (user) {
      localStorage.setItem(STORAGE_KEY(user.id), JSON.stringify(messages));
    }
  }, [messages, user]);

  const urgentPatterns = useMemo(
    () => [
      /difficulty breathing/i,
      /trouble breathing/i,
      /can't breathe/i,
      /loss of consciousness/i,
      /severe chest pain/i,
      /uncontrolled bleeding/i,
      /seizure/i,
      /fainted/i,
    ],
    [],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    const nextMessage: Message = { id: crypto.randomUUID(), role: 'user', text: userMessage };
    setMessages((prev) => [...prev, nextMessage]);
    setInput('');

    const emergency = urgentPatterns.some((pattern) => pattern.test(userMessage));
    setEmergencyDetected(emergency);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          history: [...messages, nextMessage].map((msg) => ({ role: msg.role === 'user' ? 'user' : 'model', text: msg.text })),
          userName: user?.profile?.full_name?.split(' ')[0] || user?.email || 'there',
          cancerType: assessment.cancerType,
          treatmentType: assessment.treatmentType,
          journeyPhase: assessment.journeyPhase,
          selectedSymptom: assessment.symptom,
          severity: assessment.severity,
          trend: assessment.trend,
          duration: assessment.duration,
        }),
      });

      const result = (await response.json()) as { success?: boolean; reply?: string; error?: string };

      if (!response.ok || !result.success || !result.reply) {
        throw new Error(result.error || 'AI response failed.');
      }

      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: result.reply || 'I’m here to help.' }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reach the symptom assistant.');
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: 'I’m unable to reach the AI assistant right now. Please use the symptom tracker and contact your care team if symptoms are worsening.' }]);
    }
  };

  const saveAssessment = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('symptoms').insert({
        user_id: user.id,
        name: assessment.symptom,
        severity: assessment.severity,
        notes: `${assessment.notes || ''}${assessment.notes && assessment.trend ? ' | ' : ''}${assessment.trend} - ${assessment.duration}`.trim() || null,
        recorded_at: new Date().toISOString(),
      });

      if (insertError) throw insertError;
      setError(null);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', text: `I’ve saved your symptom entry for ${assessment.symptom}. Keep monitoring it and contact your care team if it worsens or if you develop urgent symptoms.` }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the assessment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute allowedRoles={PATIENT_CAREGIVER_ROLES}>
      <DashboardLayout navItems={navItems} dashboardTitle="Patient Dashboard">
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{t('symptomAssessment')}</p>
              <h1 className="text-2xl font-bold text-slate-900">{t('symptomChecker')}</h1>
            </div>
            {emergencyDetected && (
              <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                <ShieldAlert className="h-3.5 w-3.5" />
                {t('urgentSymptomsDetected')}{' '}</div>
            )}
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Sparkles className="h-4 w-4 text-teal-600" />
                  {t('symptomConversation')}{' '}</div>
              </div>
              <div className="max-h-[520px] space-y-4 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                      {message.text}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={t('describeYourSymptomOrAskAQuestion')}
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-teal-300 focus:bg-white"
                  />
                  <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white">
                    <Send className="h-4 w-4" />
                    {t('send')}{' '}</button>
                </div>
              </form>
            </div>

            <div className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t('assessmentDetails')}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{t('quickRecord')}</h2>
              </div>

              <div className="space-y-4">
                <label className="block text-sm text-slate-700">
                  {t('symptom')}{' '}<input value={assessment.symptom} onChange={(e) => setAssessment((prev) => ({ ...prev, symptom: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" />
                </label>

                <label className="block text-sm text-slate-700">
                  {t('severity')}{' '}{assessment.severity}/10
                  <input type="range" min={1} max={10} value={assessment.severity} onChange={(e) => setAssessment((prev) => ({ ...prev, severity: Number(e.target.value) }))} className="mt-2 w-full accent-teal-600" />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-slate-700">
                    {t('trend')}{' '}<select value={assessment.trend} onChange={(e) => setAssessment((prev) => ({ ...prev, trend: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white">
                      <option>{t('stable')}</option>
                      <option>{t('improving')}</option>
                      <option>{t('gettingWorse')}</option>
                    </select>
                  </label>
                  <label className="block text-sm text-slate-700">
                    {t('duration')}{' '}<input value={assessment.duration} onChange={(e) => setAssessment((prev) => ({ ...prev, duration: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" />
                  </label>
                </div>

                <label className="block text-sm text-slate-700">
                  {t('notes')}{' '}<textarea rows={3} value={assessment.notes} onChange={(e) => setAssessment((prev) => ({ ...prev, notes: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" placeholder={t('anyDetailsAboutSeverityTriggersTimingOrWhatHelps')} />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <input value={assessment.cancerType} onChange={(e) => setAssessment((prev) => ({ ...prev, cancerType: e.target.value }))} placeholder={t('cancerType')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" />
                  <input value={assessment.treatmentType} onChange={(e) => setAssessment((prev) => ({ ...prev, treatmentType: e.target.value }))} placeholder={t('treatment')} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" />
                </div>

                <input value={assessment.journeyPhase} onChange={(e) => setAssessment((prev) => ({ ...prev, journeyPhase: e.target.value }))} placeholder={t('journeyPhase')} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-teal-300 focus:bg-white" />

                {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

                <button type="button" onClick={saveAssessment} disabled={saving || !user} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                  <ArrowUpRight className="h-4 w-4" />
                  {saving ? t('saving') : t('saveAssessment')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  );
}
