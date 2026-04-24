import { authMode, supabase } from '@/app/lib/supabase/client';
import { AppError, toAppError } from '@/app/lib/supabase/errors';
import type { ReferenceOption } from '@/app/types/master-data';
import type {
  ApprovalStatusOption,
  AvailableReplacement,
  ShiftChangeApprovePayload,
  ShiftChangeRequestRecord,
} from '@/app/types/shift-change';

function mapApprovalStatus(row: any): ApprovalStatusOption {
  return {
    id: row.id,
    itemCode: row.item_code,
    itemName: row.item_name,
  };
}

export async function loadShiftChangeReferences() {
  const [employeeRes, statusRes] = await Promise.all([
    supabase
      .from('employee')
      .select('id, full_name, department:department_id(department_name)')
      .order('full_name'),
    supabase
      .from('dict_item')
      .select('id, item_name, item_code, dict_type!inner(type_code)')
      .eq('dict_type.type_code', 'approval_status')
      .order('sort_order'),
  ]);

  const firstError = employeeRes.error || statusRes.error;
  if (firstError) {
    throw toAppError(firstError, '加载调班审批基础数据失败');
  }

  return {
    employees: (employeeRes.data || []).map(
      (row: any): ReferenceOption => ({
        id: row.id,
        label: row.full_name,
      }),
    ),
    statuses: (statusRes.data || []).map(mapApprovalStatus),
  };
}

/**
 * List shift change requests with rich JOIN data for display
 */
