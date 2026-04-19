insert into public.permission (
  permission_code,
  permission_name,
  platform_code,
  module_code,
  action_code,
  description,
  sort_order,
  is_enabled
)
values
  ('web.dashboard.read', '仪表盘访问', 'web', 'dashboard', 'read', '仪表盘访问权限', 10, true),
  ('web.dict.read', '字典管理访问', 'web', 'dict', 'read', '字典管理访问权限', 20, true),
  ('web.scene.read', '场景管理访问', 'web', 'scene', 'read', '场景管理访问权限', 30, true),
  ('web.device.read', '设备管理访问', 'web', 'device', 'read', '设备管理访问权限', 40, true),
  ('web.skill.read', '技能管理访问', 'web', 'skill', 'read', '技能管理访问权限', 50, true),
  ('web.labor_rule.read', '用工规则访问', 'web', 'labor_rule', 'read', '用工规则访问权限', 60, true),
  ('web.project.read', '项目管理访问', 'web', 'project', 'read', '项目管理访问权限', 70, true),
  ('web.task.read', '任务管理访问', 'web', 'task', 'read', '任务管理访问权限', 80, true),
  ('web.department.read', '部门管理访问', 'web', 'department', 'read', '部门管理访问权限', 90, true),
  ('web.channel.read', '渠道管理访问', 'web', 'channel', 'read', '渠道管理访问权限', 100, true),
  ('web.employee.read', '员工管理访问', 'web', 'employee', 'read', '员工管理访问权限', 110, true),
  ('web.schedule_version.read', '排班版本访问', 'web', 'schedule_version', 'read', '排班版本访问权限', 120, true),
  ('web.schedule.read', '排班矩阵访问', 'web', 'schedule', 'read', '排班矩阵访问权限', 130, true),
  ('web.shift_change.read', '调班审批访问', 'web', 'shift_change', 'read', '调班审批访问权限', 140, true),
  ('web.report.read', '统计报表访问', 'web', 'report', 'read', '统计报表访问权限', 150, true),
  ('web.announcement.read', '公告管理访问', 'web', 'announcement', 'read', '公告管理访问权限', 160, true)
on conflict (permission_code) do update
set
  permission_name = excluded.permission_name,
  platform_code = excluded.platform_code,
  module_code = excluded.module_code,
  action_code = excluded.action_code,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_enabled = excluded.is_enabled,
  updated_at = now();
