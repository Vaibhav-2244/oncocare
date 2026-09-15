export type SymptomTrend = 'Improving' | 'Stable' | 'Getting worse';
export type FollowUpStatus = 'scheduled' | 'due' | 'completed';

export interface SymptomAssessmentInput {
  symptomName: string;
  severity: number;
  trend: SymptomTrend;
  duration: string;
  notes: string;
  cancerType?: string;
  treatmentType?: string;
  journeyPhase?: string;
  emergencyDetected?: boolean;
}

export interface SymptomChatMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt?: string;
}

export interface SideEffectEntry {
  id?: string;
  user_id?: string;
  name: string;
  severity: number;
  trend: SymptomTrend;
  duration: string;
  notes: string;
  what_helped?: string[];
  whatHelped?: string[];
  follow_up_at?: string | null;
  followUpAt?: string | null;
  follow_up_status?: FollowUpStatus;
  followUpStatus?: FollowUpStatus;
  follow_up_completed_at?: string | null;
  followUpCompletedAt?: string | null;
  cancer_type?: string;
  cancerType?: string;
  treatment_type?: string;
  treatmentType?: string;
  journey_phase?: string;
  journeyPhase?: string;
  source?: string;
  created_at?: string;
  recordedAt?: string;
  original_record_id?: string | null;
  originalRecordId?: string | null;
}

export interface SymptomChatSession {
  id: string;
  user_id: string;
  title: string;
  symptom_name?: string | null;
  severity?: number | null;
  trend?: string | null;
  duration?: string | null;
  summary?: string | null;
  emergency_detected?: boolean;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}
