-- Integration coverage for the admin workflow RPCs added in migration 008.
-- All fixtures and audit rows are rolled back when this file completes.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.invalid'),
  ('00000000-0000-0000-0000-000000000002', 'citizen@example.invalid'),
  ('00000000-0000-0000-0000-000000000003', 'advocate-one@example.invalid'),
  ('00000000-0000-0000-0000-000000000004', 'advocate-two@example.invalid');

update public.profiles set role = 'admin'
where id = '00000000-0000-0000-0000-000000000001';
update public.profiles set role = 'advocate'
where id in ('00000000-0000-0000-0000-000000000003',
             '00000000-0000-0000-0000-000000000004');

insert into public.campaigns (id, slug, title, status, goal_cents) values
  ('00000000-0000-0000-0000-000000000010', 'test-funding-transition', 'Funding transition test', 'FUNDING', 10000),
  ('00000000-0000-0000-0000-000000000011', 'test-contract-transition', 'Contract transition test', 'CONTRACT_ACTIVE', 10000),
  ('00000000-0000-0000-0000-000000000012', 'test-bid-award', 'Successful award test', 'BID_REVIEW', 10000),
  ('00000000-0000-0000-0000-000000000013', 'test-bid-rollback', 'Rolled back award test', 'BID_REVIEW', 10000);

insert into public.rfps (id, slug, campaign_id, title, budget_cents, status) values
  ('00000000-0000-0000-0000-000000000020', 'test-award-rfp', '00000000-0000-0000-0000-000000000012', 'Successful award RFP', 10000, 'OPEN'),
  ('00000000-0000-0000-0000-000000000021', 'test-rollback-rfp', '00000000-0000-0000-0000-000000000013', 'Rollback award RFP', 10000, 'OPEN');

insert into public.advocate_profiles (id, firm_name, verification_status) values
  ('00000000-0000-0000-0000-000000000003', 'Test Advocate One', 'verified'),
  ('00000000-0000-0000-0000-000000000004', 'Test Advocate Two', 'verified');

insert into public.campaigns (id, slug, title, status, goal_cents) values
  ('00000000-0000-0000-0000-000000000015', 'test-backer-deliverable', 'Backer review policy test', 'BACKER_REVIEW', 10000);

insert into public.rfps (id, slug, campaign_id, title, budget_cents, status)
values ('00000000-0000-0000-0000-000000000022', 'test-backer-deliverable-rfp',
        '00000000-0000-0000-0000-000000000015', 'Backer review RFP', 10000, 'AWARDED');

insert into public.contracts (id, rfp_id, advocate_id, status)
values ('00000000-0000-0000-0000-000000000041',
        '00000000-0000-0000-0000-000000000022',
        '00000000-0000-0000-0000-000000000003',
        'ACTIVE');

insert into public.campaign_milestones (id, campaign_id, name, amount_cents, sequence)
values ('00000000-0000-0000-0000-000000000050',
        '00000000-0000-0000-0000-000000000015',
        'Backer review milestone', 10000, 1);

insert into public.deliverables (id, contract_id, milestone_id, description, status)
values ('00000000-0000-0000-0000-000000000060',
        '00000000-0000-0000-0000-000000000041',
        '00000000-0000-0000-0000-000000000050',
        'Submitted work for the backer review policy test.', 'SUBMITTED');

insert into public.pledges (campaign_id, user_id, amount_cents)
values ('00000000-0000-0000-0000-000000000015',
        '00000000-0000-0000-0000-000000000002', 500);

insert into public.bids (id, rfp_id, advocate_id, amount_cents, proposal, status) values
  ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000003', 5000, 'Winning test bid', 'SUBMITTED'),
  ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000004', 6000, 'Other test bid', 'SUBMITTED'),
  ('00000000-0000-0000-0000-000000000032', '00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000003', 5000, 'Rollback test bid', 'SUBMITTED');

-- Campaign backers can read submitted deliverables through RLS.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $
declare visible_count integer;
begin
  select count(*) into visible_count
  from public.deliverables
  where id = '00000000-0000-0000-0000-000000000060';
  if visible_count <> 1 then
    raise exception 'Campaign backer should be able to read the submitted deliverable';
  end if;
end
$;
reset role;

-- A non-backer who is not a participant cannot read the same deliverable.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', true);
set local role authenticated;
do $
declare visible_count integer;
begin
  select count(*) into visible_count
  from public.deliverables
  where id = '00000000-0000-0000-0000-000000000060';
  if visible_count <> 0 then
    raise exception 'Non-backer should not be able to read the deliverable';
  end if;
end
$;
reset role;

-- Force a contract insert failure in the second award scenario. The RPC must
-- roll back every preceding status update while preserving this existing row.
insert into public.contracts (id, rfp_id, advocate_id, status)
values ('00000000-0000-0000-0000-000000000040',
        '00000000-0000-0000-0000-000000000021',
        '00000000-0000-0000-0000-000000000004',
        'DRAFT');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;

do $$
declare
  result jsonb;
begin
  result := public.admin_advance_campaign(
    '00000000-0000-0000-0000-000000000010',
    'BID_REVIEW'
  );
  if result->>'ok' <> 'false'
    or result->>'message' not like 'Invalid transition from FUNDING to BID_REVIEW.%' then
    raise exception 'Expected FUNDING -> BID_REVIEW to be rejected, got %', result;
  end if;
end
$$;

do $$
declare
  result jsonb;
