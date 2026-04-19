create unique index if not exists uq_schedule_version_project_month_version
  on public.schedule_version (project_id, schedule_month, version_no);

create index if not exists idx_schedule_version_project_month_status
  on public.schedule_version (project_id, schedule_month, publish_status_dict_item_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_version_generation_type'
  ) then
    alter table public.schedule_version
      add constraint ck_schedule_version_generation_type
      check (generation_type in ('manual', 'template', 'excel'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_version_month_start'
  ) then
    alter table public.schedule_version
      add constraint ck_schedule_version_month_start
      check (schedule_month = date_trunc('month', schedule_month)::date);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_version_no_positive'
  ) then
    alter table public.schedule_version
      add constraint ck_schedule_version_no_positive
      check (version_no >= 1);
  end if;
end $$;