export async function listShiftChangeRequests() {
  // Query requests with all related data
  const { data, error } = await supabase
    .from('shift_change_request')
    .select(`
      *,
      applicant:applicant_employee_id(full_name, department_id, labor_relation_dict_item_id, department:department_id(department_name)),
      target_employee:target_employee_id(full_name),
      original_schedule:original_schedule_id(schedule_date, planned_hours, schedule_version_id, schedule_code_dict_item_id, project_id, schedule_code:schedule_code_dict_item_id(item_name), project:project_id(project_name, start_date, end_date)),
      target_code:target_schedule_code_dict_item_id(item_name),
      original_code_snapshot:original_schedule_code_dict_item_id(item_name),
      status:approval_status_dict_item_id(item_name, item_code)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    throw toAppError(error, '加载调班申请失败');
  }

  return (data || []).map((row: any): ShiftChangeRequestRecord => ({
    id: row.id,
    requestType: row.request_type,
    applicantEmployeeId: row.applicant_employee_id,
    targetEmployeeId: row.target_employee_id,
    originalScheduleId: row.original_schedule_id,
    targetScheduleId: row.target_schedule_id,
    targetDate: row.target_date,
    targetShiftTypeDictItemId: row.target_shift_type_dict_item_id,
    targetScheduleCodeDictItemId: row.target_schedule_code_dict_item_id,
    targetTaskId: row.target_task_id,
    targetDeviceId: row.target_device_id,
    reason: row.reason,
    approvalStatusDictItemId: row.approval_status_dict_item_id,
    approverUserAccountId: row.approver_user_account_id,
    approvedAt: row.approved_at,
    approvalComment: row.approval_comment,
    createdAt: row.created_at,
    // Display fields - 优先使用快照字段（申请时冻结），兜底用实时 schedule 数据
    applicantName: row.applicant?.full_name || '-',
    applicantDeptName: row.applicant?.department?.department_name || '-',
    applicantDepartmentId: row.applicant?.department_id || null,
    applicantLaborRelationDictItemId: row.applicant?.labor_relation_dict_item_id || null,
    targetEmployeeName: row.target_employee?.full_name || null,
    originalScheduleDate: row.original_schedule_date || row.original_schedule?.schedule_date || null,
    originalCodeName: row.original_code_snapshot?.item_name || row.original_schedule?.schedule_code?.item_name || null,
    originalPlannedHours: row.original_planned_hours != null
      ? Number(row.original_planned_hours)
      : (row.original_schedule?.planned_hours != null ? Number(row.original_schedule.planned_hours) : null),
    targetCodeName: row.target_code?.item_name || null,
    projectName: row.original_schedule?.project?.project_name || '-',
    projectStartDate: row.original_schedule?.project?.start_date || null,
    projectEndDate: row.original_schedule?.project?.end_date || null,
    projectId: row.original_schedule?.project_id || null,
    scheduleVersionId: row.original_schedule?.schedule_version_id || null,
    statusName: row.status?.item_name || '-',
    statusCode: row.status?.item_code || '',
  }));
}

/**
 * Find employees who are resting (have '休' schedule code or no schedule) on a given date
 * These are candidates to replace the applicant
 */
export async function findAvailableReplacements(
  scheduleDate: string,
  scheduleVersionId: string,
): Promise<AvailableReplacement[]> {
  // First get the version to find the project
  const { data: versionData, error: versionError } = await supabase
    .from('schedule_version')
    .select('project_id')
    .eq('id', scheduleVersionId)
    .single();

  if (versionError || !versionData) {
    throw toAppError(versionError, '查询排班版本失败');
  }

  // Get all employees
  const { data: allEmployees, error: empError } = await supabase
    .from('employee')
    .select('id, full_name, employee_no, department:department_id(department_name)')
    .order('full_name');

  if (empError) {
    throw toAppError(empError, '查询员工失败');
  }

  // Get schedules for that date in this version
  const { data: schedulesOnDate, error: schedError } = await supabase
    .from('schedule')
    .select('employee_id, schedule_code_dict_item_id, schedule_code:schedule_code_dict_item_id(item_name, extra_config)')
    .eq('schedule_version_id', scheduleVersionId)
    .eq('schedule_date', scheduleDate);

  if (schedError) {
    throw toAppError(schedError, '查询排班数据失败');
  }

  // Build map: employee_id -> schedule info
  const scheduleMap = new Map<string, any>();
  (schedulesOnDate || []).forEach((s: any) => {
    scheduleMap.set(s.employee_id, s);
  });

  // Find rest employees: those with 休/leave category OR no schedule at all
  const available: AvailableReplacement[] = [];
  (allEmployees || []).forEach((emp: any) => {
    const schedule = scheduleMap.get(emp.id);
    const isResting = !schedule
      || schedule.schedule_code?.extra_config?.category === 'rest'
      || schedule.schedule_code?.extra_config?.category === 'leave'
      || schedule.schedule_code?.item_name === '休';

    if (isResting) {
      available.push({
        employeeId: emp.id,
        employeeName: emp.full_name,
        departmentName: emp.department?.department_name || '-',
        employeeNo: emp.employee_no || '',
      });
    }
  });

  return available;
}

/**
 * Calculate monthly hours impact for both employees involved in a shift change.
 * Returns current and projected monthly hours for the applicant and the replacement.
 */
export type HoursImpact = {
  employeeId: string;
  employeeName: string;
  currentMonthlyHours: number;
  projectedMonthlyHours: number;
  monthlyHoursLimit: number | null;
};

export async function getMonthlyHoursImpact(params: {
  applicantEmployeeId: string;
  applicantName: string;
  replacementEmployeeId: string;
  replacementName: string;
  scheduleVersionId: string;
  scheduleDate: string;
  shiftPlannedHours: number;
}): Promise<{ applicant: HoursImpact; replacement: HoursImpact }> {
  // Determine the month range from the schedule date
  const d = new Date(params.scheduleDate);
  const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const monthEnd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${lastDay}`;

  // Query schedules for both employees in this month
  const { data: schedules } = await supabase
    .from('schedule')
    .select('employee_id, planned_hours')
    .eq('schedule_version_id', params.scheduleVersionId)
    .gte('schedule_date', monthStart)
    .lte('schedule_date', monthEnd)
    .in('employee_id', [params.applicantEmployeeId, params.replacementEmployeeId]);

  // Sum hours per employee
  const hoursMap: Record<string, number> = {};
  (schedules || []).forEach((s: any) => {
    const eid = s.employee_id;
    hoursMap[eid] = (hoursMap[eid] || 0) + Number(s.planned_hours || 0);
  });

  const applicantCurrent = hoursMap[params.applicantEmployeeId] || 0;
  const replacementCurrent = hoursMap[params.replacementEmployeeId] || 0;
  const shiftHours = params.shiftPlannedHours || 8;

  // Query monthly limit from labor rules (get highest priority applicable rule)
  const { listLaborRules } = await import('@/app/services/labor-rule.service');
  const allRules = await listLaborRules();
  const enabledRules = allRules.filter(r => r.isEnabled && r.monthlyHoursLimit != null);
  const monthlyLimit = enabledRules.length > 0
    ? enabledRules.sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))[0].monthlyHoursLimit
    : null;

  return {
    applicant: {
      employeeId: params.applicantEmployeeId,
      employeeName: params.applicantName,
      currentMonthlyHours: applicantCurrent,
      projectedMonthlyHours: applicantCurrent - shiftHours,
      monthlyHoursLimit: monthlyLimit,
    },
    replacement: {
      employeeId: params.replacementEmployeeId,
      employeeName: params.replacementName,
      currentMonthlyHours: replacementCurrent,
      projectedMonthlyHours: replacementCurrent + shiftHours,
      monthlyHoursLimit: monthlyLimit,
    },
  };
}

