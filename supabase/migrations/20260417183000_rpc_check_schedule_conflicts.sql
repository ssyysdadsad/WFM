create or replace function public.check_schedule_conflicts(
  schedule_version_id uuid,
  changes jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  duplicated_employee_count integer;
begin
  select count(*)
    into duplicated_employee_count
  from (
    select
      change_item ->> 'employeeId' as employee_id,
      change_item ->> 'scheduleDate' as schedule_date
    from jsonb_array_elements(changes) as change_item
    group by 1, 2
    having count(*) > 1
  ) duplicated_pairs;

  if duplicated_employee_count > 0 then
    return jsonb_build_object(
      'success', false,
      'message', '检测到同一员工同日重复排班',
      'conflicts', jsonb_build_array(
        jsonb_build_object('reason', '同一员工同日重复排班')
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'message', null,
    'conflicts', '[]'::jsonb
  );
end;
$$;

grant execute on function public.check_schedule_conflicts(uuid, jsonb) to anon, authenticated, service_role;
