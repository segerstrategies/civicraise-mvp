create extension if not exists pgcrypto;

do $$ begin create type user_role as enum ('citizen','advocate','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type campaign_status as enum ('DRAFT','UNDER_REVIEW','PUBLISHED','FUNDING','FUNDED','RFP_OPEN','BID_REVIEW','ADVOCATE_SELECTED','CONTRACT_ACTIVE','MILESTONE_ACTIVE','DELIVERABLE_SUBMITTED','TECHNICAL_REVIEW','BACKER_REVIEW','RATIFIED','DISBURSEMENT_PENDING','DISBURSED','COMPLETED','EXPIRED','RFP_CLOSED','CURE_REQUIRED','DISPUTED','RESOLVED'); exception when duplicate_object then null; end $$;

create table if not exists profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text,role user_role not null default 'citizen',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists campaigns(id uuid primary key default gen_random_uuid(),slug text unique not null,title text not null,bill text,description text,goal_cents bigint not null default 0,raised_cents bigint not null default 0,status campaign_status not null default 'DRAFT',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists campaign_milestones(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references campaigns(id) on delete cascade,name text not null,amount_cents bigint not null,sequence int not null,created_at timestamptz not null default now());
create table if not exists pledges(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references campaigns(id) on delete cascade,user_id uuid not null references profiles(id) on delete cascade,amount_cents bigint not null check(amount_cents>0),provider text not null default 'mock',provider_reference text,created_at timestamptz not null default now());
create table if not exists advocate_profiles(id uuid primary key references profiles(id) on delete cascade,firm_name text,bio text,registration_status text,verification_status text not null default 'pending',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists rfps(id uuid primary key default gen_random_uuid(),slug text unique not null,campaign_id uuid not null references campaigns(id) on delete cascade,title text not null,budget_cents bigint not null,status text not null default 'OPEN',deadline timestamptz,created_at timestamptz not null default now());
create table if not exists bids(id uuid primary key default gen_random_uuid(),rfp_id uuid not null references rfps(id) on delete cascade,advocate_id uuid not null references advocate_profiles(id) on delete cascade,amount_cents bigint not null,proposal text,status text not null default 'SUBMITTED',created_at timestamptz not null default now());
create table if not exists contracts(id uuid primary key default gen_random_uuid(),rfp_id uuid not null references rfps(id),advocate_id uuid not null references advocate_profiles(id),status text not null default 'DRAFT',created_at timestamptz not null default now());
create table if not exists deliverables(id uuid primary key default gen_random_uuid(),contract_id uuid not null references contracts(id) on delete cascade,milestone_id uuid not null references campaign_milestones(id),description text,storage_path text,status text not null default 'SUBMITTED',submitted_at timestamptz not null default now());
create table if not exists ratification_ballots(id uuid primary key default gen_random_uuid(),campaign_id uuid not null references campaigns(id),deliverable_id uuid references deliverables(id),status text not null default 'OPEN',quorum_percent numeric not null default 60,approval_percent numeric not null default 85,opened_at timestamptz not null default now());
create table if not exists ratification_votes(id uuid primary key default gen_random_uuid(),ballot_id uuid not null references ratification_ballots(id) on delete cascade,user_id uuid not null references profiles(id),pledged_cents bigint not null,approve boolean not null,created_at timestamptz not null default now(),unique(ballot_id,user_id));
create table if not exists ledger_entries(id uuid primary key default gen_random_uuid(),campaign_id uuid references campaigns(id),entry_type text not null,amount_cents bigint not null,reference_type text,reference_id uuid,created_at timestamptz not null default now());
create table if not exists audit_events(id bigint generated always as identity primary key,actor_id uuid references profiles(id),event_type text not null,entity_type text,entity_id uuid,payload jsonb,created_at timestamptz not null default now());
create table if not exists disputes(id uuid primary key default gen_random_uuid(),deliverable_id uuid references deliverables(id),raised_by uuid references profiles(id),reason text,status text not null default 'OPEN',created_at timestamptz not null default now());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.email)) on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists campaigns_touch on campaigns; create trigger campaigns_touch before update on campaigns for each row execute procedure public.touch_updated_at();
drop trigger if exists profiles_touch on profiles; create trigger profiles_touch before update on profiles for each row execute procedure public.touch_updated_at();
drop trigger if exists advocate_profiles_touch on advocate_profiles; create trigger advocate_profiles_touch before update on advocate_profiles for each row execute procedure public.touch_updated_at();

alter table profiles enable row level security; alter table campaigns enable row level security; alter table campaign_milestones enable row level security; alter table pledges enable row level security; alter table advocate_profiles enable row level security; alter table rfps enable row level security; alter table bids enable row level security; alter table contracts enable row level security; alter table deliverables enable row level security; alter table ratification_ballots enable row level security; alter table ratification_votes enable row level security; alter table ledger_entries enable row level security; alter table audit_events enable row level security; alter table disputes enable row level security;

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin'); $$;
create policy "profiles self read" on profiles for select using(auth.uid()=id or public.is_admin());
create policy "profiles self update" on profiles for update using(auth.uid()=id) with check(auth.uid()=id and role=(select role from public.profiles where id=auth.uid()));
create policy "campaigns public read" on campaigns for select using(status not in ('DRAFT','UNDER_REVIEW'));
create policy "milestones public read" on campaign_milestones for select using(true);
create policy "pledges self read" on pledges for select using(auth.uid()=user_id or public.is_admin());
create policy "pledges self insert" on pledges for insert with check(auth.uid()=user_id);
create policy "advocate public read" on advocate_profiles for select using(true);
create policy "advocate self write" on advocate_profiles for insert with check(auth.uid()=id);
create policy "advocate self update" on advocate_profiles for update using(auth.uid()=id) with check(auth.uid()=id);
create policy "rfp public read" on rfps for select using(true);
create policy "bids self read" on bids for select using(auth.uid()=advocate_id or public.is_admin());
create policy "bids self insert" on bids for insert with check(auth.uid()=advocate_id);
create policy "contracts participant read" on contracts for select using(auth.uid()=advocate_id or public.is_admin());
create policy "deliverables participant read" on deliverables for select using(exists(select 1 from contracts c where c.id=contract_id and c.advocate_id=auth.uid()) or public.is_admin());
create policy "ballots public read" on ratification_ballots for select using(true);
create policy "votes self read" on ratification_votes for select using(auth.uid()=user_id or public.is_admin());
create policy "votes self insert" on ratification_votes for insert with check(auth.uid()=user_id);
create policy "ledger public read" on ledger_entries for select using(true);
create policy "audit admin read" on audit_events for select using(public.is_admin());
create policy "disputes participant read" on disputes for select using(auth.uid()=raised_by or public.is_admin());
