/*
  Personalized Diet Plans
  Safety + Generation Hardening

  Adds:
  1. Queryable knowledge_versions JSONB on diet_plans
  2. Atomic regeneration/cooldown control
  3. Server-side slot claiming function

  Does NOT create authentication.
  Does NOT modify medication/supplement systems.
*/

-- ============================================================
-- 1. QUERYABLE KNOWLEDGE VERSION STORAGE
-- ============================================================

alter table public.diet_plans
  add column if not exists knowledge_versions jsonb
  not null
  default '[]'::jsonb;

-- Backfill the new structured field from the existing legacy text
-- column where possible.
update public.diet_plans
set knowledge_versions =
  case
    when knowledge_version is null
      or btrim(knowledge_version) = ''
    then '[]'::jsonb
    else to_jsonb(
      array(
        select btrim(value)
        from unnest(
          string_to_array(
            knowledge_version,
            ','
          )
        ) as value
        where btrim(value) <> ''
      )
    )
  end
where knowledge_versions = '[]'::jsonb
  and knowledge_version is not null;

create index if not exists idx_diet_plans_knowledge_versions
  on public.diet_plans
  using gin (knowledge_versions);

comment on column public.diet_plans.knowledge_versions is
  'Structured JSON array of nutrition knowledge versions used to generate this plan. knowledge_version is retained for backwards compatibility.';

-- ============================================================
-- 2. GENERATION CONTROL TABLE
-- ============================================================

create table if not exists public.diet_generation_controls (
  user_id uuid not null,

  plan_date date not null,

  /*
    Examples:
      full_plan
      meal:breakfast
      meal:lunch
      meal:dinner
  */
  scope_key text not null,

  generation_count integer not null default 0
    check (generation_count >= 0),

  last_started_at timestamptz,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  primary key (
    user_id,
    plan_date,
    scope_key
  )
);

create index if not exists idx_diet_generation_controls_user_date
  on public.diet_generation_controls (
    user_id,
    plan_date desc
  );

alter table public.diet_generation_controls
  enable row level security;

drop policy if exists "diet generation controls select own"
  on public.diet_generation_controls;

create policy "diet generation controls select own"
  on public.diet_generation_controls
  for select
  using (
    auth.uid() = user_id
  );

-- No direct client INSERT / UPDATE / DELETE policies are created.
-- Generation slots are claimed through the controlled SECURITY
-- DEFINER function below.

-- ============================================================
-- 3. ATOMIC GENERATION SLOT CLAIM
-- ============================================================

create or replace function public.claim_diet_generation_slot(
  p_user_id uuid,
  p_plan_date date,
  p_scope_key text,
  p_max_count integer,
  p_cooldown_seconds integer default 30
)
returns table (
  allowed boolean,
  remaining integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
  existing_last_started_at timestamptz;
  remaining_count integer;
begin
  if p_user_id is null then
    return query
    select
      false,
      0,
      'invalid_user';
    return;
  end if;

  if p_max_count < 1 then
    return query
    select
      false,
      0,
      'invalid_max_count';
    return;
  end if;

  if p_cooldown_seconds < 0 then
    return query
    select
      false,
      0,
      'invalid_cooldown';
    return;
  end if;

  insert into public.diet_generation_controls (
    user_id,
    plan_date,
    scope_key,
    generation_count,
    last_started_at,
    created_at,
    updated_at
  )
  values (
    p_user_id,
    p_plan_date,
    p_scope_key,
    0,
    null,
    now(),
    now()
  )
  on conflict (
    user_id,
    plan_date,
    scope_key
  )
  do nothing;

  select
    generation_count,
    last_started_at
  into
    existing_count,
    existing_last_started_at
  from public.diet_generation_controls
  where user_id = p_user_id
    and plan_date = p_plan_date
    and scope_key = p_scope_key
  for update;

  if existing_last_started_at is not null
     and existing_last_started_at >
       now() - make_interval(
         secs => p_cooldown_seconds
       )
  then
    remaining_count =
      greatest(
        p_max_count - existing_count,
        0
      );

    return query
    select
      false,
      remaining_count,
      'cooldown';
    return;
  end if;

  if existing_count >= p_max_count then
    return query
    select
      false,
      0,
      'limit_reached';
    return;
  end if;

  update public.diet_generation_controls
  set
    generation_count =
      existing_count + 1,
    last_started_at =
      now(),
    updated_at =
      now()
  where user_id = p_user_id
    and plan_date = p_plan_date
    and scope_key = p_scope_key;

  remaining_count =
    greatest(
      p_max_count - existing_count - 1,
      0
    );

  return query
  select
    true,
    remaining_count,
    'claimed';
end;
$$;

revoke all on function public.claim_diet_generation_slot(
  uuid,
  date,
  text,
  integer,
  integer
)
from public;

grant execute on function public.claim_diet_generation_slot(
  uuid,
  date,
  text,
  integer,
  integer
)
to service_role;

comment on function public.claim_diet_generation_slot(
  uuid,
  date,
  text,
  integer,
  integer
) is
  'Atomically claims a Personalized Diet Plans AI generation slot with per-scope daily limits and cooldown protection. Intended for trusted server-side execution.';