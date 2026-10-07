-- Operational hardening for the MVP workflow.
-- Prevent negative test pledges and invalid ratification percentages.
alter table public.pledges drop constraint if exists pledges_amount_positive;
alter table public.pledges add constraint pledges_amount_positive check (amount_cents > 0);
alter table public.campaigns drop constraint if exists campaigns_raised_nonnegative;
alter table public.campaigns add constraint campaigns_raised_nonnegative check (raised_cents >= 0 and goal_cents >= 0);
alter table public.ratification_ballots drop constraint if exists ratification_thresholds_valid;
alter table public.ratification_ballots add constraint ratification_thresholds_valid check (quorum_percent > 0 and quorum_percent <= 100 and approval_percent > 0 and approval_percent <= 100);

-- Only one open ballot per campaign.
create unique index if not exists one_open_ballot_per_campaign on public.ratification_ballots(campaign_id) where status='OPEN';

-- Admin audit helper.
create or replace function public.log_audit(p_event text, p_entity_type text, p_entity_id uuid, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload) values(auth.uid(),p_event,p_entity_type,p_entity_id,p_payload);
end;
$$;

-- Dispute resolution fields.
alter table public.disputes add column if not exists resolved_at timestamptz;
alter table public.disputes add column if not exists resolved_by uuid references public.profiles(id);

-- Citizens can see their own campaign's disputes.
drop policy if exists "disputes participant read" on public.disputes;
create policy "disputes participant read" on public.disputes for select using (auth.uid()=raised_by or public.is_admin() or exists(select 1 from public.deliverables d join public.contracts c on c.id=d.contract_id join public.rfps r on r.id=c.rfp_id join public.pledges p on p.campaign_id=r.campaign_id where d.id=disputes.deliverable_id and p.user_id=auth.uid()));
