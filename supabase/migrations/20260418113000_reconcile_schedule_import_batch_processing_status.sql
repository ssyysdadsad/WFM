alter table public.schedule_import_batch
  drop constraint if exists ck_schedule_import_batch_processing_status;

update public.schedule_import_batch
set processing_status = case
  when processing_status = 'pending' then 'processing'
  when processing_status = 'success' and coalesce(failed_row_count, 0) > 0 then 'completed_with_errors'
  when processing_status = 'success' then 'completed'
  else processing_status
end
where processing_status in ('pending', 'success');

alter table public.schedule_import_batch
  add constraint ck_schedule_import_batch_processing_status
  check (processing_status in ('processing', 'completed', 'completed_with_errors', 'failed'));