begin
  result := public.admin_advance_campaign(
    '00000000-0000-0000-0000-000000000011',
    'RFP_OPEN'
  );
  if result->>'ok' <> 'false'
    or result->>'message' not like 'Invalid transition from CONTRACT_ACTIVE to RFP_OPEN.%' then
    raise exception 'Expected CONTRACT_ACTIVE -> RFP_OPEN to be rejected, got %', result;
  end if;
end
$$;

reset role;

do $$
begin
  if (select status::text from public.campaigns where id = '00000000-0000-0000-0000-000000000010') <> 'FUNDING' then
    raise exception 'Rejected transition changed the FUNDING campaign';
  end if;
  if (select status::text from public.campaigns where id = '00000000-0000-0000-0000-000000000011') <> 'CONTRACT_ACTIVE' then
    raise exception 'Rejected transition changed the CONTRACT_ACTIVE campaign';
  end if;
  if (select count(*) from public.audit_events
      where event_type = 'CAMPAIGN_TRANSITION_REJECTED'
        and entity_id in ('00000000-0000-0000-0000-000000000010',
                          '00000000-0000-0000-0000-000000000011')) <> 2 then
    raise exception 'Rejected transitions were not both recorded in the audit log';
  end if;
end
$$;

-- A non-admin authenticated user cannot invoke the admin workflow.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$
begin
  begin
    perform public.admin_advance_campaign(
      '00000000-0000-0000-0000-000000000010',
      'FUNDED'
    );
    raise exception 'Expected a non-admin call to be denied';
  exception
    when sqlstate '42501' then null;
  end;
end
$$;
reset role;

-- A valid transition remains available after invalid attempts.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
declare
  result jsonb;
begin
  result := public.admin_advance_campaign(
    '00000000-0000-0000-0000-000000000010',
    'FUNDED'
  );
  if result->>'ok' <> 'true' then
    raise exception 'Expected FUNDING -> FUNDED to succeed, got %', result;
  end if;
end
$$;
reset role;

do $$
begin
  if (select status::text from public.campaigns where id = '00000000-0000-0000-0000-000000000010') <> 'FUNDED' then
    raise exception 'Valid transition did not update the campaign';
  end if;
  if not exists (select 1 from public.audit_events
      where event_type = 'CAMPAIGN_STATUS_CHANGED'
        and entity_id = '00000000-0000-0000-0000-000000000010') then
    raise exception 'Successful transition was not recorded in the audit log';
  end if;
end
$$;

-- Successful award: selected bid, competing bid, contract, RFP, campaign, and
-- their audit events must agree.
set local role authenticated;
do $$
declare
  result jsonb;
begin
  result := public.admin_select_bid('00000000-0000-0000-0000-000000000030');
  if result->>'ok' <> 'true' then
    raise exception 'Expected bid award to succeed, got %', result;
  end if;
end
$$;
reset role;

do $$
begin
  if (select status from public.bids where id = '00000000-0000-0000-0000-000000000030') <> 'SELECTED' then
    raise exception 'Winning bid was not selected';
  end if;
  if (select status from public.bids where id = '00000000-0000-0000-0000-000000000031') <> 'REJECTED' then
    raise exception 'Competing bid was not rejected';
  end if;
  if (select status from public.rfps where id = '00000000-0000-0000-0000-000000000020') <> 'AWARDED' then
    raise exception 'RFP was not marked awarded';
  end if;
  if (select status::text from public.campaigns where id = '00000000-0000-0000-0000-000000000012') <> 'CONTRACT_ACTIVE' then
    raise exception 'Campaign did not reach CONTRACT_ACTIVE';
  end if;
  if (select count(*) from public.contracts where rfp_id = '00000000-0000-0000-0000-000000000020' and status = 'ACTIVE') <> 1 then
    raise exception 'Expected exactly one active contract for the awarded RFP';
  end if;
  if (select count(*) from public.audit_events
      where (event_type = 'BID_SELECTED' and entity_id = '00000000-0000-0000-0000-000000000030')
         or (event_type = 'CAMPAIGN_STATUS_CHANGED' and entity_id = '00000000-0000-0000-0000-000000000012')) <> 3 then
    raise exception 'Successful bid award audit events are incomplete';
  end if;
end
$$;

-- Failed award: a duplicate contract forces an error inside the atomic block.
-- The RPC should preserve all pre-call statuses and append a failure event.
set local role authenticated;
do $$
declare
  result jsonb;
begin
  result := public.admin_select_bid('00000000-0000-0000-0000-000000000032');
  if result->>'ok' <> 'false'
    or result->>'message' <> 'Bid award failed; the transaction was rolled back.' then
    raise exception 'Expected failed bid award to roll back, got %', result;
  end if;
end
$$;
reset role;

do $$
begin
  if (select status from public.bids where id = '00000000-0000-0000-0000-000000000032') <> 'SUBMITTED' then
    raise exception 'Failed award changed the submitted bid';
  end if;
  if (select status from public.rfps where id = '00000000-0000-0000-0000-000000000021') <> 'OPEN' then
    raise exception 'Failed award changed the RFP status';
  end if;
  if (select status::text from public.campaigns where id = '00000000-0000-0000-0000-000000000013') <> 'BID_REVIEW' then
    raise exception 'Failed award changed the campaign status';
  end if;
  if (select status from public.contracts where id = '00000000-0000-0000-0000-000000000040') <> 'DRAFT' then
    raise exception 'Failed award changed the pre-existing contract';
  end if;
  if not exists (select 1 from public.audit_events
      where event_type = 'BID_SELECTION_FAILED'
        and entity_id = '00000000-0000-0000-0000-000000000032') then
    raise exception 'Failed award was not recorded in the audit log';
  end if;
end
$$;

rollback;
