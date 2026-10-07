-- CivicRaise MVP workflow permissions and helper views/functions.
create policy "campaigns admin all" on campaigns for all using(public.is_admin()) with check(public.is_admin());
create policy "milestones admin all" on campaign_milestones for all using(public.is_admin()) with check(public.is_admin());
create policy "rfps admin all" on rfps for all using(public.is_admin()) with check(public.is_admin());
create policy "bids admin all" on bids for all using(public.is_admin()) with check(public.is_admin());
create policy "contracts admin all" on contracts for all using(public.is_admin()) with check(public.is_admin());
create policy "deliverables admin all" on deliverables for all using(public.is_admin()) with check(public.is_admin());
create policy "ballots admin all" on ratification_ballots for all using(public.is_admin()) with check(public.is_admin());
create policy "ledger admin all" on ledger_entries for all using(public.is_admin()) with check(public.is_admin());
create policy "audit admin all" on audit_events for all using(public.is_admin()) with check(public.is_admin());
create policy "disputes admin all" on disputes for all using(public.is_admin()) with check(public.is_admin());
create policy "bids advocate update" on bids for update using(auth.uid()=advocate_id) with check(auth.uid()=advocate_id);
create policy "contracts advocate read" on contracts for select using(auth.uid()=advocate_id or public.is_admin());
create policy "deliverables advocate insert" on deliverables for insert with check(exists(select 1 from contracts c where c.id=contract_id and c.advocate_id=auth.uid()));
create policy "deliverables advocate update" on deliverables for update using(exists(select 1 from contracts c where c.id=contract_id and c.advocate_id=auth.uid())) with check(exists(select 1 from contracts c where c.id=contract_id and c.advocate_id=auth.uid()));
create policy "ballots backer read" on ratification_ballots for select using(true);
create policy "ledger participant read" on ledger_entries for select using(true);

create or replace function public.log_audit(p_event text,p_entity_type text,p_entity_id uuid,p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin insert into public.audit_events(actor_id,event_type,entity_type,entity_id,payload) values(auth.uid(),p_event,p_entity_type,p_entity_id,p_payload); end; $$;
