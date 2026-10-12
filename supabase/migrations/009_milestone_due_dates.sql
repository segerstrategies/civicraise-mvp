-- Store and audit campaign milestone due dates.
alter table public.campaign_milestones
  add column if not exists due_at timestamptz;

create or replace function public.admin_set_milestone_due_at(
  p_milestone_id uuid,
  p_due_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign_id uuid;
  v_milestone_name text;
  v_previous_due_at timestamptz;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Admin access required.';
  end if;

  select campaign_id, name, due_at
  into v_campaign_id, v_milestone_name, v_previous_due_at
  from public.campaign_milestones
  where id = p_milestone_id
  for update;

  if not found then
    insert into public.audit_events(actor_id, event_type, entity_type, entity_id, payload)
    values (
      auth.uid(),
      'MILESTONE_DUE_DATE_REJECTED',
      'campaign_milestone',
      p_milestone_id,
      jsonb_build_object('reason', 'Milestone not found.')
    );
    return jsonb_build_object('ok', false, 'message', 'Milestone not found.');
  end if;

  if v_previous_due_at is not distinct from p_due_at then
    return jsonb_build_object('ok', true, 'message', 'No deadline change was needed.');
  end if;

  update public.campaign_milestones
  set due_at = p_due_at
  where id = p_milestone_id;

  insert into public.audit_events(actor_id, event_type, entity_type, entity_id, payload)
  values (
    auth.uid(),
    'MILESTONE_DUE_DATE_CHANGED',
    'campaign_milestone',
    p_milestone_id,
    jsonb_build_object(
      'campaign_id', v_campaign_id,
      'milestone', v_milestone_name,
      'from', v_previous_due_at,
      'to', p_due_at
    )
  );

  return jsonb_build_object('ok', true, 'message', 'Milestone deadline saved.');
end;
$$;

revoke all on function public.admin_set_milestone_due_at(uuid, timestamptz) from public, anon;
grant execute on function public.admin_set_milestone_due_at(uuid, timestamptz) to authenticated;
