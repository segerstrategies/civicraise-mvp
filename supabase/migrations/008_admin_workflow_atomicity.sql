-- Make admin workflow changes transactional and auditable.
create or replace function public.admin_advance_campaign(
  p_campaign_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.campaign_status;
  v_allowed text[];
  v_reason text;
  v_error text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  select status into v_current
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found then
    v_reason := 'Campaign not found.';
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'CAMPAIGN_TRANSITION_REJECTED','campaign',p_campaign_id,
      jsonb_build_object('to',p_target_status,'reason',v_reason));
    return jsonb_build_object('ok',false,'message',v_reason);
  end if;

  v_allowed := case v_current::text
    when 'DRAFT' then array['UNDER_REVIEW']::text[]
    when 'UNDER_REVIEW' then array['PUBLISHED']::text[]
    when 'PUBLISHED' then array['FUNDING']::text[]
    when 'FUNDING' then array['FUNDED']::text[]
    when 'FUNDED' then array['RFP_OPEN']::text[]
    when 'RFP_OPEN' then array['BID_REVIEW','RFP_CLOSED']::text[]
    when 'BID_REVIEW' then array['ADVOCATE_SELECTED','RFP_CLOSED']::text[]
    when 'ADVOCATE_SELECTED' then array['CONTRACT_ACTIVE']::text[]
    when 'CONTRACT_ACTIVE' then array['MILESTONE_ACTIVE']::text[]
    when 'MILESTONE_ACTIVE' then array['DELIVERABLE_SUBMITTED','BACKER_REVIEW']::text[]
    when 'DELIVERABLE_SUBMITTED' then array['TECHNICAL_REVIEW']::text[]
    when 'TECHNICAL_REVIEW' then array['BACKER_REVIEW','CURE_REQUIRED']::text[]
    when 'BACKER_REVIEW' then array['RATIFIED','DISPUTED']::text[]
    when 'RATIFIED' then array['DISBURSEMENT_PENDING']::text[]
    when 'DISBURSEMENT_PENDING' then array['DISBURSED']::text[]
    when 'DISBURSED' then array['COMPLETED']::text[]
    when 'CURE_REQUIRED' then array['MILESTONE_ACTIVE','BACKER_REVIEW']::text[]
    when 'DISPUTED' then array['RESOLVED','CURE_REQUIRED']::text[]
    when 'RESOLVED' then array['BACKER_REVIEW']::text[]
    else array[]::text[]
  end;

  if not coalesce(p_target_status = any(v_allowed), false) then
    v_reason := format('Invalid transition from %s to %s.',v_current,p_target_status);
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'CAMPAIGN_TRANSITION_REJECTED','campaign',p_campaign_id,
      jsonb_build_object('from',v_current,'to',p_target_status,'reason',v_reason));
    return jsonb_build_object('ok',false,'message',v_reason);
  end if;

  begin
    update public.campaigns
    set status = p_target_status::public.campaign_status
    where id = p_campaign_id;

    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'CAMPAIGN_STATUS_CHANGED','campaign',p_campaign_id,
      jsonb_build_object('from',v_current,'to',p_target_status));
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'CAMPAIGN_TRANSITION_FAILED','campaign',p_campaign_id,
      jsonb_build_object('from',v_current,'to',p_target_status,'reason',v_error));
    return jsonb_build_object('ok',false,'message','Campaign transition failed; no change was saved.');
  end;

  return jsonb_build_object('ok',true,'message',format('Campaign advanced to %s.',p_target_status));
end;
$$;

create or replace function public.admin_select_bid(p_bid_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rfp_id uuid;
  v_advocate_id uuid;
  v_campaign_id uuid;
  v_bid_status text;
  v_rfp_status text;
  v_campaign_status public.campaign_status;
  v_verification_status text;
  v_contract_id uuid;
  v_reason text;
  v_error text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  select b.rfp_id,b.advocate_id,b.status,r.campaign_id,r.status
  into v_rfp_id,v_advocate_id,v_bid_status,v_campaign_id,v_rfp_status
  from public.bids b
  join public.rfps r on r.id = b.rfp_id
  where b.id = p_bid_id;

  if not found then
    v_reason := 'Bid not found.';
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'BID_SELECTION_REJECTED','bid',p_bid_id,
      jsonb_build_object('reason',v_reason));
    return jsonb_build_object('ok',false,'message',v_reason);
  end if;

  select status into v_campaign_status
  from public.campaigns where id = v_campaign_id for update;

  select status into v_rfp_status
  from public.rfps where id = v_rfp_id for update;

  select status into v_bid_status
  from public.bids where id = p_bid_id for update;

  if v_campaign_status is distinct from 'BID_REVIEW'::public.campaign_status then
    v_reason := format('Bids can only be awarded during BID_REVIEW (campaign is %s).',v_campaign_status);
  elsif v_rfp_status is distinct from 'OPEN' then
    v_reason := 'The RFP is not open for award.';
  elsif v_bid_status is distinct from 'SUBMITTED' then
    v_reason := 'Only submitted bids can be selected.';
  else
    select verification_status into v_verification_status
    from public.advocate_profiles where id = v_advocate_id for update;

    if v_verification_status is distinct from 'verified' then
      v_reason := 'Advocate must be verified before award.';
    end if;
  end if;

  if v_reason is not null then
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'BID_SELECTION_REJECTED','bid',p_bid_id,
      jsonb_build_object('campaign_id',v_campaign_id,'rfp_id',v_rfp_id,'reason',v_reason));
    return jsonb_build_object('ok',false,'message',v_reason);
  end if;

  begin
    update public.bids set status = 'SELECTED' where id = p_bid_id;
    update public.bids set status = 'REJECTED'
    where rfp_id = v_rfp_id and id <> p_bid_id;

    insert into public.contracts(rfp_id,advocate_id,status)
    values(v_rfp_id,v_advocate_id,'ACTIVE')
    returning id into v_contract_id;

    update public.rfps set status = 'AWARDED' where id = v_rfp_id;

    update public.campaigns set status = 'ADVOCATE_SELECTED' where id = v_campaign_id;
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'CAMPAIGN_STATUS_CHANGED','campaign',v_campaign_id,
      jsonb_build_object('from','BID_REVIEW','to','ADVOCATE_SELECTED','bid_id',p_bid_id));

    update public.campaigns set status = 'CONTRACT_ACTIVE' where id = v_campaign_id;
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'CAMPAIGN_STATUS_CHANGED','campaign',v_campaign_id,
      jsonb_build_object('from','ADVOCATE_SELECTED','to','CONTRACT_ACTIVE','bid_id',p_bid_id));

    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'BID_SELECTED','bid',p_bid_id,
      jsonb_build_object('contract_id',v_contract_id,'campaign_id',v_campaign_id,'rfp_id',v_rfp_id));
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload)
    values(auth.uid(),'BID_SELECTION_FAILED','bid',p_bid_id,
      jsonb_build_object('campaign_id',v_campaign_id,'rfp_id',v_rfp_id,'reason',v_error));
    return jsonb_build_object('ok',false,'message','Bid award failed; the transaction was rolled back.');
  end;

  return jsonb_build_object(
    'ok',true,
    'message','Bid selected and test contract created.',
    'contract_id',v_contract_id
  );
end;
$$;

revoke all on function public.admin_advance_campaign(uuid,text) from public, anon;
revoke all on function public.admin_select_bid(uuid) from public, anon;
grant execute on function public.admin_advance_campaign(uuid,text) to authenticated;
grant execute on function public.admin_select_bid(uuid) to authenticated;
