ALTER TABLE caregiver_support_groups
  ADD COLUMN IF NOT EXISTS form_url text;

INSERT INTO caregiver_support_groups (name, description, meeting_type, meeting_day, meeting_time, member_count, form_url)
SELECT 'Caregivers of loved ones with cancer', 'A gentle space to share experiences, frustrations, questions, and small wins with other family caregivers.', 'Online', 'Thursday', '7:00 PM', 18, 'https://docs.google.com/forms/d/1g8WdRv-pj_vvTsEQMG8x5Mlg6ggOG7zTtHwtJ7yHX1A/edit?ts=6aa6c2f0'
WHERE NOT EXISTS (SELECT 1 FROM caregiver_support_groups WHERE name = 'Caregivers of loved ones with cancer');

INSERT INTO caregiver_support_groups (name, description, meeting_type, meeting_day, meeting_time, member_count, form_url)
SELECT 'Caregiver stress & coping', 'Practical conversations about stress, boundaries, emotional exhaustion, and coping with the demands of caregiving.', 'Online', 'Saturday', '11:00 AM', 24, 'https://docs.google.com/forms/d/1YSKzjCjw95zDbHeHzHBTHxnJl65mGNISNka2bc14d7U/edit?ts=6aa6c444'
WHERE NOT EXISTS (SELECT 1 FROM caregiver_support_groups WHERE name = 'Caregiver stress & coping');

INSERT INTO caregiver_support_groups (name, description, meeting_type, meeting_day, meeting_time, member_count, form_url)
SELECT 'Family caregivers — open conversation', 'An informal peer space for family members caring for someone with cancer.', 'Online', 'Tuesday', '6:30 PM', 12, 'https://docs.google.com/forms/d/1MM2Fk6bkqeMf1VWIjWVk8JZgb1Z8O4u8nXNrRb8l6Mo/edit?ts=6aa6c609'
WHERE NOT EXISTS (SELECT 1 FROM caregiver_support_groups WHERE name = 'Family caregivers — open conversation');

UPDATE caregiver_support_groups
SET form_url = CASE name
  WHEN 'Caregivers of loved ones with cancer' THEN 'https://docs.google.com/forms/d/1g8WdRv-pj_vvTsEQMG8x5Mlg6ggOG7zTtHwtJ7yHX1A/edit?ts=6aa6c2f0'
  WHEN 'Caregiver stress & coping' THEN 'https://docs.google.com/forms/d/1YSKzjCjw95zDbHeHzHBTHxnJl65mGNISNka2bc14d7U/edit?ts=6aa6c444'
  WHEN 'Family caregivers — open conversation' THEN 'https://docs.google.com/forms/d/1MM2Fk6bkqeMf1VWIjWVk8JZgb1Z8O4u8nXNrRb8l6Mo/edit?ts=6aa6c609'
END
WHERE name IN ('Caregivers of loved ones with cancer', 'Caregiver stress & coping', 'Family caregivers — open conversation');

CREATE TABLE IF NOT EXISTS caregiver_tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()`
);

ALTER TABLE caregiver_tips ENABLE ROW LEVEL SECURITY;

CREATE POLICY caregiver_tips_read ON caregiver_tips
  FOR SELECT TO authenticated USING (true);

INSERT INTO caregiver_tips (title, content) VALUES
('You are allowed to say, “I can''t do everything.”', 'Being a good caregiver does not mean doing everything yourself. Choose one task today that someone else could help with.'),
('Rest is not something you have to earn.', 'Your body needs recovery even when there is still work to do. A short pause can be useful care, not wasted time.'),
('Be specific when asking for help.', 'Instead of saying “I need help,” try “Could you take Dad to his appointment on Thursday?” Specific requests are easier for others to act on.'),
('You are a caregiver, not a machine.', 'Feeling frustrated, tired, or uncertain does not mean you are failing. It means you are human and carrying something difficult.'),
('One small thing for yourself still counts.', 'Drink water, step outside, call a friend, listen to music, or take ten quiet minutes. Small acts of care add up.')
ON CONFLICT DO NOTHING;