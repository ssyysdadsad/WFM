import { supabase } from '@/app/lib/supabase/client';
import { toAppError } from '@/app/lib/supabase/errors';
import type {
  DashboardOverview,
  DeviceUsageReportRow,
  EmployeeProfileReportRow,
  TaskCompletionReportRow,
  WorkHoursSummaryRow,
} from '@/app/types/report';

function isMissingRpcError(error: any) {
  return error?.code === 'PGRST202' || /Could not find the function|function .* does not exist/i.test(error?.message || '');
}

async function loadDictNameMap() {
  const { data, error } = await supabase.from('dict_item').select('id, item_name');
  if (error) {
    throw toAppError(error, '加载字典失败');
  }
  return new Map((data || []).map((item: any) => [item.id, item.item_name]));
}

async function loadEmployeeNameMap() {
  const { data, error } = await supabase.from('employee').select('id, full_name, employee_no');
  if (error) {
    throw toAppError(error, '加载员工失败');
  }
  return new Map((data || []).map((item: any) => [item.id, item]));
}

export async function getDashboardOverview() {
  const rpcRes = await supabase.rpc('get_dashboard_overview');
  if (!rpcRes.error) {
    return rpcRes.data as DashboardOverview;
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '加载仪表盘失败');
  }

  const tables = ['employee', 'project', 'schedule', 'device', 'department', 'scene', 'channel', 'skill'] as const;
  const [dictMap, employeeNameMap, counts, projectRows, employeeRows, metricRows, scheduleRows, announcementRows] =
    await Promise.all([
      loadDictNameMap(),
      loadEmployeeNameMap(),
      Promise.all(
        tables.map(async (tableName) => {
          const { count, error } = await supabase.from(tableName).select('id', { count: 'exact', head: true });
          if (error) {
            throw error;
          }
          return count || 0;
        }),
      ),
      supabase.from('project').select('project_status_dict_item_id'),
      supabase.from('employee').select('department_id'),
      supabase.from('employee_work_metric').select('*').limit(20),
      supabase
        .from('schedule')
        .select('id, employee_id, schedule_date, planned_hours, schedule_code_dict_item_id')
        .order('schedule_date', { ascending: false })
        .limit(10),
      supabase
        .from('announcement')
        .select('*')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(5),
    ]);

  if (projectRows.error || employeeRows.error || metricRows.error || scheduleRows.error || announcementRows.error) {
    throw toAppError(
      projectRows.error || employeeRows.error || metricRows.error || scheduleRows.error || announcementRows.error,
      '加载仪表盘失败',
    );
  }

  const { data: departmentRows, error: departmentError } = await supabase.from('department').select('id, department_name');
  if (departmentError) {
    throw toAppError(departmentError, '加载仪表盘失败');
  }

  const departmentMap = new Map((departmentRows || []).map((row: any) => [row.id, row.department_name]));
  const projectStatusCount: Record<string, number> = {};
  (projectRows.data || []).forEach((row: any) => {
    const name = dictMap.get(row.project_status_dict_item_id) || '未设置';
    projectStatusCount[name] = (projectStatusCount[name] || 0) + 1;
  });

  const departmentEmployeeCount: Record<string, number> = {};
  (employeeRows.data || []).forEach((row: any) => {
    const name = departmentMap.get(row.department_id) || '未分配';
    departmentEmployeeCount[name] = (departmentEmployeeCount[name] || 0) + 1;
  });

  return {
    stats: {
      employees: counts[0],
      projects: counts[1],
      schedules: counts[2],
      devices: counts[3],
      departments: counts[4],
      scenes: counts[5],
      channels: counts[6],
      skills: counts[7],
    },
    projectStatusData: Object.entries(projectStatusCount).map(([name, value]) => ({ name, value })),
    deptEmployeeData: Object.entries(departmentEmployeeCount).map(([name, count]) => ({ name, count })),
    recentSchedules: (scheduleRows.data || []).map((row: any) => ({
      id: row.id,
      employeeName: employeeNameMap.get(row.employee_id)?.full_name || '-',
      scheduleDate: row.schedule_date,
      scheduleCodeName: dictMap.get(row.schedule_code_dict_item_id) || '-',
      plannedHours: row.planned_hours || 0,
    })),
    announcements: (announcementRows.data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      publishedAt: row.published_at,
      createdAt: row.created_at,
    })),
  } satisfies DashboardOverview;
}

