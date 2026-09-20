/* Personalized Diet Plans base schema.
   Server APIs use the authenticated Supabase user and service role for writes. */

create extension if not exists pgcrypto;

create table if not exists public.dietary_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diet_type text,
  other_diet_type text,
  allergies jsonb not null default '[]'::jsonb,
  severe_allergies jsonb not null default '[]'::jsonb,
  intolerances jsonb not null default '[]'::jsonb,
  avoided_foods jsonb not null default '[]'::jsonb,
  preferred_foods jsonb not null default '[]'::jsonb,
  cuisine_preferences jsonb not null default '[]'::jsonb,
  meal_count integer,
  meal_timing jsonb not null default '[]'::jsonb,
  appetite text,
  nutrition_goals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  summary text not null,
  meals jsonb not null default '[]'::jsonb,
  hydration_guidance text not null default '',
  general_nutrition_notes jsonb not null default '[]'::jsonb,
  safety_notes jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  personalization_factors jsonb not null default '[]'::jsonb,
  model_version text,
  knowledge_version text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint diet_plans_user_date_unique unique (user_id, plan_date)
);

create table if not exists public.diet_nutrition_knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text,
  url text,
  publication_date text,
  source_type text not null,
  content text not null,
  tags jsonb not null default '[]'::jsonb,
  knowledge_version text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diet_plans_user_date
  on public.diet_plans (user_id, plan_date desc);

create index if not exists idx_diet_nutrition_knowledge_active
  on public.diet_nutrition_knowledge (is_active);

alter table public.dietary_preferences enable row level security;
alter table public.diet_plans enable row level security;
alter table public.diet_nutrition_knowledge enable row level security;

revoke all on public.dietary_preferences from anon, authenticated, public;
revoke all on public.diet_plans from anon, authenticated, public;
revoke all on public.diet_nutrition_knowledge from anon, authenticated, public;
grant all on public.dietary_preferences to service_role;
grant all on public.diet_plans to service_role;
grant all on public.diet_nutrition_knowledge to service_role;
