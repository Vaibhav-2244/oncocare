/*
  Personalized Diet Plans
  Experience Upgrade — Phase 1

  Adds:
  1. Meal feedback events
  2. Meal replacement records
  3. Persistent personalization signals

  Existing diet-plan generation tables are not modified here.

  IMPORTANT:
  - No authentication is created by this feature.
  - Existing OncoCare+ authentication remains responsible for identity.
  - Service-role access used during current development bypasses RLS.
  - Production application requests should use the authenticated user's context.
*/

create extension if not exists pgcrypto;

-- ============================================================
-- 1. MEAL / DAILY FEEDBACK EVENTS
-- ============================================================

create table if not exists public.diet_feedback_events (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,

  /*
    A meal-specific feedback event uses:
      breakfast
      mid_morning
      lunch
      evening_snack
      dinner

    A daily experience event uses:
      daily
  */
  meal_type text not null
    check (
      meal_type in (
        'breakfast',
        'mid_morning',
        'lunch',
        'evening_snack',
        'dinner',
        'daily'
      )
    ),

  plan_date date not null,

  sentiment text not null
    check (
      sentiment in (
        'positive',
        'neutral',
        'negative'
      )
    ),

  /*
    Optional reason associated with a meal-level dislike/replacement.
  */
  reason text,

  /*
    Optional patient note.
    Keep this small and patient-entered.
  */
  note text,

  created_at timestamptz not null default now()
);

create index if not exists idx_diet_feedback_events_user_date
  on public.diet_feedback_events (user_id, plan_date desc);

create index if not exists idx_diet_feedback_events_user_meal
  on public.diet_feedback_events (user_id, meal_type, plan_date desc);

-- ============================================================
-- 2. MEAL REPLACEMENT HISTORY
-- ============================================================

create table if not exists public.diet_meal_replacements (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,

  plan_date date not null,

  meal_type text not null
    check (
      meal_type in (
        'breakfast',
        'mid_morning',
        'lunch',
        'evening_snack',
        'dinner'
      )
    ),

  /*
    Maximum intended replacement sequence for one meal/day is 2.
    The database also protects this invariant.
  */
  replacement_number smallint not null
    check (replacement_number between 1 and 2),

  reason text,

  /*
    Snapshot of the meal before replacement.
    Stored so historical state remains understandable.
  */
  previous_meal jsonb not null,

  /*
    Snapshot of the generated replacement meal.
  */
  replacement_meal jsonb not null,

  created_at timestamptz not null default now(),

  constraint uq_diet_meal_replacement_sequence
    unique (
      user_id,
      plan_date,
      meal_type,
      replacement_number
    )
);

create index if not exists idx_diet_meal_replacements_user_date
  on public.diet_meal_replacements (user_id, plan_date desc);

create index if not exists idx_diet_meal_replacements_user_meal
  on public.diet_meal_replacements (
    user_id,
    meal_type,
    plan_date desc
  );

-- ============================================================
-- 3. RUNNING PERSONALIZATION SIGNALS
-- ============================================================

create table if not exists public.diet_personalization_signals (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null,

  /*
    Example signal keys:
      dislikes_heavy_meals
      dislikes_similar_meals
      prefers_lighter_breakfast
      reports_low_meal_appeal
      reports_food_unavailable
  */
  signal_key text not null,

  /*
    Count is intentionally simple.
    More advanced statistical modelling can be added later.
  */
  occurrence_count integer not null default 0
    check (occurrence_count >= 0),

  first_observed_at timestamptz not null default now(),

  last_observed_at timestamptz not null default now(),

  /*
    Optional context such as affected meal types.
  */
  metadata jsonb not null default '{}'::jsonb,

  constraint uq_diet_personalization_signal
    unique (
      user_id,
      signal_key
    )
);

create index if not exists idx_diet_personalization_signals_user
  on public.diet_personalization_signals (
    user_id,
    last_observed_at desc
  );

-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================

alter table public.diet_feedback_events
  enable row level security;

alter table public.diet_meal_replacements
  enable row level security;

alter table public.diet_personalization_signals
  enable row level security;

-- ============================================================
-- FEEDBACK POLICIES
-- ============================================================

drop policy if exists "diet feedback select own"
  on public.diet_feedback_events;

create policy "diet feedback select own"
  on public.diet_feedback_events
  for select
  using (
    auth.uid() = user_id
  );

drop policy if exists "diet feedback insert own"
  on public.diet_feedback_events;

create policy "diet feedback insert own"
  on public.diet_feedback_events
  for insert
  with check (
    auth.uid() = user_id
  );

drop policy if exists "diet feedback update own"
  on public.diet_feedback_events;

create policy "diet feedback update own"
  on public.diet_feedback_events
  for update
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
  );

drop policy if exists "diet feedback delete own"
  on public.diet_feedback_events;

create policy "diet feedback delete own"
  on public.diet_feedback_events
  for delete
  using (
    auth.uid() = user_id
  );

-- ============================================================
-- MEAL REPLACEMENT POLICIES
-- ============================================================

drop policy if exists "diet replacements select own"
  on public.diet_meal_replacements;

create policy "diet replacements select own"
  on public.diet_meal_replacements
  for select
  using (
    auth.uid() = user_id
  );

drop policy if exists "diet replacements insert own"
  on public.diet_meal_replacements;

create policy "diet replacements insert own"
  on public.diet_meal_replacements
  for insert
  with check (
    auth.uid() = user_id
  );

drop policy if exists "diet replacements update own"
  on public.diet_meal_replacements;

create policy "diet replacements update own"
  on public.diet_meal_replacements
  for update
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
  );

drop policy if exists "diet replacements delete own"
  on public.diet_meal_replacements;

create policy "diet replacements delete own"
  on public.diet_meal_replacements
  for delete
  using (
    auth.uid() = user_id
  );

-- ============================================================
-- PERSONALIZATION SIGNAL POLICIES
-- ============================================================

drop policy if exists "diet signals select own"
  on public.diet_personalization_signals;

create policy "diet signals select own"
  on public.diet_personalization_signals
  for select
  using (
    auth.uid() = user_id
  );

drop policy if exists "diet signals insert own"
  on public.diet_personalization_signals;

create policy "diet signals insert own"
  on public.diet_personalization_signals
  for insert
  with check (
    auth.uid() = user_id
  );

drop policy if exists "diet signals update own"
  on public.diet_personalization_signals;

create policy "diet signals update own"
  on public.diet_personalization_signals
  for update
  using (
    auth.uid() = user_id
  )
  with check (
    auth.uid() = user_id
  );

drop policy if exists "diet signals delete own"
  on public.diet_personalization_signals;

create policy "diet signals delete own"
  on public.diet_personalization_signals
  for delete
  using (
    auth.uid() = user_id
  );

-- ============================================================
-- 5. DOCUMENT INTENDED RESPONSIBILITIES
-- ============================================================

comment on table public.diet_feedback_events is
  'Patient feedback events for Personalized Diet Plans. Does not replace symptom tracking, medication tracking, or supplement tracking.';

comment on table public.diet_meal_replacements is
  'History of patient-requested meal replacements inside Personalized Diet Plans. Each meal/day supports at most two replacements.';

comment on table public.diet_personalization_signals is
  'Lightweight running signals derived from nutrition feedback for future meal personalization. Signals are not clinical diagnoses.';