export async function getEmployeeProfileReport() {
  const rpcRes = await supabase.rpc('get_employee_profile_report');
  if (!rpcRes.error) {
    return (rpcRes.data || []) as EmployeeProfileReportRow[];
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '加载员工画像报表失败');
  }

  const [metricRes, employeeNameMap] = await Promise.all([
    supabase.from('employee_work_metric').select('*'),
    loadEmployeeNameMap(),
  ]);

  if (metricRes.error) {
    throw toAppError(metricRes.error, '加载员工画像报表失败');
  }

  return (metricRes.data || []).map((row: any) => ({
    employeeId: row.employee_id,
    employeeNo: employeeNameMap.get(row.employee_id)?.employee_no || '-',
    fullName: employeeNameMap.get(row.employee_id)?.full_name || '-',
    avgDailyHours7d: row.avg_daily_hours_7d || 0,
    avgDailyHours30d: row.avg_daily_hours_30d || 0,
    avgShiftHours30d: row.avg_shift_hours_30d || 0,
    avgWeeklyHours30d: row.avg_weekly_hours_30d || 0,
    totalHours: row.total_hours || 0,
    calculatedAt: row.calculated_at,
  }));
}

export async function getWorkHoursSummary() {
  const rpcRes = await supabase.rpc('get_work_hours_summary');
  if (!rpcRes.error) {
    return (rpcRes.data || []) as WorkHoursSummaryRow[];
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '加载工时汇总失败');
  }

  const rows = await getEmployeeProfileReport();
  return rows.slice(0, 20).map((row) => ({
    name: row.fullName,
    avgDailyHours7d: row.avgDailyHours7d,
    avgDailyHours30d: row.avgDailyHours30d,
    totalHours: row.totalHours,
  }));
}

export async function getTaskCompletionReport() {
  const rpcRes = await supabase.rpc('get_task_completion_report');
  if (!rpcRes.error) {
    return (rpcRes.data || []) as TaskCompletionReportRow[];
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '加载任务完成报表失败');
  }

  const [taskRes, projectRes, scheduleRes] = await Promise.all([
    supabase.from('task').select('id, task_name, project_id, target_total_hours'),
    supabase.from('project').select('id, project_name'),
    supabase.from('schedule').select('task_id, planned_hours'),
  ]);

  if (taskRes.error || projectRes.error || scheduleRes.error) {
    throw toAppError(taskRes.error || projectRes.error || scheduleRes.error, '加载任务完成报表失败');
  }

  const projectMap = new Map((projectRes.data || []).map((row: any) => [row.id, row.project_name]));
  const scheduleHourMap = new Map<string, number>();
  (scheduleRes.data || []).forEach((row: any) => {
    if (!row.task_id) return;
    scheduleHourMap.set(row.task_id, (scheduleHourMap.get(row.task_id) || 0) + Number(row.planned_hours || 0));
  });

  return (taskRes.data || []).map((row: any) => {
    const scheduledHours = scheduleHourMap.get(row.id) || 0;
    const plannedHours = Number(row.target_total_hours || 0);
    return {
      taskId: row.id,
      taskName: row.task_name,
      projectName: projectMap.get(row.project_id),
      plannedHours,
      scheduledHours,
      completionRate: plannedHours > 0 ? Number((scheduledHours / plannedHours).toFixed(2)) : 0,
    };
  });
}

export async function getDeviceUsageReport() {
  const rpcRes = await supabase.rpc('get_device_usage_report');
  if (!rpcRes.error) {
    return (rpcRes.data || []) as DeviceUsageReportRow[];
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '加载设备使用报表失败');
  }

  const [deviceRes, scheduleRes] = await Promise.all([
    supabase.from('device').select('id, device_name'),
    supabase.from('schedule').select('device_id, schedule_date, planned_hours'),
  ]);

  if (deviceRes.error || scheduleRes.error) {
    throw toAppError(deviceRes.error || scheduleRes.error, '加载设备使用报表失败');
  }

  const usageMap = new Map<string, { days: Set<string>; hours: number }>();
  (scheduleRes.data || []).forEach((row: any) => {
    if (!row.device_id) return;
    const current = usageMap.get(row.device_id) || { days: new Set<string>(), hours: 0 };
    current.days.add(row.schedule_date);
    current.hours += Number(row.planned_hours || 0);
    usageMap.set(row.device_id, current);
  });

  return (deviceRes.data || []).map((row: any) => {
    const usage = usageMap.get(row.id);
    return {
      deviceId: row.id,
      deviceName: row.device_name,
      usageDays: usage?.days.size || 0,
      usageHours: Number((usage?.hours || 0).toFixed(1)),
    };
  });
}
