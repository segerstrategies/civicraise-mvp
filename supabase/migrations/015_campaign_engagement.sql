-- Campaign updates, follows, and lightweight public events for sustained
-- supporter engagement. This migration creates schema and policies only; it
-- does not insert or update campaign/demo rows.

create table if not exists public.campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  milestone_id uuid references public.campaign_milestones(id) on delete set null,
  author_id uuid not null references public.profiles(id),
  title text not null check (length(trim(title)) between 3 and 160),
  body text not null check (length(trim(body)) between 1 and 5000),
  update_type text not null default 'PROGRESS'
    check (update_type in ('PROGRESS','MILESTONE','OUTCOME','NOTICE')),
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists campaign_updates_public_feed_idx
  on public.campaign_updates(campaign_id, published_at desc);

create table if not exists public.campaign_follows (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.campaign_update_reads (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null check (length(trim(title)) between 3 and 160),
  description text not null default '' check (length(description) <= 3000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text not null default '' check (length(location) <= 240),
  event_url text check (event_url is null or event_url ~ '^https://'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index if not exists campaign_events_schedule_idx
  on public.campaign_events(campaign_id, starts_at);

create table if not exists public.campaign_event_rsvps (
  event_id uuid not null references public.campaign_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.campaign_updates enable row level security;
alter table public.campaign_follows enable row level security;
alter table public.campaign_update_reads enable row level security;
alter table public.campaign_events enable row level security;
alter table public.campaign_event_rsvps enable row level security;

grant select on public.campaign_updates, public.campaign_events to anon, authenticated;
grant all on public.campaign_updates, public.campaign_follows,
  public.campaign_update_reads, public.campaign_events,
  public.campaign_event_rsvps to authenticated;

drop policy if exists "published campaign updates read" on public.campaign_updates;
create policy "published campaign updates read" on public.campaign_updates
  for select using (published_at <= now() or public.is_admin());
drop policy if exists "admin campaign updates manage" on public.campaign_updates;
create policy "admin campaign updates manage" on public.campaign_updates
  for all using (public.is_admin()) with check (public.is_admin() and author_id = auth.uid());

drop policy if exists "campaign follows self manage" on public.campaign_follows;
create policy "campaign follows self manage" on public.campaign_follows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "campaign follows admin read" on public.campaign_follows;
create policy "campaign follows admin read" on public.campaign_follows
  for select using (public.is_admin());

drop policy if exists "campaign update reads self manage" on public.campaign_update_reads;
create policy "campaign update reads self manage" on public.campaign_update_reads
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "campaign events public read" on public.campaign_events;
create policy "campaign events public read" on public.campaign_events
  for select using (true);
drop policy if exists "admin campaign events manage" on public.campaign_events;
create policy "admin campaign events manage" on public.campaign_events
  for all using (public.is_admin()) with check (public.is_admin() and created_by = auth.uid());

drop policy if exists "event rsvps self manage" on public.campaign_event_rsvps;
create policy "event rsvps self manage" on public.campaign_event_rsvps
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "event rsvps admin read" on public.campaign_event_rsvps;

-- Only aggregate counts are exposed; attendee identities remain private.
create or replace function public.get_campaign_event_rsvp_counts(p_event_ids uuid[])
returns table(event_id uuid, attendee_count bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, count(r.user_id)
  from public.campaign_events e
  left join public.campaign_event_rsvps r on r.event_id = e.id
  where e.id = any(p_event_ids)
  group by e.id;
$$;
revoke all on function public.get_campaign_event_rsvp_counts(uuid[]) from public, anon;
grant execute on function public.get_campaign_event_rsvp_counts(uuid[]) to authenticated;

create or replace function public.get_campaign_follower_count(p_campaign_id uuid)
returns bigint language sql stable security definer set search_path = public, pg_temp as $$
  select count(*) from public.campaign_follows where campaign_id = p_campaign_id;
$$;
revoke all on function public.get_campaign_follower_count(uuid) from public, anon;
grant execute on function public.get_campaign_follower_count(uuid) to authenticated;
