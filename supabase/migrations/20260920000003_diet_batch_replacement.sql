/*
  Personalized Diet Plans
  Batched meal replacement persistence + functions.

  This migration intentionally creates only the missing tables required by
  the already-built batched meal replacement service, then installs the
  atomic claim/apply functions.

  The tables are service-side persistence only. Direct API access is revoked
  from anon/authenticated; the server-side service_role client is the only
  application path for this V1 implementation.
*/

create table if not exists public.diet_generation_controls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_date date not null,
  scope_key text not null,
  generation_count integer not null default 0,
  last_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint diet_generation_controls_unique_scope
    unique (user_id, plan_date, scope_key),
  constraint diet_generation_controls_generation_count_check
    check (generation_count >= 0)
);

create index if not exists idx_diet_generation_controls_user_date
  on public.diet_generation_controls (user_id, plan_date);

alter table public.diet_generation_controls enable row level security;
revoke all on table public.diet_generation_controls from anon, authenticated, public;
grant all on table public.diet_generation_controls to service_role;


create table if not exists public.diet_meal_replacements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_date date not null,
  meal_type text not null,
  replacement_number smallint not null,
  reason text,
  previous_meal jsonb not null,
  replacement_meal jsonb not null,
  created_at timestamptz not null default now(),

  constraint diet_meal_replacements_number_check
    check (replacement_number between 1 and 2),
  constraint diet_meal_replacements_unique_attempt
    unique (user_id, plan_date, meal_type, replacement_number)
);

create index if not exists idx_diet_meal_replacements_user_date
  on public.diet_meal_replacements (user_id, plan_date);

alter table public.diet_meal_replacements enable row level security;
revoke all on table public.diet_meal_replacements from anon, authenticated, public;
grant all on table public.diet_meal_replacements to service_role;


/*
  Personalized Diet Plans
  Batched meal replacement hardening.

  Dependencies:
    - public.diet_generation_controls
    - public.diet_meal_replacements

  The function claims every selected meal-generation slot atomically
  before the Gemini request. If any selected meal cannot be claimed,
  none of the counters are incremented.

  The apply function writes all replacement history and the updated
  diet_plans row in one database transaction.
*/

