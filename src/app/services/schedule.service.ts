import { supabase } from '@/app/lib/supabase/client';
import { AppError, toAppError } from '@/app/lib/supabase/errors';
import type {
  ScheduleCellChange,
  ScheduleCellRecord,
  ScheduleCodeItem,
  ScheduleConflictResult,
  ScheduleDepartmentOption,
  ScheduleEmployeeOption,
  ScheduleProjectOption,
  ScheduleVersionOption,
} from '@/app/types/schedule';

function isMissingRpcError(error: any) {
  return error?.code === 'PGRST202' || /Could not find the function|function .* does not exist/i.test(error?.message || '');
}

function mapScheduleRow(row: any): ScheduleCellRecord {
  return {
    id: row.id,
    scheduleVersionId: row.schedule_version_id,
    employeeId: row.employee_id,
    departmentId: row.department_id,
    projectId: row.project_id,
    taskId: row.task_id,
    deviceId: row.device_id,
    scheduleDate: row.schedule_date,
    shiftTypeDictItemId: row.shift_type_dict_item_id,
    scheduleCodeDictItemId: row.schedule_code_dict_item_id,
    plannedHours: row.planned_hours,
    sourceType: row.source_type,
    remark: row.remark,
    sortOrder: row.sort_order ?? null,
  };
}

// With shift_type merged into schedule_code, this just returns the codeItem's own id
export function resolveShiftTypeDictItemId(codeItem?: ScheduleCodeItem | null) {
  return codeItem?.id || null;
}

export async function loadScheduleMatrixReferences() {
  const [projectRes, departmentRes, employeeRes, dictTypeRes] = await Promise.all([
    supabase.from('project').select('id, project_name, project_code, start_date, end_date').order('project_name'),
    supabase.from('department').select('id, department_name').order('department_name'),
    supabase.from('employee').select('id, full_name, employee_no, department_id').order('full_name'),
    supabase.from('dict_type').select('id, type_code').order('sort_order'),
  ]);

  const firstError = projectRes.error || departmentRes.error || employeeRes.error || dictTypeRes.error;
  if (firstError) {
    throw toAppError(firstError, '加载排班矩阵基础数据失败');
  }

  const types = dictTypeRes.data || [];
  const schedType = types.find(
    (item: any) => item.type_code === 'schedule_code' || item.type_code === 'shift_code' || item.type_code === 'schedule_type',
  );

  let codeQuery = supabase
    .from('dict_item')
    .select('id, item_name, item_code, extra_config, dict_type_id, sort_order, is_enabled');

  if (schedType?.id) {
    codeQuery = codeQuery.eq('dict_type_id', schedType.id);
  }

  const codeRes = await codeQuery.order('sort_order');
  if (codeRes.error) {
    throw toAppError(codeRes.error, '加载排班编码失败');
  }

  return {
    projects: (projectRes.data || []).map(
      (row: any): ScheduleProjectOption => ({
        id: row.id,
        projectName: row.project_name,
        projectCode: row.project_code,
        startDate: row.start_date,
        endDate: row.end_date,
      }),
    ),
    departments: (departmentRes.data || []).map(
      (row: any): ScheduleDepartmentOption => ({
        id: row.id,
        departmentName: row.department_name,
      }),
    ),
    employees: (employeeRes.data || []).map(
      (row: any): ScheduleEmployeeOption => ({
        id: row.id,
        fullName: row.full_name,
        employeeNo: row.employee_no,
        departmentId: row.department_id,
      }),
    ),
    codeItems: (codeRes.data || []).map(
      (row: any): ScheduleCodeItem => ({
        id: row.id,
        itemName: row.item_name,
        itemCode: row.item_code,
        extraConfig: row.extra_config,
        dictTypeId: row.dict_type_id,
        sortOrder: row.sort_order,
        isEnabled: row.is_enabled,
      }),
    ),
  };
}

export async function listScheduleVersionOptions(projectId: string) {
  const { data, error } = await supabase
    .from('schedule_version')
    .select('id, version_no, schedule_month, generation_type')
    .eq('project_id', projectId)
    .order('version_no', { ascending: false });

  if (error) {
    throw toAppError(error, '加载排班版本失败');
  }

  return (data || []).map(
    (row: any): ScheduleVersionOption => ({
      id: row.id,
      versionNo: row.version_no,
      scheduleMonth: row.schedule_month,
      generationType: row.generation_type,
    }),
  );
}

