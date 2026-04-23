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

export type ScheduleOverviewData = {
  dailyTrend: Array<{ date: string; label: string; workCount: number; restCount: number; totalHours: number }>;
  shiftDistribution: Array<{ name: string; value: number; color: string }>;
  deptHours: Array<{ name: string; empCount: number; totalHours: number; avgHoursPerShift: number }>;
  topEmployees: Array<{ name: string; department: string; workDays: number; totalHours: number }>;
  summary: { totalSchedules: number; totalWorkDays: number; totalRestDays: number; totalHours: number; avgDailyHours: number };
};

// 动态颜色：从字典项 extra_config.color 获取，无需硬编码
const FALLBACK_COLORS = ['#3B82F6', '#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#06B6D4', '#F97316', '#64748B'];

export async function getScheduleOverviewReport(): Promise<ScheduleOverviewData> {
  const { data: versions } = await supabase.from('schedule_version').select('id').eq('is_active', true).limit(1);
  const activeVersionId = versions?.[0]?.id;
  if (!activeVersionId) {
    return { dailyTrend: [], shiftDistribution: [], deptHours: [], topEmployees: [], summary: { totalSchedules: 0, totalWorkDays: 0, totalRestDays: 0, totalHours: 0, avgDailyHours: 0 } };
  }

  const [scheduleRes, dictRes, deptRes, empRes] = await Promise.all([
    supabase.from('schedule').select('id, employee_id, department_id, schedule_date, planned_hours, schedule_code_dict_item_id').eq('schedule_version_id', activeVersionId),
    supabase.from('dict_item').select('id, item_name, extra_config'),
    supabase.from('department').select('id, department_name'),
    supabase.from('employee').select('id, full_name, department_id'),
  ]);

  if (scheduleRes.error) throw toAppError(scheduleRes.error, '加载排班概览失败');

  const dictMap = new Map((dictRes.data || []).map((d: any) => [d.id, d]));
  const deptMap = new Map((deptRes.data || []).map((d: any) => [d.id, d.department_name]));
  const empMap = new Map((empRes.data || []).map((e: any) => [e.id, e]));
  const rows = scheduleRes.data || [];

  // 1. Daily trend
  const dailyMap = new Map<string, { work: number; rest: number; hours: number }>();
  // 2. Shift distribution (name → { count, color })
  const shiftMap = new Map<string, { count: number; color: string }>();
  // 3. Department hours
  const deptHoursMap = new Map<string, { emps: Set<string>; hours: number; shiftCount: number }>();
  // 4. Employee hours
  const empHoursMap = new Map<string, { workDays: number; hours: number }>();

  let totalWork = 0, totalRest = 0, totalHours = 0;

  rows.forEach((row: any) => {
    const dictItem = dictMap.get(row.schedule_code_dict_item_id);
    const codeName = dictItem?.item_name || '?';
    const category = dictItem?.extra_config?.category || 'work';
    const isWork = category === 'work';
    const hours = Number(row.planned_hours || 0);

    // Daily
    const d = dailyMap.get(row.schedule_date) || { work: 0, rest: 0, hours: 0 };
    if (isWork) { d.work++; totalWork++; } else { d.rest++; totalRest++; }
    d.hours += hours;
    totalHours += hours;
    dailyMap.set(row.schedule_date, d);

    // Shift — 从 extra_config.color 获取颜色
    const existing = shiftMap.get(codeName) || { count: 0, color: dictItem?.extra_config?.color || '' };
    existing.count++;
    shiftMap.set(codeName, existing);

    // Dept
    const deptName = deptMap.get(row.department_id) || '未分配';
    const dh = deptHoursMap.get(deptName) || { emps: new Set<string>(), hours: 0, shiftCount: 0 };
    dh.emps.add(row.employee_id);
    dh.hours += hours;
    if (isWork) dh.shiftCount++;
    deptHoursMap.set(deptName, dh);

    // Employee
    if (isWork) {
      const eh = empHoursMap.get(row.employee_id) || { workDays: 0, hours: 0 };
      eh.workDays++;
      eh.hours += hours;
      empHoursMap.set(row.employee_id, eh);
    }
  });

  const dailyTrend = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, label: date.substring(5), workCount: d.work, restCount: d.rest, totalHours: d.hours }));

  let colorIdx = 0;
  const shiftDistribution = [...shiftMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([name, { count, color }]) => ({
      name,
      value: count,
      color: color || FALLBACK_COLORS[colorIdx++ % FALLBACK_COLORS.length],
    }));

  const deptHours = [...deptHoursMap.entries()]
    .sort(([, a], [, b]) => b.hours - a.hours)
    .map(([name, d]) => ({
      name,
      empCount: d.emps.size,
      totalHours: Number(d.hours.toFixed(1)),
      avgHoursPerShift: d.shiftCount > 0 ? Number((d.hours / d.shiftCount).toFixed(1)) : 0,
    }));

  const topEmployees = [...empHoursMap.entries()]
    .sort(([, a], [, b]) => b.hours - a.hours)
    .slice(0, 15)
    .map(([empId, d]) => {
      const emp = empMap.get(empId);
      return {
        name: emp?.full_name || '-',
        department: deptMap.get(emp?.department_id) || '-',
        workDays: d.workDays,
        totalHours: Number(d.hours.toFixed(1)),
      };
    });

  const uniqueDays = dailyMap.size;

  return {
    dailyTrend,
    shiftDistribution,
    deptHours,
    topEmployees,
    summary: {
      totalSchedules: rows.length,
      totalWorkDays: totalWork,
      totalRestDays: totalRest,
      totalHours: Number(totalHours.toFixed(1)),
      avgDailyHours: uniqueDays > 0 ? Number((totalHours / uniqueDays).toFixed(1)) : 0,
    },
  };
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

