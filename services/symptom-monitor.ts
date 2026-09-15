import { supabase } from '@/lib/supabase-client';
import type { SideEffectEntry, SymptomAssessmentInput } from '@/types/symptom-monitor';

export function getUserScopedKey(prefix: string, userId?: string) {
  return `${prefix}${userId ? `_${userId}` : ''}`;
}

export function normalizeSideEffectEntry(entry: any): SideEffectEntry {
  const whatHelped = Array.isArray(entry?.what_helped)
    ? entry.what_helped
    : Array.isArray(entry?.whatHelped)
      ? entry.whatHelped
      : [];

  return {
    id: entry?.id,
    user_id: entry?.user_id,
    name: entry?.name ?? entry?.symptom ?? 'Unspecified symptom',
    severity: Number(entry?.severity ?? 5),
    trend: entry?.trend ?? 'Stable',
    duration: entry?.duration ?? 'Not recorded',
    notes: entry?.notes ?? '',
    whatHelped,
    what_helped: whatHelped,
    followUpAt: entry?.followUpAt ?? entry?.follow_up_at ?? null,
    followUpStatus: entry?.followUpStatus ?? entry?.follow_up_status ?? 'scheduled',
    followUpCompletedAt: entry?.followUpCompletedAt ?? entry?.follow_up_completed_at ?? null,
    cancerType: entry?.cancerType ?? entry?.cancer_type,
    treatmentType: entry?.treatmentType ?? entry?.treatment_type,
    journeyPhase: entry?.journeyPhase ?? entry?.journey_phase,
    source: entry?.source ?? 'dashboard',
    recordedAt: entry?.recordedAt ?? entry?.created_at ?? new Date().toISOString(),
    created_at: entry?.created_at ?? entry?.recordedAt,
  };
}

export async function loadSideEffectEntries(userId: string): Promise<SideEffectEntry[]> {
  const { data, error } = await supabase
    .from('side_effect_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to load side effect entries', error);
    return [];
  }

  return (data ?? []).map(normalizeSideEffectEntry);
}

export async function saveSideEffectEntry(userId: string, payload: SymptomAssessmentInput & { followUpAt?: string | null; source?: string }) {
  const { data, error } = await supabase
    .from('side_effect_entries')
    .insert({
      user_id: userId,
      name: payload.symptomName,
      severity: payload.severity,
      trend: payload.trend,
      duration: payload.duration,
      notes: payload.notes,
      what_helped: [],
      follow_up_at: payload.followUpAt ?? null,
      follow_up_status: payload.followUpAt ? 'scheduled' : 'scheduled',
      cancer_type: payload.cancerType ?? null,
      treatment_type: payload.treatmentType ?? null,
      journey_phase: payload.journeyPhase ?? null,
      source: payload.source ?? 'dashboard',
    })
    .select()
    .single();

  if (error) throw error;
  return normalizeSideEffectEntry(data);
}

export async function saveAssessmentToSupabase(userId: string, payload: SymptomAssessmentInput) {
  const { data, error } = await supabase
    .from('symptoms')
    .insert({
      user_id: userId,
      name: payload.symptomName,
      severity: payload.severity,
      notes: payload.notes,
      recorded_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