export async function getScheduleMatrix(params: {
  projectId: string;
  scheduleMonth: string;
  scheduleVersionId: string;
  departmentId?: string;
}) {
  const rpcPayload = {
    project_id: params.projectId,
    schedule_month: params.scheduleMonth,
    schedule_version_id: params.scheduleVersionId,
    view_mode: 'month',
    week_index: null,
    department_id: params.departmentId ?? null,
  };

  const rpcRes = await supabase.rpc('get_schedule_matrix', rpcPayload);

  if (!rpcRes.error) {
    const rows =
      rpcRes.data?.rows ||
      rpcRes.data?.items ||
      rpcRes.data?.records ||
      rpcRes.data ||
      [];

    const flatRows = Array.isArray(rows)
      ? rows.flatMap((row: any) => row.cells || row.schedules || row.records || (row.employee_id ? [row] : []))
      : [];

    return flatRows.map((row: any) =>
      mapScheduleRow({
        ...row,
        id: row.id || `${row.employee_id}_${row.schedule_date}`,
        schedule_version_id: row.schedule_version_id || params.scheduleVersionId,
        project_id: row.project_id || params.projectId,
      }),
    );
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '加载排班矩阵失败');
  }

  const start = `${params.scheduleMonth.slice(0, 7)}-01`;
  const endDate = new Date(start);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(0);
  const end = endDate.toISOString().slice(0, 10);

  let query = supabase
    .from('schedule')
    .select('*')
    .eq('schedule_version_id', params.scheduleVersionId)
    .eq('project_id', params.projectId)
    .gte('schedule_date', start)
    .lte('schedule_date', end);

  if (params.departmentId) {
    query = query.eq('department_id', params.departmentId);
  }

  const { data, error } = await query;
  if (error) {
    throw toAppError(error, '加载排班矩阵失败');
  }

  return (data || []).map(mapScheduleRow);
}

export async function checkScheduleConflicts(params: {
  scheduleVersionId: string;
  changes: ScheduleCellChange[];
}) {
  const rpcRes = await supabase.rpc('check_schedule_conflicts', {
    schedule_version_id: params.scheduleVersionId,
    changes: params.changes,
  });

  if (!rpcRes.error) {
    return (rpcRes.data || { success: true }) as ScheduleConflictResult;
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '校验排班冲突失败');
  }

  const seen = new Set<string>();
  const conflicts: ScheduleConflictResult['conflicts'] = [];

  params.changes.forEach((change) => {
    const employeeKey = `${change.employeeId}_${change.scheduleDate}`;
    if (seen.has(employeeKey)) {
      conflicts?.push({
        employeeId: change.employeeId,
        scheduleDate: change.scheduleDate,
        reason: '同一员工同一天存在重复排班',
      });
    } else {
      seen.add(employeeKey);
    }
  });

  return {
    success: (conflicts?.length || 0) === 0,
    conflicts,
    message: conflicts?.length ? '检测到重复排班' : undefined,
  };
}

export async function bulkUpsertScheduleCells(params: {
  scheduleVersionId: string;
  changes: ScheduleCellChange[];
}) {
  const rpcRes = await supabase.rpc('bulk_upsert_schedule_cells', {
    p_schedule_version_id: params.scheduleVersionId,
    p_changes: params.changes,
  } as any);

  if (!rpcRes.error) {
    return rpcRes.data;
  }

  if (!isMissingRpcError(rpcRes.error)) {
    throw toAppError(rpcRes.error, '保存排班失败');
  }

  const results: Array<{ employeeId: string; scheduleDate: string; id: string }> = [];

  for (const change of params.changes) {
    const { data: existingRows, error: existingError } = await supabase
      .from('schedule')
      .select('id')
      .eq('schedule_version_id', params.scheduleVersionId)
      .eq('employee_id', change.employeeId)
      .eq('schedule_date', change.scheduleDate)
      .limit(1);

    if (existingError) {
      throw toAppError(existingError, '保存排班失败');
    }

    const record = {
      schedule_version_id: params.scheduleVersionId,
      employee_id: change.employeeId,
      department_id: change.departmentId ?? null,
      project_id: change.projectId,
      task_id: change.taskId ?? null,
      device_id: change.deviceId ?? null,
      schedule_date: change.scheduleDate,
      shift_type_dict_item_id: change.shiftTypeDictItemId ?? null,
      schedule_code_dict_item_id: change.scheduleCodeDictItemId,
      planned_hours: change.plannedHours ?? null,
      source_type: change.sourceType ?? 'manual',
      remark: change.remark ?? null,
      sort_order: change.sortOrder ?? 0,
    };

    if (existingRows?.[0]?.id) {
      const { error } = await supabase.from('schedule').update(record).eq('id', existingRows[0].id);
      if (error) {
        throw toAppError(error, '保存排班失败');
      }
      results.push({ employeeId: change.employeeId, scheduleDate: change.scheduleDate, id: existingRows[0].id });
    } else {
      const { data, error } = await supabase.from('schedule').insert(record).select('id').single();
      if (error) {
        throw toAppError(error, '保存排班失败');
      }
      results.push({ employeeId: change.employeeId, scheduleDate: change.scheduleDate, id: data.id });
    }
  }

  return results;
}

export async function deleteScheduleRecordsByIds(ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  const { error } = await supabase.from('schedule').delete().in('id', ids);
  if (error) {
    throw toAppError(error, '删除排班失败');
  }
}

export async function deleteSingleScheduleRecord(id: string) {
  const { error } = await supabase.from('schedule').delete().eq('id', id);
  if (error) {
    throw toAppError(error, '删除排班失败');
  }
}

export function ensureConflictFree(result: ScheduleConflictResult) {
  if (!result.success) {
    throw new AppError(result.message || result.conflicts?.[0]?.reason || '检测到排班冲突', 'SCHEDULE_CONFLICT');
  }
}
