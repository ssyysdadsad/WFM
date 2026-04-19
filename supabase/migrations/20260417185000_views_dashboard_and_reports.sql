create or replace view public.v_dashboard_counts as
select
  (select count(*) from public.employee) as employees,
  (select count(*) from public.project) as projects,
  (select count(*) from public.schedule) as schedules,
  (select count(*) from public.device) as devices,
  (select count(*) from public.department) as departments,
  (select count(*) from public.scene) as scenes,
  (select count(*) from public.channel) as channels,
  (select count(*) from public.skill) as skills;

create or replace view public.v_task_completion_report as
select
  t.id as task_id,
  t.task_name,
  p.project_name,
  coalesce(t.target_total_hours, 0) as planned_hours,
  coalesce(sum(s.planned_hours), 0) as scheduled_hours,
  case
    when coalesce(t.target_total_hours, 0) > 0
      then round(coalesce(sum(s.planned_hours), 0) / t.target_total_hours, 4)
    else 0
  end as completion_rate
from public.task t
join public.project p on p.id = t.project_id
left join public.schedule s on s.task_id = t.id
group by t.id, t.task_name, p.project_name, t.target_total_hours;

create or replace view public.v_device_usage_report as
select
  d.id as device_id,
  d.device_name,
  count(distinct s.schedule_date) as usage_days,
  coalesce(sum(s.planned_hours), 0) as usage_hours
from public.device d
left join public.schedule s on s.device_id = d.id
group by d.id, d.device_name;
