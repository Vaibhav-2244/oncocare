-- Native caregiver wellbeing, peer support, and Ayurveda supportive-care data.
-- Private rows are owned by auth.uid(); public catalog rows contain no personal data.

CREATE TABLE IF NOT EXISTS caregiver_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  mood text NOT NULL CHECK (mood IN ('okay', 'tired', 'overwhelmed', 'low', 'supported')),
  severity integer NOT NULL DEFAULT 5 CHECK (severity BETWEEN 0 AND 10),
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caregiver_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  content text NOT NULL,
  reading_time integer NOT NULL DEFAULT 5 CHECK (reading_time > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caregiver_saved_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES caregiver_resources(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_id)
);

CREATE TABLE IF NOT EXISTS caregiver_support_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  meeting_type text NOT NULL DEFAULT 'Online',
  meeting_day text,
  meeting_time text,
  member_count integer NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS caregiver_group_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES caregiver_support_groups(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id)
);

CREATE TABLE IF NOT EXISTS ayurveda_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  publisher text NOT NULL,
  publication_year integer,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ayurveda_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  side_effect text NOT NULL,
  title text NOT NULL,
  practice text NOT NULL,
  evidence_level text NOT NULL CHECK (evidence_level IN ('higher', 'limited', 'insufficient')),
  summary text NOT NULL,
  evidence_summary text NOT NULL,
  use_notes text NOT NULL,
  safety_notes text NOT NULL,
  clinical_review_status text NOT NULL DEFAULT 'pending' CHECK (clinical_review_status IN ('pending', 'under_review', 'approved')),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ayurveda_protocol_sources (
  protocol_id uuid NOT NULL REFERENCES ayurveda_protocols(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES ayurveda_sources(id) ON DELETE CASCADE,
  PRIMARY KEY (protocol_id, source_id)
);

CREATE TABLE IF NOT EXISTS ayurveda_saved_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_id uuid NOT NULL REFERENCES ayurveda_protocols(id) ON DELETE CASCADE,
  saved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, protocol_id)
);

