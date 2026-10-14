alter table public.campaigns
  add column if not exists issue_areas text[] not null default '{}';

create index if not exists campaigns_issue_areas_gin_idx
  on public.campaigns using gin (issue_areas);

update public.campaigns
set issue_areas = array['Agriculture & food systems']
where slug = 'hr-5602' and cardinality(issue_areas) = 0;
