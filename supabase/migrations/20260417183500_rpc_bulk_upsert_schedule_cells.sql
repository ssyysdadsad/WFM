create or replace function public.bulk_upsert_schedule_cells(
  p_schedule_version_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  change_item jsonb;
begin
  for change_item in select * from jsonb_array_elements(p_changes)
  loop
    insert into public.schedule (
      schedule_version_id,
      employee_id,
      department_id,
      project_id,
      task_id,
      device_id,
      schedule_date,
      shift_type_dict_item_id,
      schedule_code_dict_item_id,
      planned_hours,
      source_type,
      remark
    )
    values (
      p_schedule_version_id,
      (change_item ->> 'employeeId')::uuid,
      nullif(change_item ->> 'departmentId', '')::uuid,
      (change_item ->> 'projectId')::uuid,
      nullif(change_item ->> 'taskId', '')::uuid,
      nullif(change_item ->> 'deviceId', '')::uuid,
      (change_item ->> 'scheduleDate')::date,
      nullif(change_item ->> 'shiftTypeDictItemId', '')::uuid,
      (change_item ->> 'scheduleCodeDictItemId')::uuid,
      nullif(change_item ->> 'plannedHours', '')::numeric,
      coalesce(change_item ->> 'sourceType', 'manual'),
      nullif(change_item ->> 'remark', '')
    )
    on conflict (schedule_version_id, employee_id, schedule_date)
    do update set
      department_id = excluded.department_id,
      project_id = excluded.project_id,
      task_id = excluded.task_id,
      device_id = excluded.device_id,
      shift_type_dict_item_id = excluded.shift_type_dict_item_id,
      schedule_code_dict_item_id = excluded.schedule_code_dict_item_id,
      planned_hours = excluded.planned_hours,
      source_type = excluded.source_type,
      remark = excluded.remark,
      updated_at = now();
  end loop;

  return jsonb_build_object(
    'success', true,
    'message', 'bulk upsert finished'
  );
end;
$$;

grant execute on function public.bulk_upsert_schedule_cells(uuid, jsonb) to anon, authenticated, service_role;
