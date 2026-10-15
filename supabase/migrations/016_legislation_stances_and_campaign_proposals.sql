-- Private, user-controlled positions on bills, plus a reviewed intake path for
-- proposed campaigns. Individual political positions are never admin-readable.
create table if not exists public.legislation_stances (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bill_code text not null check (bill_code = upper(btrim(bill_code)) and length(bill_code) between 1 and 40),
  stance text not null check (stance in ('SUPPORT', 'OPPOSE')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, bill_code)
);

alter table public.legislation_stances enable row level security;
create policy "users manage own legislation stances"
  on public.legislation_stances for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
grant select, insert, update, delete on public.legislation_stances to authenticated;

create table if not exists public.campaign_proposals (
  id uuid primary key default gen_random_uuid(),
  submitted_by uuid not null references public.profiles(id) on delete cascade,
  bill text check (bill is null or length(btrim(bill)) <= 40),
  title text not null check (length(btrim(title)) between 5 and 180),
  objective text not null check (length(btrim(objective)) between 20 and 5000),
  proposed_goal_cents bigint not null check (proposed_goal_cents between 10000 and 100000000),
  issue_areas text[] not null default '{}' check (cardinality(issue_areas) between 1 and 13),
  source_url text check (source_url is null or source_url ~* '^https?://'),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'APPROVED', 'DECLINED')),
  reviewer_note text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists campaign_proposals_submitter_created_idx
  on public.campaign_proposals (submitted_by, created_at desc);
create index if not exists campaign_proposals_status_created_idx
  on public.campaign_proposals (status, created_at);

alter table public.campaign_proposals enable row level security;
create policy "submitters and admins read campaign proposals"
  on public.campaign_proposals for select
  using (auth.uid() = submitted_by or public.is_admin());
create policy "users submit own campaign proposals"
  on public.campaign_proposals for insert
  with check (
    auth.uid() = submitted_by
    and status = 'SUBMITTED'
    and campaign_id is null
    and reviewer_note is null
    and reviewed_at is null
  );
grant select, insert on public.campaign_proposals to authenticated;

create or replace function public.admin_review_campaign_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proposal public.campaign_proposals%rowtype;
  v_campaign_id uuid;
  v_slug text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  if p_decision is null or p_decision not in ('APPROVED', 'DECLINED') then
    raise exception using errcode = '22023', message = 'Choose APPROVED or DECLINED.';
  end if;

  select * into v_proposal
  from public.campaign_proposals
  where id = p_proposal_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Campaign proposal not found.');
  end if;
  if v_proposal.status <> 'SUBMITTED' then
    return jsonb_build_object('ok', false, 'message', 'This proposal has already been reviewed.');
  end if;

  if p_decision = 'APPROVED' then
    v_slug := coalesce(nullif(trim(both '-' from regexp_replace(lower(v_proposal.title), '[^a-z0-9]+', '-', 'g')), ''), 'campaign');
    v_slug := left(v_slug, 70) || '-' || left(replace(v_proposal.id::text, '-', ''), 8);

    insert into public.campaigns (slug, title, bill, description, issue_areas, goal_cents, status)
    values (v_slug, v_proposal.title, nullif(btrim(v_proposal.bill), ''), v_proposal.objective,
      v_proposal.issue_areas, v_proposal.proposed_goal_cents, 'DRAFT')
    returning id into v_campaign_id;
  end if;

  update public.campaign_proposals
  set status = p_decision,
      reviewer_note = nullif(btrim(p_note), ''),
      campaign_id = v_campaign_id,
      reviewed_at = now()
  where id = p_proposal_id;

  insert into public.audit_events (actor_id, event_type, entity_type, entity_id, payload)
  values (auth.uid(), 'CAMPAIGN_PROPOSAL_' || p_decision, 'campaign_proposal', p_proposal_id,
    jsonb_build_object('campaign_id', v_campaign_id, 'note', nullif(btrim(p_note), '')));

  return jsonb_build_object(
    'ok', true,
    'message', case when p_decision = 'APPROVED'
      then 'Proposal approved and a draft campaign was created for admin setup.'
      else 'Proposal declined.' end,
    'campaign_id', v_campaign_id
  );
end;
$$;

revoke all on function public.admin_review_campaign_proposal(uuid, text, text) from public, anon;
grant execute on function public.admin_review_campaign_proposal(uuid, text, text) to authenticated;