/**
 * Approve or reject a shift change request.
 * For direct_change approval: requires replacementEmployeeId to execute the swap.
 */
export async function approveShiftChange(payload: ShiftChangeApprovePayload) {
  // Try Edge Function first
  const { data, error } = await supabase.functions.invoke('shift-change-approve', {
    body: {
      shift_change_request_id: payload.shiftChangeRequestId,
      action: payload.action,
      approval_comment: payload.approvalComment,
      operator_user_account_id: payload.operatorUserAccountId,
      replacement_employee_id: payload.replacementEmployeeId,
    },
  });

  if (!error) {
    if (data?.success === false) {
      throw new AppError(data.message ?? '审批调班失败', data.error_code ?? 'FUNCTION_ERROR');
    }
    return data;
  }

  // Extract real error from Edge Function response
  try {
    const ctx = (error as any).context;
    if (ctx) {
      const body = typeof ctx.json === 'function' ? await ctx.json() : (typeof ctx === 'object' ? ctx : null);
      if (body?.success === false && body?.message) {
        // Skip auth errors - let them fall through to the fallback
        const isAuthError = /invalid claim|missing sub|unauthorized/i.test(body.message);
        if (!isAuthError) {
          throw new AppError(body.message, body.error_code ?? 'FUNCTION_ERROR');
        }
      }
    }
  } catch (extractError) {
    if (extractError instanceof AppError) throw extractError;
  }

  const isFallbackAllowed =
    authMode === 'mock' &&
    (error.code === 'FunctionsHttpError' ||
      error.name === 'FunctionsHttpError' ||
      /not found|401|403|500|non-2xx|Failed to send a request to the Edge Function|invalid claim/i.test(error.message || ''));

  if (!isFallbackAllowed) {
    throw toAppError(error, '审批调班失败');
  }

  // ===== Fallback: direct DB operations =====
  const { data: requestRows, error: requestError } = await supabase
    .from('shift_change_request')
    .select('*')
    .eq('id', payload.shiftChangeRequestId)
    .limit(1);

  if (requestError || !requestRows?.[0]) {
    throw toAppError(requestError || new Error('未找到调班申请'), '审批调班失败');
  }

  const request = requestRows[0];

  // Prevent duplicate approval
  if (request.approved_at) {
    throw new AppError('该调班申请已处理，禁止重复审批', 'SHIFT_CHANGE_ALREADY_PROCESSED');
  }

  // Get target approval status
  const { data: statusRows, error: statusError } = await supabase
    .from('dict_item')
    .select('id, item_code')
    .in('item_code', ['approved', 'rejected']);

  if (statusError) {
    throw toAppError(statusError, '审批调班失败');
  }

  const targetStatus = statusRows?.find((item: any) => item.item_code === (payload.action === 'approve' ? 'approved' : 'rejected'));
  if (!targetStatus) {
    throw new AppError('未找到审批状态字典项', 'DICT_ITEM_MISSING');
  }

  const approvedAt = new Date().toISOString();

  if (payload.action === 'approve') {
    // ============================================================
    // 审批通过 → 创建新版本 → 复制排班 → 应用变更 → 自动发布
    // ============================================================

    // --- 1. 获取原排班记录和版本信息 ---
    const { data: origScheduleRow, error: origErr } = await supabase
      .from('schedule')
      .select('*, schedule_version:schedule_version_id(id, project_id, schedule_month, version_no)')
      .eq('id', request.original_schedule_id)
      .single();

    if (origErr || !origScheduleRow) {
      throw toAppError(origErr || new Error('未找到原排班'), '审批调班失败');
    }

    const oldVersion = origScheduleRow.schedule_version as any;
    const oldVersionId = oldVersion.id;

    // 冻结原班次快照（如果尚未写入）
    if (!request.original_schedule_code_dict_item_id) {
      await supabase.from('shift_change_request').update({
        original_schedule_code_dict_item_id: origScheduleRow.schedule_code_dict_item_id,
        original_schedule_date: origScheduleRow.schedule_date,
        original_planned_hours: origScheduleRow.planned_hours,
      }).eq('id', payload.shiftChangeRequestId);
    }

    // 查申请人姓名（用于 remark）
    const { data: applicantRow } = await supabase.from('employee').select('full_name').eq('id', request.applicant_employee_id).single();
    const applicantName = applicantRow?.full_name || '员工';

    // --- 2. 获取发布状态字典项 ---
    const { data: publishedStatusRows } = await supabase
      .from('dict_item')
      .select('id')
      .eq('item_code', 'published')
      .limit(1);
    const publishedStatusId = publishedStatusRows?.[0]?.id;
    if (!publishedStatusId) {
      throw new AppError('缺少 published 状态字典项', 'DICT_STATUS_MISSING');
    }

    // --- 3. 计算新版本号 ---
    const { data: maxVersionRows } = await supabase
      .from('schedule_version')
      .select('version_no')
      .eq('project_id', oldVersion.project_id)
      .eq('schedule_month', oldVersion.schedule_month)
      .order('version_no', { ascending: false })
      .limit(1);
    const newVersionNo = (maxVersionRows?.[0]?.version_no ?? 0) + 1;

    // --- 构建版本备注 ---
    let versionRemark = '';

    // === SWAP: 先校验 ===
    if (request.request_type === 'swap' && request.target_schedule_id) {
      const { data: targetScheduleRow } = await supabase
        .from('schedule')
        .select('*')
        .eq('id', request.target_schedule_id)
        .single();

      if (!targetScheduleRow) {
        throw new AppError('缺少目标排班数据', 'MISSING_TARGET_SCHEDULE');
      }

      if (origScheduleRow.schedule_code_dict_item_id === targetScheduleRow.schedule_code_dict_item_id) {
        throw new AppError(
          '两人班次相同，互换无意义（如"休"换"休"），请拒绝此申请或改为其他调班方式',
          'SWAP_SAME_SHIFT',
        );
      }

      const { data: targetEmpRow } = await supabase.from('employee').select('full_name').eq('id', request.target_employee_id).single();
      const targetName = targetEmpRow?.full_name || '员工';
      versionRemark = `调班审批: ${applicantName}与${targetName}互换班次(${origScheduleRow.schedule_date})`;
    }

    // === DIRECT_CHANGE: 先校验 ===
    if (request.request_type === 'direct_change') {
      if (!payload.replacementEmployeeId) {
        throw new AppError('直接变更审批需指定替班人员', 'REPLACEMENT_REQUIRED');
      }
      const { data: replEmpRow } = await supabase.from('employee').select('full_name').eq('id', payload.replacementEmployeeId).single();
      const replName = replEmpRow?.full_name || '替班人员';
      versionRemark = `调班审批: ${replName}替${applicantName}班(${origScheduleRow.schedule_date})`;

      // direct_change 需记录 target_employee_id
      await supabase.from('shift_change_request').update({
        target_employee_id: payload.replacementEmployeeId,
      }).eq('id', payload.shiftChangeRequestId);
    }

    // --- 4. 创建新版本 ---
    const { data: newVersionRows, error: createVersionErr } = await supabase
      .from('schedule_version')
      .insert({
        project_id: oldVersion.project_id,
        schedule_month: oldVersion.schedule_month,
        version_no: newVersionNo,
        generation_type: 'shift_change',
        publish_status_dict_item_id: publishedStatusId,
        created_by_user_account_id: payload.operatorUserAccountId || null,
        published_at: approvedAt,
        published_by_user_account_id: payload.operatorUserAccountId || null,
        is_active: false, // 先不激活，最后统一设置
        remark: versionRemark,
      })
      .select('id')
      .single();

    if (createVersionErr || !newVersionRows) {
      throw toAppError(createVersionErr || new Error('创建新版本失败'), '审批调班失败');
    }
    const newVersionId = newVersionRows.id;

    // --- 5. 批量复制原版本所有排班记录到新版本 ---
    const { data: allSchedules, error: fetchErr } = await supabase
      .from('schedule')
      .select('*')
      .eq('schedule_version_id', oldVersionId);

    if (fetchErr) {
      throw toAppError(fetchErr, '复制排班数据失败');
    }

    if (allSchedules && allSchedules.length > 0) {
      const copiedRows = allSchedules.map((s: any) => {
        const { id, created_at, updated_at, schedule_import_batch_id, ...rest } = s;
        return {
          ...rest,
          schedule_version_id: newVersionId,
          source_type: 'copy',
          schedule_import_batch_id: null,
        };
      });

      // 分批插入（每批500条）
      const BATCH_SIZE = 500;
      for (let i = 0; i < copiedRows.length; i += BATCH_SIZE) {
        const batch = copiedRows.slice(i, i + BATCH_SIZE);
        const { error: insertErr } = await supabase.from('schedule').insert(batch);
        if (insertErr) {
          throw toAppError(insertErr, '复制排班数据失败');
        }
      }
    }

    // --- 6. 在新版本中应用调班变更 ---
    if (request.request_type === 'swap' && request.target_schedule_id) {
      // 获取目标排班（旧版本中的）
      const { data: targetOld } = await supabase
        .from('schedule')
        .select('*')
        .eq('id', request.target_schedule_id)
        .single();

      // 在新版本中通过 employee_id + schedule_date 定位
      await Promise.all([
        // 申请人的排班 → 换成目标人的班次
        supabase.from('schedule').update({
          schedule_code_dict_item_id: targetOld.schedule_code_dict_item_id,
          shift_type_dict_item_id: targetOld.shift_type_dict_item_id,
          planned_hours: targetOld.planned_hours,
          remark: `调班审批: 与${(await supabase.from('employee').select('full_name').eq('id', request.target_employee_id).single()).data?.full_name || ''}互换`,
        })
          .eq('schedule_version_id', newVersionId)
          .eq('employee_id', request.applicant_employee_id)
          .eq('schedule_date', origScheduleRow.schedule_date),
        // 目标人的排班 → 换成申请人的班次
        supabase.from('schedule').update({
          schedule_code_dict_item_id: origScheduleRow.schedule_code_dict_item_id,
          shift_type_dict_item_id: origScheduleRow.shift_type_dict_item_id,
          planned_hours: origScheduleRow.planned_hours,
          remark: `调班审批: 与${applicantName}互换`,
        })
          .eq('schedule_version_id', newVersionId)
          .eq('employee_id', request.target_employee_id)
          .eq('schedule_date', origScheduleRow.schedule_date),
      ]);
    }

    if (request.request_type === 'direct_change') {
      // 查休息编码和班别
      const { data: restCodeRows } = await supabase.from('dict_item').select('id').eq('item_name', '休').limit(1);
      const restCodeId = restCodeRows?.[0]?.id;
      const { data: restShiftRows } = await supabase.from('dict_item').select('id').eq('item_code', 'rest').limit(1);
      const restShiftTypeId = restShiftRows?.[0]?.id;

      const { data: replEmpData } = await supabase.from('employee').select('id, full_name, department_id').eq('id', payload.replacementEmployeeId!).single();

      // 在新版本中：替班人接班
      const { data: replScheduleInNew } = await supabase
        .from('schedule')
        .select('id')
        .eq('schedule_version_id', newVersionId)
        .eq('employee_id', payload.replacementEmployeeId!)
        .eq('schedule_date', origScheduleRow.schedule_date)
        .limit(1);

      if (replScheduleInNew?.[0]?.id) {
        await supabase.from('schedule').update({
          schedule_code_dict_item_id: origScheduleRow.schedule_code_dict_item_id,
          shift_type_dict_item_id: origScheduleRow.shift_type_dict_item_id,
          planned_hours: origScheduleRow.planned_hours,
          remark: `调班审批: 替${applicantName}班`,
        }).eq('id', replScheduleInNew[0].id);
      } else {
        await supabase.from('schedule').insert({
          schedule_version_id: newVersionId,
          employee_id: payload.replacementEmployeeId!,
          department_id: replEmpData?.department_id || origScheduleRow.department_id,
          project_id: origScheduleRow.project_id,
          schedule_date: origScheduleRow.schedule_date,
          schedule_code_dict_item_id: origScheduleRow.schedule_code_dict_item_id,
          shift_type_dict_item_id: origScheduleRow.shift_type_dict_item_id,
          planned_hours: origScheduleRow.planned_hours,
          source_type: 'copy',
          remark: `调班审批: 替${applicantName}班`,
        });
      }

      // 在新版本中：申请人改休
      const restUpdate: any = {
        remark: `调班审批: 由${replEmpData?.full_name || '替班人员'}替班`,
        planned_hours: 0,
      };
      if (restCodeId) restUpdate.schedule_code_dict_item_id = restCodeId;
      if (restShiftTypeId) restUpdate.shift_type_dict_item_id = restShiftTypeId;

      await supabase.from('schedule').update(restUpdate)
        .eq('schedule_version_id', newVersionId)
        .eq('employee_id', request.applicant_employee_id)
        .eq('schedule_date', origScheduleRow.schedule_date);
    }

    // --- 7. 旧版本归档，新版本激活 ---
    // 将同项目同月的所有旧版本设为 is_active=false
    await supabase
      .from('schedule_version')
      .update({ is_active: false })
      .eq('project_id', oldVersion.project_id)
      .eq('schedule_month', oldVersion.schedule_month);

    // 新版本设为激活
    await supabase
      .from('schedule_version')
      .update({ is_active: true })
      .eq('id', newVersionId);
  }

  // Update approval status
  const { error: updateError } = await supabase
    .from('shift_change_request')
    .update({
      approval_status_dict_item_id: targetStatus.id,
      approver_user_account_id: payload.operatorUserAccountId,
      approved_at: approvedAt,
      approval_comment: payload.approvalComment ?? null,
    })
    .eq('id', payload.shiftChangeRequestId);

  if (updateError) {
    throw toAppError(updateError, '审批调班失败');
  }

  return {
    success: true,
    message: payload.action === 'approve' ? '审批通过' : '审批拒绝',
  };
}
