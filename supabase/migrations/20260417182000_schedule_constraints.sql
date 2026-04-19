create unique index if not exists uq_schedule_version_employee_date
  on public.schedule (schedule_version_id, employee_id, schedule_date);

create unique index if not exists uq_schedule_version_device_date_shift
  on public.schedule (schedule_version_id, device_id, schedule_date, shift_type_dict_item_id)
  where device_id is not null;

create index if not exists idx_schedule_version_project_date
  on public.schedule (schedule_version_id, project_id, schedule_date);

create index if not exists idx_schedule_employee_date
  on public.schedule (employee_id, schedule_date);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_planned_hours_non_negative'
  ) then
    alter table public.schedule
      add constraint ck_schedule_planned_hours_non_negative
      check (planned_hours >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_source_type'
  ) then
    alter table public.schedule
      add constraint ck_schedule_source_type
      check (source_type in ('manual', 'template', 'excel', 'copy', 'batch'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_skill_level_snapshot'
  ) then
    alter table public.schedule
      add constraint ck_schedule_skill_level_snapshot
      check (skill_level_snapshot in (1, 2, 3) or skill_level_snapshot is null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_task_device_dependency'
  ) then
    alter table public.schedule
      add constraint ck_schedule_task_device_dependency
      check (task_id is not null or device_id is null);
  end if;
end $$;
