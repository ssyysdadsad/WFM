insert into storage.buckets (id, name, public)
values ('schedule-files', 'schedule-files', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'schedule_files_authenticated_read'
  ) then
    create policy schedule_files_authenticated_read
      on storage.objects
      for select
      to authenticated
      using (bucket_id = 'schedule-files');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'schedule_files_authenticated_write'
  ) then
    create policy schedule_files_authenticated_write
      on storage.objects
      for insert
      to authenticated
      with check (bucket_id = 'schedule-files');
  end if;
end $$;
