-- Allow a bounded custom demo pledge while preserving authenticated ownership,
-- campaign-state checks, and atomic ledger updates.
create or replace function public.record_test_pledge(
  p_campaign_id uuid,
  p_user_id uuid,
  p_amount_cents bigint,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_raised bigint;
  v_goal bigint;
  v_status public.campaign_status;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception using errcode = '42501', message = 'Authenticated user mismatch.';
  end if;

  if p_amount_cents is null or p_amount_cents < 99 or p_amount_cents > 1000000 then
    raise exception using errcode = '22023', message = 'Choose a test pledge between $0.99 and $10,000.';
  end if;

  if p_reference is null or length(p_reference) > 100 then
    raise exception using errcode = '22023', message = 'A valid test pledge reference is required.';
  end if;

  select raised_cents, goal_cents, status
    into v_raised, v_goal, v_status
  from public.campaigns
  where id = p_campaign_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Campaign not found.';
  end if;

  if v_status not in ('PUBLISHED', 'FUNDING') then
    raise exception using errcode = '23514', message = 'Campaign is not accepting pledges.';
  end if;

  v_raised := v_raised + p_amount_cents;

  insert into public.pledges(campaign_id, user_id, amount_cents, provider, provider_reference)
  values (p_campaign_id, p_user_id, p_amount_cents, 'mock', p_reference);

  update public.campaigns
  set raised_cents = v_raised,
      status = case when v_raised >= v_goal then 'FUNDED'::public.campaign_status else 'FUNDING'::public.campaign_status end
  where id = p_campaign_id;

  insert into public.ledger_entries(campaign_id, entry_type, amount_cents, reference_type)
  values (p_campaign_id, 'TEST_PLEDGE', p_amount_cents, 'pledge');

  return jsonb_build_object(
    'raised_cents', v_raised,
    'goal_cents', v_goal,
    'status', case when v_raised >= v_goal then 'FUNDED' else 'FUNDING' end
  );
end;
$$;

revoke all on function public.record_test_pledge(uuid, uuid, bigint, text) from public, anon;
grant execute on function public.record_test_pledge(uuid, uuid, bigint, text) to authenticated;