CREATE TABLE IF NOT EXISTS ayurveda_symptom_check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  symptom text NOT NULL,
  severity integer NOT NULL CHECK (severity BETWEEN 0 AND 10),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ayurveda_safety_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item text NOT NULL UNIQUE,
  severity text NOT NULL DEFAULT 'high' CHECK (severity IN ('high', 'moderate', 'low')),
  message text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_caregiver_check_ins_user ON caregiver_check_ins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_resources_user ON caregiver_saved_resources (user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_group_memberships_user ON caregiver_group_memberships (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayurveda_saved_user ON ayurveda_saved_protocols (user_id, saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayurveda_checkins_user ON ayurveda_symptom_check_ins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ayurveda_protocols_side_effect ON ayurveda_protocols (side_effect);

ALTER TABLE caregiver_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_saved_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_support_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE caregiver_group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE ayurveda_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ayurveda_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE ayurveda_protocol_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE ayurveda_saved_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE ayurveda_symptom_check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE ayurveda_safety_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY caregiver_check_ins_owner ON caregiver_check_ins FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY caregiver_resources_read ON caregiver_resources FOR SELECT TO authenticated USING (true);
CREATE POLICY caregiver_saved_resources_owner ON caregiver_saved_resources FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY caregiver_groups_read ON caregiver_support_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY caregiver_memberships_owner ON caregiver_group_memberships FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ayurveda_sources_read ON ayurveda_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY ayurveda_protocols_read ON ayurveda_protocols FOR SELECT TO authenticated USING (true);
CREATE POLICY ayurveda_protocol_sources_read ON ayurveda_protocol_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY ayurveda_saved_owner ON ayurveda_saved_protocols FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ayurveda_checkins_owner ON ayurveda_symptom_check_ins FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY ayurveda_safety_read ON ayurveda_safety_items FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION update_caregiver_group_member_count() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE caregiver_support_groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE caregiver_support_groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS caregiver_group_member_count_trigger ON caregiver_group_memberships;
CREATE TRIGGER caregiver_group_member_count_trigger
AFTER INSERT OR DELETE ON caregiver_group_memberships
FOR EACH ROW EXECUTE FUNCTION update_caregiver_group_member_count();

INSERT INTO caregiver_resources (title, category, description, content, reading_time) VALUES
('7 signs you are carrying too much', 'Burnout', 'Recognize emotional and physical signs of caregiver burnout.', 'Caregiving can involve appointments, medication schedules, household responsibilities and emotional support. Signs that you may be carrying too much include constant tiredness, irritability, sleep changes, feeling drained, isolation and feeling unable to take a break. Recognition is a reason to seek support, not a sign of failure.', 5),
('Self-care without the guilt', 'Self-care', 'Small ways to protect your energy while caring for someone you love.', 'Self-care does not need to be earned or perfect. Try ten quiet minutes, water, a proper meal, fresh air, a short nap or asking someone to cover one task. Small acts of care can make difficult days more manageable.', 4),
('How to ask family for help', 'Practical', 'A simple way to divide caregiving responsibilities.', 'Make requests specific: ask someone to take a loved one to an appointment, prepare dinner or handle a medication pickup. Sharing responsibility makes caregiving more sustainable and does not make you less caring.', 6),
('Taking a break when your loved one needs you', 'Self-care', 'Why short breaks are part of sustainable caregiving.', 'If another trusted person can safely stay with your loved one, use a short break to rest and reset. If no one is available, ask the care team about caregiver support options.', 5),
('When caregiving feels overwhelming', 'Support', 'What to do when responsibilities feel too heavy.', 'Identify the most urgent responsibility, ask what can wait, and choose one person to contact. Healthcare teams may connect caregivers with social workers, counseling, support services or community organizations.', 5)
ON CONFLICT DO NOTHING;

INSERT INTO caregiver_support_groups (name, description, meeting_type, meeting_day, meeting_time, member_count) VALUES
('Caregivers of loved ones with cancer', 'A gentle space to share experiences, frustrations, questions and small wins with other family caregivers.', 'Online', 'Thursday', '7:00 PM', 18),
('Caregiver stress and coping', 'Practical conversations about stress, boundaries, emotional exhaustion and coping with caregiving demands.', 'Online', 'Saturday', '11:00 AM', 24),
('Family caregivers: open conversation', 'An informal peer space for family members caring for someone with cancer.', 'Online', 'Tuesday', '6:30 PM', 12)
ON CONFLICT DO NOTHING;

INSERT INTO ayurveda_sources (title, publisher, publication_year, url) VALUES
('Cancer and Complementary Health Approaches: What You Need To Know', 'NCCIH', 2026, 'https://www.nccih.nih.gov/health/cancer-and-complementary-health-approaches-what-you-need-to-know'),
('Effects of Ginger Intake on Chemotherapy-Induced Nausea and Vomiting', 'PubMed / Nutrients', 2022, 'https://pubmed.ncbi.nlm.nih.gov/36501010/'),
('Efficacy and Safety of Ginger on Chemotherapy-Induced Nausea and Vomiting', 'PubMed / Cancer Nursing', 2025, 'https://pubmed.ncbi.nlm.nih.gov/38625733/'),
('Effect of a Standardized Ginger Root Powder Regimen', 'PubMed / Journal of the Academy of Nutrition and Dietetics', 2024, 'https://pubmed.ncbi.nlm.nih.gov/37699474/'),
('Effects of Yoga on Cancer-Related Fatigue and Psychological Distress', 'PubMed / Cancer Nursing', 2025, 'https://pubmed.ncbi.nlm.nih.gov/38011074/'),
('The Effectiveness of Yoga on Cancer-Related Fatigue', 'PubMed / Oncology Nursing Forum', 2021, 'https://pubmed.ncbi.nlm.nih.gov/33600394/'),
('Complementary Psychological and Physical Approaches', 'NCCIH Clinical Digest', 2023, 'https://www.nccih.nih.gov/health/providers/digest/mind-and-body-approaches-for-cancer-symptoms-and-treatment-side-effects'),
('8 Things To Know About Cancer Symptoms and Complementary Health Approaches', 'NCCIH', 2026, 'https://www.nccih.nih.gov/health/tips/things-to-know-about-cancer-symptoms-and-psychological-and-physical-complementary-health-approaches'),
('Are You Considering a Complementary Health Approach?', 'NCCIH', 2026, 'https://www.nccih.nih.gov/health/are-you-considering-a-complementary-health-approach'),
('Side Effects of Cancer Treatment', 'National Cancer Institute', 2026, 'https://www.cancer.gov/about-cancer/treatment/side-effects'),
('Ayurvedic Medicine: In Depth', 'NCCIH', 2018, 'https://www.nccih.nih.gov/health/ayurvedic-medicine-in-depth'),
('Herb-Drug Interactions', 'NCCIH Clinical Digest', 2024, 'https://www.nccih.nih.gov/health/providers/digest/herb-drug-interactions'),
('How Medications and Supplements Can Interact', 'NCCIH', 2026, 'https://www.nccih.nih.gov/health/know-science/how-medications-and-supplements-can-interact/talk-with-your-health-care-providers'),
('National Commission for Indian System of Medicine', 'NCISM', 2026, 'https://ncismindia.org/')
ON CONFLICT DO NOTHING;

INSERT INTO ayurveda_protocols (side_effect, title, practice, evidence_level, summary, evidence_summary, use_notes, safety_notes) VALUES
('Nausea / vomiting', 'Ginger as an adjunct discussion for chemotherapy-related nausea', 'Ginger supplement - clinician review required', 'limited', 'Evidence is mixed. Ginger may help some people with chemotherapy-related nausea, but it is an adjunct discussion and not a replacement for prescribed antiemetics.', 'NCCIH and recent reviews describe mixed, heterogeneous results.', 'Use this card to prepare a question for the oncology team. The app does not prescribe a dose because safety depends on the regimen, medicines, bleeding risk, product quality and clinician assessment.', 'Do not replace or delay prescribed antiemetics. Ask the oncology pharmacist to review the exact product, concentration and dose. Seek advice for worsening vomiting, dehydration or inability to keep medicines down.'),
('Fatigue', 'Gentle yoga and breathing for cancer-related fatigue', 'Gentle yoga / breathing', 'higher', 'Structured, gentle yoga may reduce cancer-related fatigue and anxiety when adapted to a person''s physical condition.', 'Systematic reviews report improvements in selected fatigue and psychological outcomes, but protocols vary.', 'Use gentle, non-straining movement and ask the oncology team about restrictions related to surgery, bone involvement, ports, anaemia, infection risk or other effects.', 'Do not push through severe fatigue, dizziness, chest pain or breathlessness. Ask about exercise restrictions and use a trained instructor familiar with cancer rehabilitation when possible.'),
('Sleep / stress', 'Mindfulness and gentle yoga for stress and sleep support', 'Mindfulness / gentle yoga', 'limited', 'Mindfulness-based approaches and yoga may help some people manage stress, sleep problems and treatment-related distress as supportive care.', 'NCCIH summarizes evidence for selected cancer symptoms and treatment side effects; effects vary by outcome and intervention.', 'Start with brief, comfortable sessions. Persistent or severe symptoms should be discussed with the clinical team.', 'Choose gentle practices if weak or recovering. Seek clinical support for severe anxiety, persistent insomnia or thoughts of self-harm. Stop practices that cause dizziness or distress.'),
('Mouth discomfort', 'Non-herbal mouth-care support during treatment', 'Bland oral care / hydration', 'higher', 'For mouth discomfort, coordinated supportive oral care is safer than an untested herbal rinse.', 'NCI lists mouth and throat problems as common treatment side effects and recommends speaking with the care team.', 'Ask the oncology or dental team for the appropriate mouth-care plan. Avoid irritating products if advised.', 'Report severe mouth pain, bleeding, fever or inability to drink promptly. Do not apply concentrated extracts to damaged tissue without clinician approval.'),
('Neuropathy', 'Gentle movement and symptom tracking for nerve symptoms', 'Gentle movement / safety planning', 'limited', 'The useful role here is symptom tracking, fall-risk awareness and discussion of supportive movement, not recommending a herbal cure.', 'NCI recognises peripheral neuropathy as a treatment side effect; evidence for complementary approaches remains evolving.', 'Record severity and functional changes. Ask about exercise, footwear, balance support and appropriate medicines.', 'Report new weakness, falls, rapidly worsening numbness or difficulty walking. Do not self-treat with concentrated herbal products without medication review.'),
('General safety', 'Curcumin / turmeric: evidence and interaction review before use', 'Supplement review', 'insufficient', 'Evidence is not sufficient to recommend concentrated curcumin products for routine management of treatment side effects.', 'NCCIH states there is not enough evidence to recommend curcumin products for cancer treatment.', 'Bring the exact product label to an oncology pharmacist or clinician rather than starting it based on a generic recommendation.', 'Curcumin is not a cancer treatment. Ask about interactions with cancer medicines and other medicines. Culinary turmeric and concentrated extracts are not equivalent.')
ON CONFLICT DO NOTHING;

INSERT INTO ayurveda_safety_items (item, severity, message) VALUES
('ginger', 'high', 'Evidence for chemotherapy-related nausea is mixed. Ask your oncology team to review the exact product and dose before using a concentrated supplement.'),
('curcumin', 'high', 'Curcumin products are not established cancer treatments and may interact with medicines. Do not start a concentrated product without clinician review.'),
('turmeric extract', 'high', 'Concentrated turmeric/curcumin extracts require medication and product review during cancer treatment.'),
('green tea extract', 'high', 'Concentrated green-tea extracts can interact with medicines and have been associated with liver injury. Ask your clinician before use.'),
('ashwagandha', 'high', 'Evidence for cancer-treatment use is insufficient and interaction concerns exist. Do not self-start during treatment.'),
('ayurvedic metal', 'high', 'Some Ayurvedic preparations may contain lead, mercury or arsenic. Use only products from a verified source and only after clinician review.')
ON CONFLICT (item) DO NOTHING;

-- Link the seeded protocol rows to the source records by stable titles.
INSERT INTO ayurveda_protocol_sources (protocol_id, source_id)
SELECT p.id, s.id FROM ayurveda_protocols p CROSS JOIN ayurveda_sources s
WHERE (p.title LIKE 'Ginger%' AND s.title IN ('Cancer and Complementary Health Approaches: What You Need To Know', 'Effects of Ginger Intake on Chemotherapy-Induced Nausea and Vomiting', 'Efficacy and Safety of Ginger on Chemotherapy-Induced Nausea and Vomiting', 'Effect of a Standardized Ginger Root Powder Regimen'))
   OR (p.title LIKE 'Gentle yoga%' AND s.title IN ('Effects of Yoga on Cancer-Related Fatigue and Psychological Distress', 'The Effectiveness of Yoga on Cancer-Related Fatigue', 'Complementary Psychological and Physical Approaches'))
   OR (p.title LIKE 'Mindfulness%' AND s.title = 'Complementary Psychological and Physical Approaches')
   OR (p.title LIKE 'Non-herbal%' AND s.title IN ('Side Effects of Cancer Treatment', 'Ayurvedic Medicine: In Depth'))
   OR (p.title LIKE 'Gentle movement%' AND s.title IN ('Side Effects of Cancer Treatment', 'Herb-Drug Interactions'))
   OR (p.title LIKE 'Curcumin%' AND s.title IN ('Cancer and Complementary Health Approaches: What You Need To Know', 'How Medications and Supplements Can Interact'))
ON CONFLICT DO NOTHING;
