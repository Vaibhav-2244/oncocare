/*
# Community Support Schema — Groups, Posts, Replies, Reactions

## Overview
Creates tables for the community support feature: support groups, posts within groups,
replies to posts, and reactions (likes/encouragements).

## New Tables

1. **community_groups** — Support groups for cancer patients
   - id, name, description, category, member_count, created_by, created_at

2. **community_posts** — Posts within support groups
   - id, group_id, user_id, title, content, is_anonymous, created_at

3. **community_replies** — Replies to posts
   - id, post_id, user_id, content, is_anonymous, created_at

4. **community_reactions** — Reactions on posts (like, encourage, pray)
   - id, post_id, user_id, reaction_type, created_at

5. **community_members** — Group membership
   - id, group_id, user_id, joined_at

## Security
- RLS enabled on all tables.
- community_groups: anyone authenticated can read, only creator can insert/update/delete.
- community_posts/replies: anyone authenticated can read, only owner can insert/update/delete.
- community_reactions: anyone authenticated can read, only owner can insert/delete.
- community_members: anyone authenticated can read, only owner can insert/delete own membership.
*/
CREATE TABLE IF NOT EXISTS community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'general' CHECK (category IN ('general', 'breast_cancer', 'lung_cancer', 'blood_cancer', 'pediatric', 'caregivers', 'survivors', 'mental_health', 'nutrition', 'financial')),
  member_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  is_anonymous boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_anonymous boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type text NOT NULL CHECK (reaction_type IN ('like', 'encourage', 'pray')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(post_id, user_id, reaction_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_community_groups_category ON community_groups (category);
CREATE INDEX IF NOT EXISTS idx_community_posts_group ON community_posts (group_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_community_replies_post ON community_replies (post_id);
CREATE INDEX IF NOT EXISTS idx_community_reactions_post ON community_reactions (post_id);
CREATE INDEX IF NOT EXISTS idx_community_members_group ON community_members (group_id);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON community_members (user_id);

-- Enable RLS
ALTER TABLE community_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_reactions ENABLE ROW LEVEL SECURITY;

-- community_groups: all authenticated can read, creator can manage
DROP POLICY IF EXISTS "select_community_groups" ON community_groups;
CREATE POLICY "select_community_groups" ON community_groups FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_community_groups" ON community_groups;
CREATE POLICY "insert_community_groups" ON community_groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "update_community_groups" ON community_groups;
CREATE POLICY "update_community_groups" ON community_groups FOR UPDATE TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
DROP POLICY IF EXISTS "delete_community_groups" ON community_groups;
CREATE POLICY "delete_community_groups" ON community_groups FOR DELETE TO authenticated USING (auth.uid() = created_by);

-- community_members: all authenticated can read, owner can manage own membership
DROP POLICY IF EXISTS "select_community_members" ON community_members;
CREATE POLICY "select_community_members" ON community_members FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_community_members" ON community_members;
CREATE POLICY "insert_community_members" ON community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_community_members" ON community_members;
CREATE POLICY "delete_community_members" ON community_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- community_posts: all authenticated can read, owner can manage
DROP POLICY IF EXISTS "select_community_posts" ON community_posts;
CREATE POLICY "select_community_posts" ON community_posts FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_community_posts" ON community_posts;
CREATE POLICY "insert_community_posts" ON community_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_community_posts" ON community_posts;
CREATE POLICY "update_community_posts" ON community_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_community_posts" ON community_posts;
CREATE POLICY "delete_community_posts" ON community_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- community_replies: all authenticated can read, owner can manage
DROP POLICY IF EXISTS "select_community_replies" ON community_replies;
CREATE POLICY "select_community_replies" ON community_replies FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_community_replies" ON community_replies;
CREATE POLICY "insert_community_replies" ON community_replies FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_community_replies" ON community_replies;
CREATE POLICY "update_community_replies" ON community_replies FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_community_replies" ON community_replies;
CREATE POLICY "delete_community_replies" ON community_replies FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- community_reactions: all authenticated can read, owner can manage
DROP POLICY IF EXISTS "select_community_reactions" ON community_reactions;
CREATE POLICY "select_community_reactions" ON community_reactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "insert_community_reactions" ON community_reactions;
CREATE POLICY "insert_community_reactions" ON community_reactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_community_reactions" ON community_reactions;
CREATE POLICY "delete_community_reactions" ON community_reactions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Insert seed community groups
INSERT INTO community_groups (name, description, category, member_count) VALUES
('General Cancer Support', 'A welcoming space for all cancer patients and survivors to share, support, and heal together.', 'general', 1240),
('Breast Cancer Warriors', 'Support group for breast cancer patients and survivors. Share your journey and find strength.', 'breast_cancer', 856),
('Lung Cancer Support', 'Connect with fellow lung cancer patients. Information, encouragement, and hope.', 'lung_cancer', 432),
('Blood Cancer Community', 'For leukemia, lymphoma, and myeloma patients and families.', 'blood_cancer', 523),
('Caregivers Corner', 'A space for caregivers to find support, resources, and understanding.', 'caregivers', 387),
('Survivors Circle', 'Celebrate survival, share recovery stories, and support those still in treatment.', 'survivors', 678),
('Mental Health & Wellness', 'Managing anxiety, depression, and emotional wellbeing during cancer treatment.', 'mental_health', 892),
('Nutrition During Treatment', 'Tips, recipes, and support for maintaining nutrition during cancer treatment.', 'nutrition', 345),
('Financial Assistance Hub', 'Share resources, programs, and tips for managing the cost of cancer care.', 'financial', 412)
ON CONFLICT DO NOTHING;
