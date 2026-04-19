create or replace function public.get_work_hours_summary()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', e.full_name,
        'avgDailyHours7d', m.avg_daily_hours_7d,
        'avgDailyHours30d', m.avg_daily_hours_30d,
        'totalHours', m.total_hours
      )
      order by m.total_hours desc
    ),
    '[]'::jsonb
  )
  from public.employee_work_metric m
  join public.employee e on e.id = m.employee_id;
$$;

create or replace function public.get_employee_profile_report()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'employeeId', m.employee_id,
        'employeeNo', e.employee_no,
        'fullName', e.full_name,
        'avgDailyHours7d', m.avg_daily_hours_7d,
        'avgDailyHours30d', m.avg_daily_hours_30d,
        'avgShiftHours30d', m.avg_shift_hours_30d,
        'avgWeeklyHours30d', m.avg_weekly_hours_30d,
        'totalHours', m.total_hours,
        'calculatedAt', m.calculated_at
      )
      order by m.total_hours desc
    ),
    '[]'::jsonb
  )
  from public.employee_work_metric m
  join public.employee e on e.id = m.employee_id;
$$;

create or replace function public.get_task_completion_report()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'taskId', task_id,
        'taskName', task_name,
        'projectName', project_name,
        'plannedHours', planned_hours,
        'scheduledHours', scheduled_hours,
        'completionRate', completion_rate
      )
      order by project_name, task_name
    ),
    '[]'::jsonb
  )
  from public.v_task_completion_report;
$$;

create or replace function public.get_device_usage_report()
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'deviceId', device_id,
        'deviceName', device_name,
        'usageDays', usage_days,
        'usageHours', usage_hours
      )
      order by usage_hours desc, device_name
    ),
    '[]'::jsonb
  )
  from public.v_device_usage_report;
$$;

grant execute on function public.get_work_hours_summary() to anon, authenticated, service_role;
grant execute on function public.get_employee_profile_report() to anon, authenticated, service_role;
grant execute on function public.get_task_completion_report() to anon, authenticated, service_role;
grant execute on function public.get_device_usage_report() to anon, authenticated, service_role;
