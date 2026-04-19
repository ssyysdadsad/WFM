create index if not exists idx_schedule_import_batch_project_month_created
  on public.schedule_import_batch (project_id, schedule_month, created_at desc);

create index if not exists idx_schedule_import_batch_status_created
  on public.schedule_import_batch (processing_status, created_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_import_batch_import_mode'
  ) then
    alter table public.schedule_import_batch
      add constraint ck_schedule_import_batch_import_mode
      check (import_mode in ('cover_draft', 'new_version'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_schedule_import_batch_processing_status'
  ) then
    alter table public.schedule_import_batch
      add constraint ck_schedule_import_batch_processing_status
      check (processing_status in ('processing', 'completed', 'completed_with_errors', 'failed'));
  end if;
end $$;
