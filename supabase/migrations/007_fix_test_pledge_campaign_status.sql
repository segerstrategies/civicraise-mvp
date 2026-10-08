CREATE OR REPLACE FUNCTION public.record_test_pledge(
  p_campaign_id uuid,
  p_user_id uuid,
  p_amount_cents bigint,
  p_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  new_raised bigint;
  goal bigint;
  current_status public.campaign_status;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authenticated user mismatch';
  end if;

  if p_amount_cents < 99 then
    raise exception 'Minimum test pledge is $0.99';
  end if;

  select raised_cents, goal_cents, status
  into new_raised, goal, current_status
  from public.campaigns
  where id = p_campaign_id
  for update;

  if goal is null then
    raise exception 'Campaign not found';
  end if;

  if current_status not in ('PUBLISHED','FUNDING') then
    raise exception 'Campaign is not accepting pledges';
  end if;

  insert into public.pledges(
    campaign_id,
    user_id,
    amount_cents,
    provider,
    provider_reference
  )
  values(
    p_campaign_id,
    p_user_id,
    p_amount_cents,
    'mock',
    p_reference
  );

  new_raised := new_raised + p_amount_cents;

  update public.campaigns
  set
    raised_cents = new_raised,
    status = (
      case
        when new_raised >= goal then 'FUNDED'
        else 'FUNDING'
      end
    )::public.campaign_status
  where id = p_campaign_id;

  insert into public.ledger_entries(
    campaign_id,
    entry_type,
    amount_cents,
    reference_type
  )
  values(
    p_campaign_id,
    'TEST_PLEDGE',
    p_amount_cents,
    'pledge'
  );

  return jsonb_build_object(
    'raised_cents', new_raised,
    'goal_cents', goal,
    'status',
    case
      when new_raised >= goal then 'FUNDED'
      else 'FUNDING'
    end
  );
end;
$function$;
