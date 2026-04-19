create or replace function public.get_dashboard_overview()
returns jsonb
language sql
stable
set search_path = public
as $$
  with counts as (
    select * from public.v_dashboard_counts
  ),
  project_status as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', di.item_name,
          'value', grouped.total_count
        )
      ),
      '[]'::jsonb
    ) as rows
    from (
      select project_status_dict_item_id, count(*) as total_count
      from public.project
      group by project_status_dict_item_id
    ) grouped
    left join public.dict_item di on di.id = grouped.project_status_dict_item_id
  ),
  dept_distribution as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', d.department_name,
          'count', grouped.total_count
        )
      ),
      '[]'::jsonb
    ) as rows
    from (
      select department_id, count(*) as total_count
      from public.employee
      group by department_id
    ) grouped
    left join public.department d on d.id = grouped.department_id
  ),
  recent_schedule as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'employeeName', e.full_name,
          'scheduleDate', s.schedule_date,
          'scheduleCodeName', di.item_name,
          'plannedHours', s.planned_hours
        )
        order by s.schedule_date desc
      ),
      '[]'::jsonb
    ) as rows
    from (
      select *
      from public.schedule
      order by schedule_date desc
      limit 10
    ) s
    left join public.employee e on e.id = s.employee_id
    left join public.dict_item di on di.id = s.schedule_code_dict_item_id
  ),
  latest_announcements as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'title', a.title,
          'content', a.content,
          'publishedAt', a.published_at,
          'createdAt', a.created_at
        )
        order by a.published_at desc
      ),
      '[]'::jsonb
    ) as rows
    from (
      select *
      from public.announcement
      order by published_at desc
      limit 5
    ) a
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'employees', counts.employees,
      'projects', counts.projects,
      'schedules', counts.schedules,
      'devices', counts.devices,
      'departments', counts.departments,
      'scenes', counts.scenes,
      'channels', counts.channels,
      'skills', counts.skills
    ),
    'projectStatusData', project_status.rows,
    'deptEmployeeData', dept_distribution.rows,
    'recentSchedules', recent_schedule.rows,
    'announcements', latest_announcements.rows
  )
  from counts, project_status, dept_distribution, recent_schedule, latest_announcements;
$$;

grant execute on function public.get_dashboard_overview() to anon, authenticated, service_role;
