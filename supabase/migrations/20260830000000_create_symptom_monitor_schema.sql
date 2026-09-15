/*
# Symptom Monitor Schema

Creates the symptom and side-effect tracking tables used by the patient dashboard feature.

Tables:
1. side_effect_entries - daily/periodic side effect logs
2. symptom_chat_sessions - symptom assessment chat sessions
3. symptom_chat_messages - per-session chat messages

Security:
- RLS enabled
- Owners can read/write only their own records
*/

CREATE TABLE IF NOT EXISTS public.side_effect_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  severity integer NOT NULL DEFAULT 5 CHECK (severity >= 1 AND severity <= 10),
  trend text NOT NULL DEFAULT 'Stable' CHECK (trend IN ('Improving', 'Stable', 'Getting worse')),
  duration text,
  notes text,
  what_helped jsonb DEFAULT '[]'::jsonb,
  recorded_at timestamptz DEFAULT now(),
  follow_up_at timestamptz,
  follow_up_status text DEFAULT 'scheduled' CHECK (follow_up_status IN ('scheduled', 'due', 'completed')),
  follow_up_completed_at timestamptz,
  source text DEFAULT 'dashboard',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.symptom_chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Symptom Check',
  symptom_name text,
  severity integer CHECK (severity >= 1 AND severity <= 10),
  trend text CHECK (trend IN ('Improving', 'Stable', 'Getting worse')),
  duration text,
  summary text,
  emergency_detected boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.symptom_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.symptom_chat_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_side_effect_entries_user
  ON public.side_effect_entries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_side_effect_entries_follow_up
  ON public.side_effect_entries (user_id, follow_up_status, follow_up_at);

CREATE INDEX IF NOT EXISTS idx_symptom_chat_sessions_user
  ON public.symptom_chat_sessions (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_symptom_chat_messages_session
  ON public.symptom_chat_messages (session_id, created_at);

ALTER TABLE public.side_effect_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_side_effect_entries" ON public.side_effect_entries;
CREATE POLICY "select_own_side_effect_entries" ON public.side_effect_entries
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_side_effect_entries" ON public.side_effect_entries;
CREATE POLICY "insert_own_side_effect_entries" ON public.side_effect_entries
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_side_effect_entries" ON public.side_effect_entries;
CREATE POLICY "update_own_side_effect_entries" ON public.side_effect_entries
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_side_effect_entries" ON public.side_effect_entries;
CREATE POLICY "delete_own_side_effect_entries" ON public.side_effect_entries
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_symptom_chat_sessions" ON public.symptom_chat_sessions;
CREATE POLICY "select_own_symptom_chat_sessions" ON public.symptom_chat_sessions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_symptom_chat_sessions" ON public.symptom_chat_sessions;
CREATE POLICY "insert_own_symptom_chat_sessions" ON public.symptom_chat_sessions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_symptom_chat_sessions" ON public.symptom_chat_sessions;
CREATE POLICY "update_own_symptom_chat_sessions" ON public.symptom_chat_sessions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_symptom_chat_sessions" ON public.symptom_chat_sessions;
CREATE POLICY "delete_own_symptom_chat_sessions" ON public.symptom_chat_sessions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "select_own_symptom_chat_messages" ON public.symptom_chat_messages;
CREATE POLICY "select_own_symptom_chat_messages" ON public.symptom_chat_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_symptom_chat_messages" ON public.symptom_chat_messages;
CREATE POLICY "insert_own_symptom_chat_messages" ON public.symptom_chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_symptom_chat_messages" ON public.symptom_chat_messages;
CREATE POLICY "delete_own_symptom_chat_messages" ON public.symptom_chat_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
