export type SymptomTrend = 'Improving' | 'Stable' | 'Getting worse';
export type FollowUpStatus = 'scheduled' | 'due' | 'completed';

export interface SideEffectRecord {
  id: string;
  user_id?: string;
  name: string;
  severity: number;
  trend: SymptomTrend;
  duration: string;
  notes: string;
  whatHelped: string[];
  recordedAt: string;
  followUpAt: string | null;
  followUpStatus: FollowUpStatus;
  followUpCompletedAt?: string;
  originalRecordId?: string | null;
  cancerType?: string;
  treatmentType?: string;
  journeyPhase?: string;
  source?: string;
}

export const STORAGE_KEYS = {
  symptomProfile: (userId?: string) => `oncocare_symptom_profile${userId ? `_${userId}` : ''}`,
  sideEffectRecords: (userId?: string) => `oncocare_side_effect_records${userId ? `_${userId}` : ''}`,
  symptomChatHistory: (userId?: string) => `oncocare_symptom_chats${userId ? `_${userId}` : ''}`,
};

export function normalizeTrend(value: unknown): SymptomTrend {
  const text = String(value ?? '').toLowerCase();

  if (text.includes('better') || text.includes('improv')) return 'Improving';
  if (text.includes('worse') || text.includes('increase')) return 'Getting worse';
  return 'Stable';
}

export function getEmergencyKeywords(): RegExp[] {
  return [
    /difficulty breathing/i,
    /trouble breathing/i,
    /can't breathe/i,
    /cannot breathe/i,
    /loss of consciousness/i,
    /passed out/i,
    /fainted/i,
    /uncontrolled bleeding/i,
    /heavy bleeding/i,
    /bleeding that won't stop/i,
    /severe chest pain/i,
    /crushing chest pain/i,
    /seizure/i,
    /anaphylaxis/i,
    /swelling of the throat/i,
  ];
}

export function detectEmergency(text: string): boolean {
  return getEmergencyKeywords().some((pattern) => pattern.test(text));
}

export function isFollowUpDue(record: SideEffectRecord): boolean {
  return record.followUpStatus === 'completed'
    ? false
    : Boolean(record.followUpAt && new Date(record.followUpAt).getTime() <= Date.now());
}

export function readStoredRecords(userId?: string): SideEffectRecord[] {
  if (typeof window === 'undefined') return [];

  const raw = localStorage.getItem(STORAGE_KEYS.sideEffectRecords(userId));
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStoredRecords(records: SideEffectRecord[], userId?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.sideEffectRecords(userId), JSON.stringify(records));
}

export function readStoredProfile(userId?: string) {
  if (typeof window === 'undefined') return {} as Record<string, string>;

  const raw = localStorage.getItem(STORAGE_KEYS.symptomProfile(userId));
  if (!raw) return {} as Record<string, string>;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {} as Record<string, string>;
  }
}

export function writeStoredProfile(profile: Record<string, string>, userId?: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.symptomProfile(userId), JSON.stringify(profile));
}
