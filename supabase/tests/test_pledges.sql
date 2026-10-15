-- Integration tests for test pledge validation and funding updates.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000101', 'pledge-citizen@example.invalid');

insert into public.campaigns (id, slug, title, status, goal_cents) values
  ('00000000-0000-0000-0000-000000000110', 'pledge-open-test', 'Open pledge test', 'PUBLISHED', 10000),
  ('00000000-0000-0000-0000-000000000111', 'pledge-closed-test', 'Closed pledge test', 'CONTRACT_ACTIVE', 10000);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000101', true);
set local role authenticated;

do $$
declare
  result jsonb;
begin
  result := public.record_test_pledge(
    '00000000-0000-0000-0000-000000000110',
    '00000000-0000-0000-0000-000000000101',
    500,
    'TEST-PLEDGE-SUCCESS'
  );

  if (result->>'raised_cents')::bigint <> 500
    or result->>'status' <> 'FUNDING' then
    raise exception 'Valid $5 test pledge returned unexpected result: %', result;
  end if;
end
$$;

do $$
begin
  begin
    perform public.record_test_pledge(
      '00000000-0000-0000-0000-000000000110',
      '00000000-0000-0000-0000-000000000101',
      50,
      'TEST-PLEDGE-BELOW-MINIMUM'
    );
    raise exception 'TEST_EXPECTED_REJECTION';
  exception
    when others then
      if sqlerrm = 'TEST_EXPECTED_REJECTION' then
        raise exception 'Below-minimum test pledge amount was accepted';
      end if;
      if sqlerrm not like 'Choose a test pledge between $0.99 and $10,000.%' then
        raise;
      end if;
  end;
end
$$;

do $$
begin
  begin
    perform public.record_test_pledge(
      '00000000-0000-0000-0000-000000000111',
      '00000000-0000-0000-0000-000000000101',
      500,
      'TEST-PLEDGE-CLOSED-CAMPAIGN'
    );
    raise exception 'TEST_EXPECTED_REJECTION';
  exception
    when others then
      if sqlerrm = 'TEST_EXPECTED_REJECTION' then
        raise exception 'Pledge on a closed campaign was accepted';
      end if;
      if sqlerrm not like 'Campaign is not accepting pledges.%' then
        raise;
      end if;
  end;
end
$$;

reset role;

do $$
begin
  if (select raised_cents from public.campaigns
      where id = '00000000-0000-0000-0000-000000000110') <> 500 then
    raise exception 'Rejected pledge changed the campaign funding total';
  end if;
  if (select count(*) from public.pledges
      where campaign_id = '00000000-0000-0000-0000-000000000110') <> 1 then
    raise exception 'Rejected pledge created an extra pledge row';
  end if;
  if (select count(*) from public.pledges
      where campaign_id = '00000000-0000-0000-0000-000000000111') <> 0 then
    raise exception 'Closed campaign received a pledge';
  end if;
end
$$;

rollback;
