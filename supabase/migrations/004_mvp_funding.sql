-- Keep campaign funding totals synchronized for test pledges.
create or replace function public.record_test_pledge(p_campaign_id uuid, p_user_id uuid, p_amount_cents bigint, p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare new_raised bigint; goal bigint; new_status text;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then raise exception 'Authenticated user mismatch'; end if;
  insert into public.pledges(campaign_id,user_id,amount_cents,provider,provider_reference)
  values(p_campaign_id,p_user_id,p_amount_cents,'mock',p_reference);
  update public.campaigns set raised_cents=raised_cents+p_amount_cents where id=p_campaign_id returning raised_cents,goal_cents into new_raised,goal;
  new_status := case when new_raised >= goal then 'FUNDED' else 'FUNDING' end;
  update public.campaigns set status=new_status where id=p_campaign_id;
  insert into public.ledger_entries(campaign_id,entry_type,amount_cents,reference_type)
  values(p_campaign_id,'TEST_PLEDGE',p_amount_cents,'pledge');
  return jsonb_build_object('raised_cents',new_raised,'goal_cents',goal,'status',new_status);
end;
$$;
