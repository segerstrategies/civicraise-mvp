-- CivicRaise MVP security and operational hardening.
-- Never allow a client-controlled profile update to change its role.
create or replace function public.prevent_profile_role_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and auth.uid() = old.id and new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Profile role cannot be changed by the account holder';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_profile_role_change on public.profiles;
create trigger prevent_profile_role_change before update on public.profiles
for each row execute procedure public.prevent_profile_role_change();

-- Prevent duplicate active contracts for one RFP.
create unique index if not exists one_contract_per_rfp on public.contracts(rfp_id);

-- Prevent duplicate bids from the same advocate on the same RFP.
create unique index if not exists one_bid_per_advocate_rfp on public.bids(rfp_id, advocate_id);

-- Keep test pledges inside the campaign funding phase.
create or replace function public.record_test_pledge(p_campaign_id uuid, p_user_id uuid, p_amount_cents bigint, p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare new_raised bigint; goal bigint; current_status public.campaign_status;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Authenticated user mismatch'; end if;
  if p_amount_cents < 99 then raise exception 'Minimum test pledge is $0.99'; end if;
  select raised_cents, goal_cents, status into new_raised, goal, current_status from public.campaigns where id=p_campaign_id for update;
  if goal is null then raise exception 'Campaign not found'; end if;
  if current_status not in ('PUBLISHED','FUNDING') then raise exception 'Campaign is not accepting pledges'; end if;
  insert into public.pledges(campaign_id,user_id,amount_cents,provider,provider_reference)
  values(p_campaign_id,p_user_id,p_amount_cents,'mock',p_reference);
  new_raised := new_raised + p_amount_cents;
  update public.campaigns set raised_cents=new_raised,status=case when new_raised >= goal then 'FUNDED' else 'FUNDING' end where id=p_campaign_id;
  insert into public.ledger_entries(campaign_id,entry_type,amount_cents,reference_type)
  values(p_campaign_id,'TEST_PLEDGE',p_amount_cents,'pledge');
  return jsonb_build_object('raised_cents',new_raised,'goal_cents',goal,'status',case when new_raised >= goal then 'FUNDED' else 'FUNDING' end);
end;
$$;
