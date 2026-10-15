-- Integration coverage for campaign updates, follows, and event RSVP privacy.
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000201', 'engagement-admin@example.invalid'),
  ('00000000-0000-0000-0000-000000000202', 'engagement-citizen@example.invalid');
update public.profiles set role = 'admin'
where id = '00000000-0000-0000-0000-000000000201';
insert into public.campaigns (id, slug, title, status, goal_cents) values
  ('00000000-0000-0000-0000-000000000210', 'engagement-test', 'Engagement test campaign', 'PUBLISHED', 10000);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
set local role authenticated;
insert into public.campaign_updates (campaign_id, author_id, title, body, update_type)
values ('00000000-0000-0000-0000-000000000210', auth.uid(), 'Progress update', 'A test update.', 'PROGRESS');
insert into public.campaign_events (id, campaign_id, created_by, title, starts_at, location)
values ('00000000-0000-0000-0000-000000000211', '00000000-0000-0000-0000-000000000210', auth.uid(), 'Community forum', now() + interval '7 days', 'Online');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000202', true);
set local role authenticated;
insert into public.campaign_follows (campaign_id, user_id)
values ('00000000-0000-0000-0000-000000000210', auth.uid());
insert into public.campaign_update_reads (campaign_id, user_id, last_read_at)
values ('00000000-0000-0000-0000-000000000210', auth.uid(), now());
insert into public.campaign_event_rsvps (event_id, user_id)
values ('00000000-0000-0000-0000-000000000211', auth.uid());

do $$
begin
  if (select count(*) from public.campaign_updates
      where campaign_id = '00000000-0000-0000-0000-000000000210') <> 1 then
    raise exception 'Published campaign update is not visible';
  end if;
  if public.get_campaign_follower_count('00000000-0000-0000-0000-000000000210') <> 1 then
    raise exception 'Campaign follower count is incorrect';
  end if;
  if (select attendee_count from public.get_campaign_event_rsvp_counts(array['00000000-0000-0000-0000-000000000211'::uuid])) <> 1 then
    raise exception 'Event RSVP aggregate is incorrect';
  end if;
  if (select count(*) from public.campaign_event_rsvps) <> 1 then
    raise exception 'Signed-in user cannot read their own RSVP';
  end if;
end
$$;
reset role;

-- A different signed-in user must not be able to see the attendee identity.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000201', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.campaign_event_rsvps) <> 0 then
    raise exception 'RSVP attendee identity leaked to another user';
  end if;
end
$$;
reset role;
rollback;
