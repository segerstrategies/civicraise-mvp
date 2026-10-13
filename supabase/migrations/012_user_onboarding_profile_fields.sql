-- Store optional onboarding details for matching while keeping account email in Supabase Auth.
alter table public.profiles
  add column if not exists phone text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists interest_areas text[] not null default '{}',
  add column if not exists onboarding_completed_at timestamptz;

-- Existing accounts already have a required email and should not be forced through the new flow.
update public.profiles
set onboarding_completed_at = coalesce(updated_at, created_at, now())
where onboarding_completed_at is null;
