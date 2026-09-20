/*
  Personalized Diet Plans
  Dietary Preference Hardening

  Adds:
  - other_diet_type
  - severe_allergies

  The existing allergies array remains the hard exclusion source.
  severe_allergies is an additional safety signal only.

  meal_count remains for backwards compatibility but the application
  now derives it from meal_timing.
*/

alter table public.dietary_preferences
  add column if not exists other_diet_type text;

alter table public.dietary_preferences
  add column if not exists severe_allergies jsonb
  not null
  default '[]'::jsonb;

alter table public.dietary_preferences
  drop constraint if exists dietary_preferences_severe_allergies_array_check;

alter table public.dietary_preferences
  add constraint dietary_preferences_severe_allergies_array_check
  check (
    jsonb_typeof(severe_allergies) = 'array'
  );

alter table public.dietary_preferences
  drop constraint if exists dietary_preferences_other_diet_type_length_check;

alter table public.dietary_preferences
  add constraint dietary_preferences_other_diet_type_length_check
  check (
    other_diet_type is null
    or char_length(btrim(other_diet_type)) <= 80
  );

update public.dietary_preferences
set severe_allergies = '[]'::jsonb
where severe_allergies is null;
