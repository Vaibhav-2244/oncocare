/*
# AI Engine Schema — Conversations and Messages

## Overview
Creates the database tables for the AI Medical Assistant feature.
Stores user conversations with the AI and individual messages within those conversations.

## New Tables

1. **ai_conversations** — Conversation threads
   - id (uuid, PK)
   - user_id (uuid, FK → auth.users, ON DELETE CASCADE)
   - title (text) — conversation title/subject
   - is_pinned (boolean, default false) — user can pin important conversations
   - created_at (timestamptz)
   - updated_at (timestamptz)

2. **ai_messages** — Individual messages within conversations
   - id (uuid, PK)
   - conversation_id (uuid, FK → ai_conversations, ON DELETE CASCADE)
   - user_id (uuid, FK → auth.users, ON DELETE CASCADE)
   - role (text) — 'user' or 'assistant'
   - content (text) — message content/body
   - attachments (jsonb) — array of file attachments (if any)
   - created_at (timestamptz)

## Security
- RLS enabled on all tables with owner-scoped CRUD (auth.uid() = user_id).
- Users can only read/modify their own conversations and messages.
- All user_id columns have DEFAULT auth.uid() for seamless inserts.

## Indexes
- Optimized queries on user_id, conversation_id, and created_at for efficient sorting and pagination.
*/

-- ============================================================
-- AI CONVERSATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_pinned boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- Users can select their own conversations
DROP POLICY IF EXISTS "select_own_ai_conversations" ON ai_conversations;
CREATE POLICY "select_own_ai_conversations" ON ai_conversations FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can insert their own conversations
DROP POLICY IF EXISTS "insert_own_ai_conversations" ON ai_conversations;
CREATE POLICY "insert_own_ai_conversations" ON ai_conversations FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can update their own conversations
DROP POLICY IF EXISTS "update_own_ai_conversations" ON ai_conversations;
CREATE POLICY "update_own_ai_conversations" ON ai_conversations FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Users can delete their own conversations
DROP POLICY IF EXISTS "delete_own_ai_conversations" ON ai_conversations;
CREATE POLICY "delete_own_ai_conversations" ON ai_conversations FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- AI MESSAGES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

-- Users can select messages from their own conversations
DROP POLICY IF EXISTS "select_own_ai_messages" ON ai_messages;
CREATE POLICY "select_own_ai_messages" ON ai_messages FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

-- Users can insert messages into their own conversations
DROP POLICY IF EXISTS "insert_own_ai_messages" ON ai_messages;
CREATE POLICY "insert_own_ai_messages" ON ai_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Users can delete their own messages
DROP POLICY IF EXISTS "delete_own_ai_messages" ON ai_messages;
CREATE POLICY "delete_own_ai_messages" ON ai_messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated ON ai_conversations (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_user ON ai_messages (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_created ON ai_messages (created_at DESC);
