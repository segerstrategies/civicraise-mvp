-- Let authenticated campaign backers review submitted deliverables under RLS.
create or replace function public.can_read_backer_deliverable(p_deliverable_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.deliverables d
    join public.contracts c on c.id = d.contract_id
    join public.rfps r on r.id = c.rfp_id
    join public.pledges p on p.campaign_id = r.campaign_id
    where d.id = p_deliverable_id
      and p.user_id = auth.uid()
  );
$$;

revoke all on function public.can_read_backer_deliverable(uuid) from public, anon;
grant execute on function public.can_read_backer_deliverable(uuid) to authenticated;

drop policy if exists "campaign backers can read deliverables" on public.deliverables;
create policy "campaign backers can read deliverables"
on public.deliverables for select
using (public.can_read_backer_deliverable(id));