create or replace function public.claim_diet_meal_replacement_batch(
  p_user_id uuid,
  p_plan_date date,
  p_meal_types text[],
  p_cooldown_seconds integer default 30
)
returns table (
  allowed boolean,
  reason text,
  remaining_by_meal jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  meal_type text;
  current_count integer;
  current_last_started_at timestamptz;
  result_map jsonb := '{}'::jsonb;
begin
  if p_user_id is null then
    return query
    select false, 'invalid_user', '{}'::jsonb;
    return;
  end if;

  if p_meal_types is null
     or array_length(p_meal_types, 1) is null
     or array_length(p_meal_types, 1) = 0
  then
    return query
    select false, 'no_meals_selected', '{}'::jsonb;
    return;
  end if;

  if array_length(p_meal_types, 1) > 4 then
    return query
    select false, 'too_many_meals', '{}'::jsonb;
    return;
  end if;

  /*
    First pass: validate every requested slot.
    No counter is changed during this pass.
  */
  foreach meal_type in array p_meal_types
  loop
    /*
      Ensure the control row exists before locking it. The unique
      constraint on (user_id, plan_date, scope_key) makes the
      insert safe under concurrent first-time requests.
    */
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
      'meal:' || meal_type,
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
      current_count,
      current_last_started_at
    from public.diet_generation_controls
    where user_id = p_user_id
      and plan_date = p_plan_date
      and scope_key = 'meal:' || meal_type
    for update;

    if current_count >= 2 then
      result_map :=
        result_map ||
        jsonb_build_object(
          meal_type,
          jsonb_build_object(
            'used', current_count,
            'remaining', 0,
            'available', false
          )
        );

      return query
      select
        false,
        'limit_reached:' || meal_type,
        result_map;
      return;
    end if;

    if current_last_started_at is not null
       and current_last_started_at >
         now() - pg_catalog.make_interval(
           secs => p_cooldown_seconds
         )
    then
      result_map :=
        result_map ||
        jsonb_build_object(
          meal_type,
          jsonb_build_object(
            'used', current_count,
            'remaining', greatest(2 - current_count, 0),
            'available', false
          )
        );

      return query
      select
        false,
        'cooldown:' || meal_type,
        result_map;
      return;
    end if;

    result_map :=
      result_map ||
      jsonb_build_object(
        meal_type,
        jsonb_build_object(
          'used', current_count,
          'remaining', greatest(2 - current_count, 0),
          'available', true
        )
      );
  end loop;

  /*
    Second pass: create/update all control rows.
  */
  foreach meal_type in array p_meal_types
  loop
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
      'meal:' || meal_type,
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

    update public.diet_generation_controls
    set
      generation_count =
        generation_count + 1,
      last_started_at =
        now(),
      updated_at =
        now()
    where user_id = p_user_id
      and plan_date = p_plan_date
      and scope_key = 'meal:' || meal_type;

    result_map :=
      result_map ||
      jsonb_build_object(
        meal_type,
        jsonb_build_object(
          'used', (
            select generation_count
            from public.diet_generation_controls
            where user_id = p_user_id
              and plan_date = p_plan_date
              and scope_key = 'meal:' || meal_type
          ),
          'remaining', (
            select greatest(
              2 - generation_count,
              0
            )
            from public.diet_generation_controls
            where user_id = p_user_id
              and plan_date = p_plan_date
              and scope_key = 'meal:' || meal_type
          ),
          'available', true
        )
      );
  end loop;

  return query
  select
    true,
    'claimed',
    result_map;
end;
$$;

revoke all on function public.claim_diet_meal_replacement_batch(
  uuid,
  date,
  text[],
  integer
)
from public;

grant execute on function public.claim_diet_meal_replacement_batch(
  uuid,
  date,
  text[],
  integer
)
to service_role;


create or replace function public.apply_diet_meal_replacements(
  p_user_id uuid,
  p_plan_date date,
  p_replacements jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_plan public.diet_plans%rowtype;
  replacement_item jsonb;
  current_meal jsonb;
  updated_meals jsonb;
  target_meal_type text;
  replacement_number integer;
begin
  if p_user_id is null then
    raise exception 'invalid_user';
  end if;

  if p_replacements is null
     or jsonb_typeof(p_replacements) <> 'array'
     or jsonb_array_length(p_replacements) = 0
  then
    raise exception 'invalid_replacements';
  end if;

  if jsonb_array_length(p_replacements) > 4 then
    raise exception 'too_many_replacements';
  end if;

  select *
  into current_plan
  from public.diet_plans
  where user_id = p_user_id
    and plan_date = p_plan_date
  for update;

  if not found then
    raise exception 'plan_not_found';
  end if;

  updated_meals := current_plan.meals;

  for replacement_item in
    select value
    from jsonb_array_elements(
      p_replacements
    )
  loop
    target_meal_type :=
      replacement_item ->> 'mealType';

    replacement_number :=
      (replacement_item ->> 'replacementNumber')::integer;

    if target_meal_type is null
       or replacement_number not between 1 and 2
    then
      raise exception 'invalid_replacement_item';
    end if;

    current_meal := null;

    select meal
    into current_meal
    from jsonb_array_elements(
      current_plan.meals
    ) as meal
    where meal ->> 'mealType' =
      target_meal_type
    limit 1;

    if current_meal is null then
      raise exception
        'meal_not_found:%',
        target_meal_type;
    end if;

    /*
      Apply each replacement to the accumulated meal array. This is
      important for multi-select requests: starting from current_plan.meals
      here would discard earlier replacements and keep only the last one.
    */
    updated_meals := (
      select jsonb_agg(
        case
          when meal ->> 'mealType' =
            target_meal_type
          then replacement_item -> 'replacementMeal'
          else meal
        end
        order by ord
      )
      from jsonb_array_elements(
        updated_meals
      ) with ordinality as items(meal, ord)
    );

    insert into public.diet_meal_replacements (
      user_id,
      plan_date,
      meal_type,
      replacement_number,
      reason,
      previous_meal,
      replacement_meal
    )
    values (
      p_user_id,
      p_plan_date,
      target_meal_type,
      replacement_number,
      nullif(
        replacement_item ->> 'reason',
        ''
      ),
      current_meal,
      replacement_item -> 'replacementMeal'
    );
  end loop;

  update public.diet_plans
  set
    meals = updated_meals,
    updated_at = now()
  where user_id = p_user_id
    and plan_date = p_plan_date;

  return jsonb_build_object(
    'id', current_plan.id,
    'user_id', current_plan.user_id,
    'plan_date', current_plan.plan_date,
    'summary', current_plan.summary,
    'meals', updated_meals,
    'hydration_guidance', current_plan.hydration_guidance,
    'general_nutrition_notes', current_plan.general_nutrition_notes,
    'safety_notes', current_plan.safety_notes,
    'sources', current_plan.sources,
    'personalization_factors', current_plan.personalization_factors,
    'generated_at', current_plan.generated_at,
    'model_version', current_plan.model_version,
    'knowledge_version', current_plan.knowledge_version,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.apply_diet_meal_replacements(
  uuid,
  date,
  jsonb
)
from public;

grant execute on function public.apply_diet_meal_replacements(
  uuid,
  date,
  jsonb
)
to service_role;