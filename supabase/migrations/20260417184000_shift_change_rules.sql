create index if not exists idx_shift_change_applicant_status_created
  on public.shift_change_request (applicant_employee_id, approval_status_dict_item_id, created_at desc);

create index if not exists idx_shift_change_target_status
  on public.shift_change_request (target_employee_id, approval_status_dict_item_id);

create index if not exists idx_shift_change_original_schedule
  on public.shift_change_request (original_schedule_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_shift_change_request_type'
  ) then
    alter table public.shift_change_request
      add constraint ck_shift_change_request_type
      check (request_type in ('swap', 'direct_change'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_shift_change_swap_fields'
  ) then
    alter table public.shift_change_request
      add constraint ck_shift_change_swap_fields
      check (
        request_type <> 'swap'
        or (target_employee_id is not null and target_schedule_id is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_shift_change_direct_change_fields'
  ) then
    alter table public.shift_change_request
      add constraint ck_shift_change_direct_change_fields
      check (
        request_type <> 'direct_change'
        or (
          target_date is not null
          and target_shift_type_dict_item_id is not null
          and target_schedule_code_dict_item_id is not null
        )
      );
  end if;
end $$;
