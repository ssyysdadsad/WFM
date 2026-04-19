create unique index if not exists uq_employee_channel_mobile
  on public.employee (mobile_number, channel_id);

create unique index if not exists uq_task_project_code
  on public.task (project_id, task_code)
  where task_code is not null;

create index if not exists idx_employee_department_status
  on public.employee (department_id, employee_status_dict_item_id);

create index if not exists idx_device_scene_status
  on public.device (scene_id, device_status_dict_item_id);

create index if not exists idx_task_project_status
  on public.task (project_id, task_status_dict_item_id);
