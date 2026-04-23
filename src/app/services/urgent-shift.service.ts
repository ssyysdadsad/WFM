import { supabase } from '@/app/lib/supabase/client';
import { toAppError, AppError } from '@/app/lib/supabase/errors';
import type {
  UrgentShiftRecord,
  UrgentShiftFormValues,
  UrgentShiftSignupRecord,
  EligibleEmployee,
  LaborRuleWarning,
} from '@/app/types/urgent-shift';

/* ========== Mappers ========== */

function mapUrgentShift(row: any): UrgentShiftRecord {
  return {
    id: row.id,
    title: row.title,
    shiftType: row.shift_type,
    shiftDate: row.shift_date,
    startTime: row.start_time,
    endTime: row.end_time,
    requiredCount: row.required_count,
    projectId: row.project_id,
    projectName: row.project?.project_name || null,
    skillId: row.skill_id,
    skillName: row.skill?.skill_name || null,
    description: row.description,
    signupDeadline: row.signup_deadline,
    status: row.status,
    createdByUserAccountId: row.created_by_user_account_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSignup(row: any): UrgentShiftSignupRecord {
  return {
    id: row.id,
    urgentShiftId: row.urgent_shift_id,
    employeeId: row.employee_id,
    employeeName: row.employee?.full_name || '-',
    employeeNo: row.employee?.employee_no || '',
    departmentName: row.employee?.department?.department_name || '-',
    status: row.status,
    remark: row.remark,
    approvalComment: row.approval_comment,
    approvedByUserAccountId: row.approved_by_user_account_id,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

/* ========== CRUD ========== */

/** List all urgent shifts with signup statistics */
export async function listUrgentShifts(): Promise<UrgentShiftRecord[]> {
  const { data, error } = await supabase
    .from('urgent_shift')
    .select('*, project:project_id(project_name), skill:skill_id(skill_name)')
    .order('created_at', { ascending: false });

  if (error) throw toAppError(error, '加载紧急班次失败');

  const shifts = (data || []).map(mapUrgentShift);

  // Batch load signup counts
  if (shifts.length > 0) {
    const shiftIds = shifts.map(s => s.id);
    const { data: signups } = await supabase
      .from('urgent_shift_signup')
      .select('urgent_shift_id, status')
      .in('urgent_shift_id', shiftIds);

    const countMap: Record<string, { total: number; approved: number }> = {};
    (signups || []).forEach((s: any) => {
      if (!countMap[s.urgent_shift_id]) countMap[s.urgent_shift_id] = { total: 0, approved: 0 };
      if (s.status !== 'cancelled') countMap[s.urgent_shift_id].total++;
      if (s.status === 'approved') countMap[s.urgent_shift_id].approved++;
    });

    shifts.forEach(s => {
      s.signupCount = countMap[s.id]?.total || 0;
      s.approvedCount = countMap[s.id]?.approved || 0;
    });
  }

  return shifts;
}

/** Create a new urgent shift */
export async function createUrgentShift(
  values: UrgentShiftFormValues,
  operatorId: string,
): Promise<void> {
  const { error } = await supabase.from('urgent_shift').insert({
    title: values.title,
    shift_type: values.shiftType,
    shift_date: values.shiftDate,
    start_time: values.startTime,
    end_time: values.endTime,
    required_count: values.requiredCount,
    project_id: values.projectId,
    skill_id: values.skillId || null,
    description: values.description || null,
    signup_deadline: values.signupDeadline,
    created_by_user_account_id: operatorId,
  });
  if (error) throw toAppError(error, '创建紧急班次失败');
}

/** Update an urgent shift */
export async function updateUrgentShift(
  id: string,
  values: Partial<UrgentShiftFormValues> & { status?: string },
): Promise<void> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (values.title !== undefined) updateData.title = values.title;
  if (values.shiftType !== undefined) updateData.shift_type = values.shiftType;
  if (values.shiftDate !== undefined) updateData.shift_date = values.shiftDate;
  if (values.startTime !== undefined) updateData.start_time = values.startTime;
  if (values.endTime !== undefined) updateData.end_time = values.endTime;
  if (values.requiredCount !== undefined) updateData.required_count = values.requiredCount;
  if (values.projectId !== undefined) updateData.project_id = values.projectId;
  if (values.skillId !== undefined) updateData.skill_id = values.skillId || null;
  if (values.description !== undefined) updateData.description = values.description || null;
  if (values.signupDeadline !== undefined) updateData.signup_deadline = values.signupDeadline;
  if (values.status !== undefined) updateData.status = values.status;

  const { error } = await supabase.from('urgent_shift').update(updateData).eq('id', id);
  if (error) throw toAppError(error, '更新紧急班次失败');
}

/** Delete an urgent shift */
export async function deleteUrgentShift(id: string): Promise<void> {
  const { error } = await supabase.from('urgent_shift').delete().eq('id', id);
  if (error) throw toAppError(error, '删除紧急班次失败');
}

/* ========== Conflict Detection — Core ========== */

/**
 * Find employees who are AVAILABLE (no time conflict) for a given urgent shift.
 *
 * Algorithm:
 * 1. Get all employees
 * 2. Get all schedule records for shift_date across ALL active versions
 * 3. For each employee, check if their scheduled shift overlaps with urgent shift time range
 * 4. Overlap check: NOT (schedEnd <= urgentStart OR schedStart >= urgentEnd)
 * 5. Filter out conflicting employees
 * 6. Optionally highlight employees with matching skills
 */
export async function findEligibleEmployees(
  shiftDate: string,
  startTime: string,
  endTime: string,
  skillId?: string | null,
): Promise<EligibleEmployee[]> {
  // 1. All employees
  const { data: allEmployees, error: empErr } = await supabase
    .from('employee')
    .select('id, full_name, employee_no, department:department_id(department_name)')
    .order('full_name');
  if (empErr) throw toAppError(empErr, '查询员工失败');

  // 2. Get schedule codes with time info
  const { data: dictTypes } = await supabase
    .from('dict_type')
    .select('id, type_code')
    .order('sort_order');
  const schedType = (dictTypes || []).find(
    (t: any) => t.type_code === 'schedule_code' || t.type_code === 'shift_code' || t.type_code === 'schedule_type',
  );

  const codeMap: Record<string, { startTime: string; endTime: string; category?: string }> = {};
  if (schedType) {
    const { data: codeItems } = await supabase
      .from('dict_item')
      .select('id, item_name, extra_config')
      .eq('dict_type_id', schedType.id);
    (codeItems || []).forEach((c: any) => {
      const extra = c.extra_config || {};
      codeMap[c.id] = {
        startTime: extra.start_time || '',
        endTime: extra.end_time || '',
        category: extra.category,
      };
    });
  }

  // 3. Get all schedules on the target date
  const { data: schedulesOnDate } = await supabase
    .from('schedule')
    .select('employee_id, schedule_code_dict_item_id')
    .eq('schedule_date', shiftDate);

  // Build map: employee_id -> their schedule codes
  const empScheduleMap = new Map<string, string[]>();
  (schedulesOnDate || []).forEach((s: any) => {
    if (!empScheduleMap.has(s.employee_id)) empScheduleMap.set(s.employee_id, []);
    empScheduleMap.get(s.employee_id)!.push(s.schedule_code_dict_item_id);
  });

  // 4. Get employee skills
  const { data: empSkills } = await supabase
    .from('employee_skill')
    .select('employee_id, skill:skill_id(skill_name)');
  const empSkillMap = new Map<string, string[]>();
  (empSkills || []).forEach((es: any) => {
    if (!empSkillMap.has(es.employee_id)) empSkillMap.set(es.employee_id, []);
    if (es.skill?.skill_name) empSkillMap.get(es.employee_id)!.push(es.skill.skill_name);
  });

  // 5. Time overlap detection helper
  const toMinutes = (t: string): number => {
    const parts = t.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1] || '0');
  };
  const urgentStartMin = toMinutes(startTime);
  const urgentEndMin = toMinutes(endTime);

  const hasConflict = (codeId: string): boolean => {
    const code = codeMap[codeId];
    if (!code) return false;
    // Rest/leave categories never conflict
    if (code.category === 'rest' || code.category === 'leave') return false;
    if (!code.startTime || !code.endTime) return false;

    const schedStartMin = toMinutes(code.startTime);
    const schedEndMin = toMinutes(code.endTime);
    // Overlap: NOT (schedEnd <= urgentStart OR schedStart >= urgentEnd)
    return !(schedEndMin <= urgentStartMin || schedStartMin >= urgentEndMin);
  };

  // 6. Get labor rules for validation
  const { data: laborRules } = await supabase
    .from('labor_rule')
    .select('*')
    .eq('is_enabled', true)
    .order('priority');

  // 7. Get schedule data needed for labor rule checks (current week + month)
  const shiftDateObj = new Date(shiftDate);
  const monthStart = `${shiftDate.substring(0, 8)}01`;
  const monthEnd = new Date(shiftDateObj.getFullYear(), shiftDateObj.getMonth() + 1, 0);
  const monthEndStr = `${monthEnd.getFullYear()}-${String(monthEnd.getMonth() + 1).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;

  // Week range: Mon-Sun of the week containing shiftDate
  const dayOfWeek = shiftDateObj.getDay() || 7; // 1=Mon ... 7=Sun
  const weekStartObj = new Date(shiftDateObj);
  weekStartObj.setDate(weekStartObj.getDate() - dayOfWeek + 1);
  const weekEndObj = new Date(weekStartObj);
  weekEndObj.setDate(weekEndObj.getDate() + 6);
  const weekStart = weekStartObj.toISOString().split('T')[0];
  const weekEnd = weekEndObj.toISOString().split('T')[0];

  // Fetch monthly schedules for all employees (for labor rule checks)
  const { data: monthSchedules } = await supabase
    .from('schedule')
    .select('employee_id, schedule_date, planned_hours, schedule_code_dict_item_id')
    .gte('schedule_date', monthStart)
    .lte('schedule_date', monthEndStr);

  // Build employee schedule data maps
  const empMonthHoursMap = new Map<string, number>();
  const empWeekHoursMap = new Map<string, number>();
  const empConsecutiveMap = new Map<string, number>();
  const empLastShiftEndMap = new Map<string, string>(); // 上次班次结束时间
  const empDayHoursMap = new Map<string, number>(); // 当天已有工时

  // 判断是否为工作班次的辅助
  const isWorkCode = (codeId: string): boolean => {
    const code = codeMap[codeId];
    return code ? (code.category !== 'rest' && code.category !== 'leave') : false;
  };

  (monthSchedules || []).forEach((s: any) => {
    const hours = Number(s.planned_hours) || 0;
    const isWork = isWorkCode(s.schedule_code_dict_item_id);

    // Monthly hours
    if (isWork) {
      empMonthHoursMap.set(s.employee_id, (empMonthHoursMap.get(s.employee_id) || 0) + hours);
    }

    // Weekly hours
    if (isWork && s.schedule_date >= weekStart && s.schedule_date <= weekEnd) {
      empWeekHoursMap.set(s.employee_id, (empWeekHoursMap.get(s.employee_id) || 0) + hours);
    }

    // Day hours (on shift_date itself)
    if (isWork && s.schedule_date === shiftDate) {
      empDayHoursMap.set(s.employee_id, (empDayHoursMap.get(s.employee_id) || 0) + hours);
    }
  });

  // Calculate consecutive work days ending on shiftDate
  (allEmployees || []).forEach((emp: any) => {
    const empScheds = (monthSchedules || []).filter((s: any) => s.employee_id === emp.id);
    const workDates = new Set(
      empScheds.filter((s: any) => isWorkCode(s.schedule_code_dict_item_id)).map((s: any) => s.schedule_date),
    );
    // Count consecutive work days leading up to (and including) shiftDate
    let consecutive = workDates.has(shiftDate) ? 1 : 0;
    // Actually, the urgent shift would ADD this day, so count as if it's a work day
    consecutive = 1;
    const d = new Date(shiftDate);
    for (let i = 1; i <= 14; i++) {
      d.setDate(d.getDate() - 1);
      const ds = d.toISOString().split('T')[0];
      if (workDates.has(ds)) {
        consecutive++;
      } else {
        break;
      }
    }
    empConsecutiveMap.set(emp.id, consecutive);
  });

  // Calculate urgent shift hours
  const urgentHours = Math.max(0, (urgentEndMin - urgentStartMin) / 60);

  // 8. Labor rule check per employee
  function checkLaborRules(empId: string): LaborRuleWarning[] {
    const warnings: LaborRuleWarning[] = [];
    if (!laborRules || laborRules.length === 0) return warnings;

    const existingDayHours = empDayHoursMap.get(empId) || 0;
    const totalDayHours = existingDayHours + urgentHours;
    const existingWeekHours = empWeekHoursMap.get(empId) || 0;
    const totalWeekHours = existingWeekHours + urgentHours;
    const existingMonthHours = empMonthHoursMap.get(empId) || 0;
    const totalMonthHours = existingMonthHours + urgentHours;
    const consecutive = empConsecutiveMap.get(empId) || 1;

    for (const rule of laborRules) {
      const level = rule.is_hard_constraint ? 'hard' : 'soft';
      const rn = rule.rule_name;

      if (rule.daily_hours_limit && totalDayHours > Number(rule.daily_hours_limit)) {
        warnings.push({
          ruleName: rn, level,
          message: `当天总工时 ${totalDayHours.toFixed(1)}h 超出日上限 ${rule.daily_hours_limit}h`,
        });
      }

      if (rule.weekly_hours_limit && totalWeekHours > Number(rule.weekly_hours_limit)) {
        warnings.push({
          ruleName: rn, level,
          message: `本周总工时 ${totalWeekHours.toFixed(1)}h 超出周上限 ${rule.weekly_hours_limit}h`,
        });
      }

      if (rule.monthly_hours_limit && totalMonthHours > Number(rule.monthly_hours_limit)) {
        warnings.push({
          ruleName: rn, level,
          message: `本月总工时 ${totalMonthHours.toFixed(1)}h 超出月上限 ${rule.monthly_hours_limit}h`,
        });
      }

      if (rule.max_consecutive_work_days && consecutive > rule.max_consecutive_work_days) {
        warnings.push({
          ruleName: rn, level,
          message: `连续工作 ${consecutive} 天超出上限 ${rule.max_consecutive_work_days} 天`,
        });
      }

      if (rule.min_shift_interval_hours) {
        // 简化检查：如果当天已有工作排班，班次间隔可能不足
        if (existingDayHours > 0) {
          warnings.push({
            ruleName: rn, level,
            message: `当天已有 ${existingDayHours.toFixed(1)}h 排班，请注意班次间隔不少于 ${rule.min_shift_interval_hours}h`,
          });
        }
      }
    }

    return warnings;
  }

  // 9. Filter eligible employees
  const eligible: EligibleEmployee[] = [];
  (allEmployees || []).forEach((emp: any) => {
    const codes = empScheduleMap.get(emp.id) || [];
    const conflicting = codes.some(hasConflict);
    if (conflicting) return; // Skip — has time overlap

    // Determine current shift description
    let currentShift: string | null = null;
    if (codes.length === 0) {
      currentShift = null; // No schedule
    } else {
      const firstCode = codeMap[codes[0]];
      currentShift = firstCode?.category === 'rest' || firstCode?.category === 'leave' ? '休' : '有班次（不冲突）';
    }

    // Check labor rules
    const laborWarnings = checkLaborRules(emp.id);

    eligible.push({
      employeeId: emp.id,
      employeeName: emp.full_name,
      employeeNo: emp.employee_no || '',
      departmentName: emp.department?.department_name || '-',
      skills: empSkillMap.get(emp.id) || [],
      currentShift,
      laborWarnings,
    });
  });

  // Sort: employees with matching skill first, then by warning count (less warnings first)
  if (skillId) {
    const { data: skillRow } = await supabase
      .from('skill')
      .select('skill_name')
      .eq('id', skillId)
      .limit(1)
      .single();
    const targetSkillName = skillRow?.skill_name || '';
    if (targetSkillName) {
      eligible.sort((a, b) => {
        const aHas = a.skills.includes(targetSkillName) ? 0 : 1;
        const bHas = b.skills.includes(targetSkillName) ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return (a.laborWarnings?.length || 0) - (b.laborWarnings?.length || 0);
      });
    }
  } else {
    eligible.sort((a, b) => (a.laborWarnings?.length || 0) - (b.laborWarnings?.length || 0));
  }

  return eligible;
}

/* ========== Signups ========== */

/** List signups for an urgent shift */
export async function listSignups(urgentShiftId: string): Promise<UrgentShiftSignupRecord[]> {
  const { data, error } = await supabase
    .from('urgent_shift_signup')
    .select('*, employee:employee_id(full_name, employee_no, department:department_id(department_name))')
    .eq('urgent_shift_id', urgentShiftId)
    .order('created_at', { ascending: false });

  if (error) throw toAppError(error, '加载报名列表失败');
  return (data || []).map(mapSignup);
}

/** Employee signup (from mini-program) */
export async function employeeSignup(
  urgentShiftId: string,
  employeeId: string,
  remark?: string,
): Promise<void> {
  // Check deadline
  const { data: shift } = await supabase
    .from('urgent_shift')
    .select('signup_deadline, status, required_count')
    .eq('id', urgentShiftId)
    .single();

  if (!shift) throw new AppError('未找到该紧急班次', 'NOT_FOUND');
  if (shift.status !== 'open') throw new AppError('该班次已关闭或取消', 'SHIFT_CLOSED');
  if (new Date(shift.signup_deadline) < new Date()) throw new AppError('已超过报名截止时间', 'DEADLINE_PASSED');

  // Check if already signed up
  const { data: existing } = await supabase
    .from('urgent_shift_signup')
    .select('id, status')
    .eq('urgent_shift_id', urgentShiftId)
    .eq('employee_id', employeeId)
    .limit(1);

  if (existing && existing.length > 0) {
    const s = existing[0];
    if (s.status === 'cancelled') {
      // Re-sign up
      await supabase.from('urgent_shift_signup').update({ status: 'pending', remark: remark || null }).eq('id', s.id);
      return;
    }
    throw new AppError('您已报名该班次', 'ALREADY_SIGNED_UP');
  }

  const { error } = await supabase.from('urgent_shift_signup').insert({
    urgent_shift_id: urgentShiftId,
    employee_id: employeeId,
    remark: remark || null,
  });
  if (error) throw toAppError(error, '报名失败');
}

/** Approve or reject a signup */
export async function approveSignup(
  signupId: string,
  action: 'approve' | 'reject',
  operatorId: string,
  comment?: string,
): Promise<void> {
  // Get signup + shift info
  const { data: signup, error: sErr } = await supabase
    .from('urgent_shift_signup')
    .select('*, urgent_shift:urgent_shift_id(*)')
    .eq('id', signupId)
    .single();

  if (sErr || !signup) throw toAppError(sErr || new Error('未找到报名记录'), '审批失败');
  if (signup.status !== 'pending') throw new AppError('该报名已处理', 'ALREADY_PROCESSED');

  const newStatus = action === 'approve' ? 'approved' : 'rejected';

  // Update signup status
  await supabase.from('urgent_shift_signup').update({
    status: newStatus,
    approval_comment: comment || null,
    approved_by_user_account_id: operatorId,
    approved_at: new Date().toISOString(),
  }).eq('id', signupId);

  // If approved, create/update schedule record
  if (action === 'approve') {
    const shift = signup.urgent_shift;
    await createOrUpdateScheduleForApproval(
      signup.employee_id,
      shift.shift_date,
      shift.start_time,
      shift.end_time,
      shift.project_id,
    );
  }

  // Send result notification to employee
  const shift = signup.urgent_shift;
  await supabase.from('employee_message').insert({
    employee_id: signup.employee_id,
    msg_type: 'urgent_shift',
    title: action === 'approve'
      ? `报名通过：${shift.title}`
      : `报名未通过：${shift.title}`,
    content: action === 'approve'
      ? `您报名的「${shift.title}」(${shift.shift_date} ${shift.start_time}-${shift.end_time}) 已通过审批，请按时出勤。`
      : `您报名的「${shift.title}」(${shift.shift_date} ${shift.start_time}-${shift.end_time}) 未通过审批。${comment ? '原因：' + comment : ''}`,
    extra_data: { urgent_shift_id: shift.id },
  });
}

/**
 * Create or update a schedule record after approval.
 * If employee has a '休' shift on that day, change it to the urgent shift.
 * If no record exists, create a new one.
 */
async function createOrUpdateScheduleForApproval(
  employeeId: string,
  shiftDate: string,
  startTime: string,
  endTime: string,
  projectId: string,
) {
  // Find a matching schedule code by start_time and end_time
  const { data: dictTypes } = await supabase
    .from('dict_type')
    .select('id, type_code');
  const schedType = (dictTypes || []).find(
    (t: any) => t.type_code === 'schedule_code' || t.type_code === 'shift_code' || t.type_code === 'schedule_type',
  );

  let bestCodeId: string | null = null;
  let bestHours = 0;
  if (schedType) {
    const { data: codes } = await supabase
      .from('dict_item')
      .select('id, extra_config')
      .eq('dict_type_id', schedType.id);

    // Find best matching code by time
    (codes || []).forEach((c: any) => {
      const extra = c.extra_config || {};
      if (extra.start_time === startTime && extra.end_time === endTime) {
        bestCodeId = c.id;
        bestHours = extra.hours || 0;
      }
    });

    // If no exact match, find closest or use first non-rest code
    if (!bestCodeId) {
      const nonRest = (codes || []).find((c: any) => {
        const cat = c.extra_config?.category;
        return cat !== 'rest' && cat !== 'leave';
      });
      if (nonRest) {
        bestCodeId = nonRest.id;
        bestHours = nonRest.extra_config?.hours || 0;
      }
    }
  }

  // Calculate hours from time
  if (!bestHours && startTime && endTime) {
    const toMin = (t: string) => { const p = t.split(':'); return parseInt(p[0]) * 60 + parseInt(p[1] || '0'); };
    bestHours = Math.max(0, (toMin(endTime) - toMin(startTime)) / 60);
  }

  // Get employee department
  const { data: emp } = await supabase
    .from('employee')
    .select('department_id')
    .eq('id', employeeId)
    .single();

  // Find existing schedule on that date for this employee
  const { data: existingSchedules } = await supabase
    .from('schedule')
    .select('id, schedule_code_dict_item_id')
    .eq('employee_id', employeeId)
    .eq('schedule_date', shiftDate);

  // Check if employee has rest schedule
  let restScheduleId: string | null = null;
  if (existingSchedules && existingSchedules.length > 0 && schedType) {
    const { data: restCodes } = await supabase
      .from('dict_item')
      .select('id, extra_config')
      .eq('dict_type_id', schedType.id);

    const restCodeIds = new Set(
      (restCodes || [])
        .filter((c: any) => c.extra_config?.category === 'rest' || c.extra_config?.category === 'leave')
        .map((c: any) => c.id),
    );

    const restSched = existingSchedules.find((s: any) => restCodeIds.has(s.schedule_code_dict_item_id));
    if (restSched) restScheduleId = restSched.id;
  }

  if (restScheduleId && bestCodeId) {
    // Update existing rest schedule to the urgent shift
    await supabase.from('schedule').update({
      schedule_code_dict_item_id: bestCodeId,
      planned_hours: bestHours,
      project_id: projectId,
      source_type: 'manual',
      remark: '紧急临时班次审批通过',
    }).eq('id', restScheduleId);
  } else if (bestCodeId) {
    // Get an active version for this project (latest)
    const { data: versions } = await supabase
      .from('schedule_version')
      .select('id')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1);

    const versionId = versions?.[0]?.id;
    if (!versionId) return; // No version — cannot create

    // Create new schedule record
    await supabase.from('schedule').insert({
      schedule_version_id: versionId,
      employee_id: employeeId,
      department_id: emp?.department_id || null,
      project_id: projectId,
      schedule_date: shiftDate,
      schedule_code_dict_item_id: bestCodeId,
      planned_hours: bestHours,
      source_type: 'manual',
      remark: '紧急临时班次审批通过',
    });
  }
}

/* ========== Message / Notification ========== */

/**
 * Send urgent shift notifications to eligible employees.
 * Automatically filters out employees who have time conflicts on that date.
 */
export async function sendUrgentShiftNotifications(
  urgentShiftId: string,
  employeeIds: string[],
): Promise<number> {
  if (employeeIds.length === 0) return 0;

  // Get shift info
  const { data: shift } = await supabase
    .from('urgent_shift')
    .select('*, project:project_id(project_name)')
    .eq('id', urgentShiftId)
    .single();

  if (!shift) throw new AppError('未找到该紧急班次', 'NOT_FOUND');

  // Filter out employees with time conflicts before sending
  const eligible = await findEligibleEmployees(
    shift.shift_date, shift.start_time, shift.end_time, shift.skill_id,
  );
  const eligibleIdSet = new Set(eligible.map(e => e.employeeId));
  const filteredIds = employeeIds.filter(id => eligibleIdSet.has(id));

  if (filteredIds.length === 0) return 0;

  const messages = filteredIds.map(eid => ({
    employee_id: eid,
    msg_type: 'urgent_shift',
    title: `紧急班次招募：${shift.title}`,
    content: `${shift.shift_date} ${shift.start_time}-${shift.end_time}，${shift.project?.project_name || ''}项目需要人手，需求${shift.required_count}人，点击查看详情并报名。`,
    extra_data: { urgent_shift_id: shift.id },
    is_read: false,
  }));

  const { error } = await supabase.from('employee_message').insert(messages);
  if (error) throw toAppError(error, '发送通知失败');

  return filteredIds.length;
}

/** Get unread message count for an employee */
export async function getUnreadMessageCount(employeeId: string): Promise<number> {
  const { count, error } = await supabase
    .from('employee_message')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('is_read', false);

  if (error) return 0;
  return count || 0;
}

/** List messages for an employee */
export async function listEmployeeMessages(employeeId: string) {
  const { data, error } = await supabase
    .from('employee_message')
    .select('*')
    .eq('employee_id', employeeId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw toAppError(error, '加载消息失败');
  return (data || []).map((row: any) => ({
    id: row.id,
    employeeId: row.employee_id,
    msgType: row.msg_type,
    title: row.title,
    content: row.content,
    extraData: row.extra_data,
    isRead: row.is_read,
    createdAt: row.created_at,
  }));
}
