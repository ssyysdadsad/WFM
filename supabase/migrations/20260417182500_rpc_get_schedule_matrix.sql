create or replace function public.get_schedule_matrix(
  project_id uuid,
  schedule_month date,
  schedule_version_id uuid,
  view_mode text default 'month',
  week_index integer default null,
  department_id uuid default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'rows',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'schedule_version_id', s.schedule_version_id,
          'employee_id', s.employee_id,
          'department_id', s.department_id,
          'project_id', s.project_id,
          'task_id', s.task_id,
          'device_id', s.device_id,
          'schedule_date', s.schedule_date,
          'shift_type_dict_item_id', s.shift_type_dict_item_id,
          'schedule_code_dict_item_id', s.schedule_code_dict_item_id,
          'planned_hours', s.planned_hours,
          'source_type', s.source_type,
          'remark', s.remark,
          'computed_conflict', false
        )
        order by s.schedule_date, s.employee_id
      ),
      '[]'::jsonb
    )
  )
  from public.schedule s
  where s.project_id = get_schedule_matrix.project_id
    and s.schedule_version_id = get_schedule_matrix.schedule_version_id
    and date_trunc('month', s.schedule_date)::date = date_trunc('month', get_schedule_matrix.schedule_month)::date
    and (get_schedule_matrix.department_id is null or s.department_id = get_schedule_matrix.department_id);
$$;

grant execute on function public.get_schedule_matrix(uuid, date, uuid, text, integer, uuid) to anon, authenticated, service_role;