// ====== Today Employee Status ======

export type TodayEmployeeRow = {
  employeeId: string;
  employeeName: string;
  employeeNo: string;
  departmentName: string;
  scheduleCodeName: string | null;
  category: string | null; // 'work' | 'rest' | 'leave' | null
  plannedHours: number;
  projectName: string | null;
  projectId: string | null;
};

export async function getTodayEmployeeStatus(projectId?: string): Promise<TodayEmployeeRow[]> {
  const today = new Date().toISOString().split('T')[0];

  // Get all active schedule versions (optionally filter by project)
  let versionQuery = supabase.from('schedule_version').select('id, project_id, project:project_id(project_name)').eq('is_active', true);
  if (projectId) {
    versionQuery = versionQuery.eq('project_id', projectId);
  }
  const { data: versions } = await versionQuery;
  if (!versions?.length) return [];

  const versionIds = versions.map((v: any) => v.id);
  const versionProjectMap = new Map(versions.map((v: any) => [v.id, { projectId: v.project_id, projectName: v.project?.project_name || '-' }]));

  // Get today's schedules across active versions
  const { data: schedules } = await supabase
    .from('schedule')
    .select('employee_id, schedule_version_id, planned_hours, schedule_code_dict_item_id')
    .in('schedule_version_id', versionIds)
    .eq('schedule_date', today);

  // Get employee info
  const { data: employees } = await supabase
    .from('employee')
    .select('id, full_name, employee_no, department:department_id(department_name)');

  // Get dict items for schedule codes
  const { data: dictItems } = await supabase
    .from('dict_item')
    .select('id, item_name, extra_config');

  const empMap = new Map((employees || []).map((e: any) => [e.id, e]));
  const dictMap = new Map((dictItems || []).map((d: any) => [d.id, d]));

  // Build result: each employee + their today status
  const scheduleByEmployee = new Map<string, any>();
  (schedules || []).forEach((s: any) => {
    // If employee already has a work schedule, prefer work over rest
    const existing = scheduleByEmployee.get(s.employee_id);
    const dictItem = dictMap.get(s.schedule_code_dict_item_id);
    const category = dictItem?.extra_config?.category || 'work';
    if (!existing || (category === 'work' && existing.category !== 'work')) {
      scheduleByEmployee.set(s.employee_id, {
        ...s,
        codeName: dictItem?.item_name || '-',
        category,
        projectInfo: versionProjectMap.get(s.schedule_version_id),
      });
    }
  });

  const result: TodayEmployeeRow[] = [];
  (employees || []).forEach((emp: any) => {
    const schedule = scheduleByEmployee.get(emp.id);
    // If filtering by project and employee has no schedule in that project, skip
    if (projectId && !schedule) return;

    result.push({
      employeeId: emp.id,
      employeeName: emp.full_name || '-',
      employeeNo: emp.employee_no || '-',
      departmentName: emp.department?.department_name || '-',
      scheduleCodeName: schedule?.codeName || null,
      category: schedule?.category || null,
      plannedHours: schedule ? Number(schedule.planned_hours || 0) : 0,
      projectName: schedule?.projectInfo?.projectName || null,
      projectId: schedule?.projectInfo?.projectId || null,
    });
  });

  return result;
}
