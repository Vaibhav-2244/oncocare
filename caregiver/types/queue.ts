export interface QueuePosition {
  token_number?: number | null;
  position?: number | null;
  ahead?: number | null;
  estimated_wait_minutes?: number | null;
  status?: string | null;
  [key: string]: unknown;
}

export interface QueueState {
  session_id: string;
  [key: string]: unknown;
}