import { supabase } from '@/app/lib/supabase/client';

// ====== Types ======

export type LaborRule = {
  id: string;
  ruleName: string;
  applicableScope: ApplicableScope | null;
  priority: number | null;
  dailyHoursLimit: number | null;
  weeklyHoursLimit: number | null;
  monthlyHoursLimit: number | null;
  maxConsecutiveWorkDays: number | null;
  minShiftIntervalHours: number | null;
  isHardConstraint: boolean;
  isEnabled: boolean;
  remark: string | null;
};

export type ApplicableScope = {
  type: 'all' | 'project' | 'department' | 'labor_relation';
  projectIds?: string[];
  departmentIds?: string[];
  laborRelationDictItemIds?: string[];
};

export type ScheduleViolation = {
  ruleId: string;
  ruleName: string;
  isHard: boolean;
  type: 'daily_hours' | 'weekly_hours' | 'monthly_hours' | 'consecutive_days' | 'shift_interval';
  message: string;
  detail: {
    employeeId: string;
    employeeName?: string;
    date?: string;
    currentValue: number;
    limitValue: number;
  };
};

export type ValidationResult = {
  passed: boolean;
  hardViolations: ScheduleViolation[];
  softViolations: ScheduleViolation[];
};

// ====== Row → Model mapping ======

function mapRow(row: any): LaborRule {
  return {
    id: row.id,
    ruleName: row.rule_name,
    applicableScope: row.applicable_scope ?? null,
    priority: row.priority,
    dailyHoursLimit: row.daily_hours_limit != null ? Number(row.daily_hours_limit) : null,
    weeklyHoursLimit: row.weekly_hours_limit != null ? Number(row.weekly_hours_limit) : null,
    monthlyHoursLimit: row.monthly_hours_limit != null ? Number(row.monthly_hours_limit) : null,
    maxConsecutiveWorkDays: row.max_consecutive_work_days,
    minShiftIntervalHours: row.min_shift_interval_hours != null ? Number(row.min_shift_interval_hours) : null,
    isHardConstraint: !!row.is_hard_constraint,
    isEnabled: row.is_enabled !== false,
    remark: row.remark,
  };
}

// ====== CRUD ======

export async function listLaborRules(): Promise<LaborRule[]> {
  const { data, error } = await supabase
    .from('labor_rule')
    .select('*')
    .order('priority', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []).map(mapRow);
}

export async function createLaborRule(payload: {
  ruleName: string;
  applicableScope: ApplicableScope;
  priority?: number;
  dailyHoursLimit?: number | null;
  weeklyHoursLimit?: number | null;
  monthlyHoursLimit?: number | null;
  maxConsecutiveWorkDays?: number | null;
  minShiftIntervalHours?: number | null;
  isHardConstraint?: boolean;
  remark?: string;
}): Promise<LaborRule> {
  const { data, error } = await supabase
    .from('labor_rule')
    .insert({
      rule_name: payload.ruleName,
      applicable_scope: payload.applicableScope,
      priority: payload.priority ?? 100,
      daily_hours_limit: payload.dailyHoursLimit ?? null,
      weekly_hours_limit: payload.weeklyHoursLimit ?? null,
      monthly_hours_limit: payload.monthlyHoursLimit ?? null,
      max_consecutive_work_days: payload.maxConsecutiveWorkDays ?? null,
      min_shift_interval_hours: payload.minShiftIntervalHours ?? null,
      is_hard_constraint: payload.isHardConstraint ?? false,
      is_enabled: true,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return mapRow(data);
}

export async function updateLaborRule(id: string, payload: {
  ruleName?: string;
  applicableScope?: ApplicableScope;
  priority?: number;
  dailyHoursLimit?: number | null;
  weeklyHoursLimit?: number | null;
  monthlyHoursLimit?: number | null;
  maxConsecutiveWorkDays?: number | null;
  minShiftIntervalHours?: number | null;
  isHardConstraint?: boolean;
  isEnabled?: boolean;
  remark?: string | null;
}): Promise<void> {
  const updates: any = { updated_at: new Date().toISOString() };
  if (payload.ruleName !== undefined) updates.rule_name = payload.ruleName;
  if (payload.applicableScope !== undefined) updates.applicable_scope = payload.applicableScope;
  if (payload.priority !== undefined) updates.priority = payload.priority;
  if (payload.dailyHoursLimit !== undefined) updates.daily_hours_limit = payload.dailyHoursLimit;
  if (payload.weeklyHoursLimit !== undefined) updates.weekly_hours_limit = payload.weeklyHoursLimit;
  if (payload.monthlyHoursLimit !== undefined) updates.monthly_hours_limit = payload.monthlyHoursLimit;
  if (payload.maxConsecutiveWorkDays !== undefined) updates.max_consecutive_work_days = payload.maxConsecutiveWorkDays;
  if (payload.minShiftIntervalHours !== undefined) updates.min_shift_interval_hours = payload.minShiftIntervalHours;
  if (payload.isHardConstraint !== undefined) updates.is_hard_constraint = payload.isHardConstraint;
  if (payload.isEnabled !== undefined) updates.is_enabled = payload.isEnabled;
  if (payload.remark !== undefined) updates.remark = payload.remark;

  const { error } = await supabase.from('labor_rule').update(updates).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteLaborRule(id: string): Promise<void> {
  const { error } = await supabase.from('labor_rule').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function toggleLaborRule(id: string, isEnabled: boolean): Promise<void> {
  await updateLaborRule(id, { isEnabled });
}

// ====== Matching ======

/** Get all enabled rules applicable to a given project + department + laborRelation */
export async function getApplicableRules(
  projectId?: string,
  departmentId?: string,
  laborRelationDictItemId?: string,
): Promise<LaborRule[]> {
  const allRules = await listLaborRules();
  const enabledRules = allRules.filter(r => r.isEnabled);

  return enabledRules.filter(rule => {
    const scope = rule.applicableScope;
    if (!scope || scope.type === 'all') return true;
    if (scope.type === 'project' && scope.projectIds?.length) {
      return projectId ? scope.projectIds.includes(projectId) : false;
    }
    if (scope.type === 'department' && scope.departmentIds?.length) {
      return departmentId ? scope.departmentIds.includes(departmentId) : false;
    }
    if (scope.type === 'labor_relation' && scope.laborRelationDictItemIds?.length) {
      return laborRelationDictItemId ? scope.laborRelationDictItemIds.includes(laborRelationDictItemId) : false;
    }
    return true;
  }).sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
}

// ====== Validation: Schedule Batch ======

type ScheduleEntry = {
  employeeId: string;
  employeeName?: string;
  date: string; // YYYY-MM-DD
  plannedHours: number;
  isWorkDay: boolean; // true if code category is 'work'
  startTime?: string; // HH:mm — for shift interval check
  endTime?: string;   // HH:mm — for shift interval check
};

/**
 * Validate a batch of schedule entries against applicable rules.
 * Used by: schedule matrix save, Excel import.
 */
export async function validateScheduleBatch(
  entries: ScheduleEntry[],
  projectId?: string,
  departmentId?: string,
  laborRelationDictItemId?: string,
): Promise<ValidationResult> {
  const rules = await getApplicableRules(projectId, departmentId, laborRelationDictItemId);
  if (rules.length === 0) {
    return { passed: true, hardViolations: [], softViolations: [] };
  }

  const hardViolations: ScheduleViolation[] = [];
  const softViolations: ScheduleViolation[] = [];

  // Group entries by employee
  const byEmployee = new Map<string, ScheduleEntry[]>();
  for (const e of entries) {
    if (!byEmployee.has(e.employeeId)) byEmployee.set(e.employeeId, []);
    byEmployee.get(e.employeeId)!.push(e);
  }

  for (const rule of rules) {
    for (const [empId, empEntries] of byEmployee) {
      const empName = empEntries[0]?.employeeName || empId.substring(0, 8);

      // 1. Daily hours check
      if (rule.dailyHoursLimit != null) {
        for (const entry of empEntries) {
          if (entry.plannedHours > rule.dailyHoursLimit) {
            const v: ScheduleViolation = {
              ruleId: rule.id,
              ruleName: rule.ruleName,
              isHard: rule.isHardConstraint,
              type: 'daily_hours',
              message: `${empName} 在 ${entry.date} 工时 ${entry.plannedHours}h 超过日上限 ${rule.dailyHoursLimit}h`,
              detail: {
                employeeId: empId,
                employeeName: empName,
                date: entry.date,
                currentValue: entry.plannedHours,
                limitValue: rule.dailyHoursLimit,
              },
            };
            if (rule.isHardConstraint) hardViolations.push(v);
            else softViolations.push(v);
          }
        }
      }

      // 2. Weekly hours check
      if (rule.weeklyHoursLimit != null) {
        const weeklyHours = calculateWeeklyHours(empEntries);
        for (const [weekKey, totalHours] of weeklyHours) {
          if (totalHours > rule.weeklyHoursLimit) {
            const v: ScheduleViolation = {
              ruleId: rule.id,
              ruleName: rule.ruleName,
              isHard: rule.isHardConstraint,
              type: 'weekly_hours',
              message: `${empName} 在第${weekKey}周工时 ${totalHours.toFixed(1)}h 超过周上限 ${rule.weeklyHoursLimit}h`,
              detail: {
                employeeId: empId,
                employeeName: empName,
                date: weekKey,
                currentValue: totalHours,
                limitValue: rule.weeklyHoursLimit,
              },
            };
            if (rule.isHardConstraint) hardViolations.push(v);
            else softViolations.push(v);
          }
        }
      }

      // 3. Consecutive work days check
      if (rule.maxConsecutiveWorkDays != null) {
        const maxConsec = findMaxConsecutiveWorkDays(empEntries);
        if (maxConsec.count > rule.maxConsecutiveWorkDays) {
          const v: ScheduleViolation = {
            ruleId: rule.id,
            ruleName: rule.ruleName,
            isHard: rule.isHardConstraint,
            type: 'consecutive_days',
            message: `${empName} 连续工作 ${maxConsec.count} 天（${maxConsec.startDate} 起），超过上限 ${rule.maxConsecutiveWorkDays} 天`,
            detail: {
              employeeId: empId,
              employeeName: empName,
              date: maxConsec.startDate,
              currentValue: maxConsec.count,
              limitValue: rule.maxConsecutiveWorkDays,
            },
          };
          if (rule.isHardConstraint) hardViolations.push(v);
          else softViolations.push(v);
        }
      }

      // 4. Monthly hours check
      if (rule.monthlyHoursLimit != null) {
        const totalMonthlyHours = empEntries.reduce((sum, e) => sum + e.plannedHours, 0);
        if (totalMonthlyHours > rule.monthlyHoursLimit) {
          const v: ScheduleViolation = {
            ruleId: rule.id,
            ruleName: rule.ruleName,
            isHard: rule.isHardConstraint,
            type: 'monthly_hours',
            message: `${empName} 月度总工时 ${totalMonthlyHours.toFixed(1)}h 超过上限 ${rule.monthlyHoursLimit}h`,
            detail: {
              employeeId: empId,
              employeeName: empName,
              date: empEntries[0]?.date,
              currentValue: totalMonthlyHours,
              limitValue: rule.monthlyHoursLimit,
            },
          };
          if (rule.isHardConstraint) hardViolations.push(v);
          else softViolations.push(v);
        }
      }

      // 5. Shift interval check
      if (rule.minShiftIntervalHours != null) {
        const intervalViolations = checkShiftInterval(empEntries, rule.minShiftIntervalHours);
        for (const iv of intervalViolations) {
          const v: ScheduleViolation = {
            ruleId: rule.id,
            ruleName: rule.ruleName,
            isHard: rule.isHardConstraint,
            type: 'shift_interval',
            message: `${empName} 在 ${iv.date1} → ${iv.date2} 班次间隔仅 ${iv.actualHours.toFixed(1)}h，低于下限 ${rule.minShiftIntervalHours}h`,
            detail: {
              employeeId: empId,
              employeeName: empName,
              date: iv.date2,
              currentValue: iv.actualHours,
              limitValue: rule.minShiftIntervalHours,
            },
          };
          if (rule.isHardConstraint) hardViolations.push(v);
          else softViolations.push(v);
        }
      }
    }
  }

  return {
    passed: hardViolations.length === 0,
    hardViolations,
    softViolations,
  };
}

// ====== Validation: Single Employee (for shift change) ======

/**
 * Validate a single employee's schedule after a proposed change.
 * Fetches existing schedule from DB and merges with proposed change.
 */
export async function validateShiftChange(params: {
  employeeId: string;
  employeeName: string;
  changeDate: string;
  newPlannedHours: number;
  newIsWorkDay: boolean;
  scheduleVersionId: string;
  projectId?: string;
  departmentId?: string;
  laborRelationDictItemId?: string;
}): Promise<ValidationResult> {
  // Get existing schedule for the employee around the change date (±7 days for weekly/consecutive check)
  const changeDate = new Date(params.changeDate);
  const startDate = new Date(changeDate);
  startDate.setDate(startDate.getDate() - 7);
  const endDate = new Date(changeDate);
  endDate.setDate(endDate.getDate() + 7);

  const { data: existingSchedules } = await supabase
    .from('schedule')
    .select('schedule_date, planned_hours, schedule_code:schedule_code_dict_item_id(extra_config)')
    .eq('employee_id', params.employeeId)
    .eq('schedule_version_id', params.scheduleVersionId)
    .gte('schedule_date', startDate.toISOString().split('T')[0])
    .lte('schedule_date', endDate.toISOString().split('T')[0]);

  // Build entries, overriding the change date
  const entries: ScheduleEntry[] = (existingSchedules || []).map((s: any) => {
    const isChange = s.schedule_date === params.changeDate;
    const extraConfig = s.schedule_code?.extra_config || {};
    return {
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      date: s.schedule_date,
      plannedHours: isChange ? params.newPlannedHours : Number(s.planned_hours || 0),
      isWorkDay: isChange ? params.newIsWorkDay : (extraConfig.category === 'work'),
    };
  });

  // If the change date doesn't exist in DB yet, add it
  if (!entries.some(e => e.date === params.changeDate)) {
    entries.push({
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      date: params.changeDate,
      plannedHours: params.newPlannedHours,
      isWorkDay: params.newIsWorkDay,
    });
  }

  return validateScheduleBatch(entries, params.projectId, params.departmentId, params.laborRelationDictItemId);
}

// ====== Helpers ======

/** Calculate total hours per ISO week */
function calculateWeeklyHours(entries: ScheduleEntry[]): Map<string, number> {
  const weekMap = new Map<string, number>();
  for (const e of entries) {
    const d = new Date(e.date);
    // ISO week: get Monday of this week
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const weekKey = monday.toISOString().split('T')[0];
    weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + e.plannedHours);
  }
  return weekMap;
}

/** Find the longest consecutive work day stretch */
function findMaxConsecutiveWorkDays(entries: ScheduleEntry[]): { count: number; startDate: string } {
  // Sort by date
  const sorted = [...entries]
    .filter(e => e.isWorkDay)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) return { count: 0, startDate: '' };

  let maxCount = 1;
  let maxStart = sorted[0].date;
  let currentCount = 1;
  let currentStart = sorted[0].date;

  for (let i = 1; i < sorted.length; i++) {
    const prevDate = new Date(sorted[i - 1].date);
    const currDate = new Date(sorted[i].date);
    const diffDays = Math.round((currDate.getTime() - prevDate.getTime()) / (86400000));

    if (diffDays === 1) {
      currentCount++;
    } else {
      currentCount = 1;
      currentStart = sorted[i].date;
    }

    if (currentCount > maxCount) {
      maxCount = currentCount;
      maxStart = currentStart;
    }
  }

  return { count: maxCount, startDate: maxStart };
}

/** Check minimum interval between consecutive shifts */
function checkShiftInterval(
  entries: ScheduleEntry[],
  minIntervalHours: number
): { date1: string; date2: string; actualHours: number }[] {
  // Only check work-day entries that have time info
  const workEntries = entries
    .filter(e => e.isWorkDay && e.endTime && e.startTime)
    .sort((a, b) => a.date.localeCompare(b.date));

  const violations: { date1: string; date2: string; actualHours: number }[] = [];

  for (let i = 0; i < workEntries.length - 1; i++) {
    const curr = workEntries[i];
    const next = workEntries[i + 1];

    // Only check consecutive days
    const d1 = new Date(curr.date);
    const d2 = new Date(next.date);
    const dayDiff = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    if (dayDiff !== 1) continue;

    // Parse times
    const [endH, endM] = (curr.endTime || '').split(':').map(Number);
    const [startH, startM] = (next.startTime || '').split(':').map(Number);
    if (isNaN(endH) || isNaN(startH)) continue;

    // Calculate interval between end of curr shift and start of next day's shift
    const endMinutes = endH * 60 + (endM || 0);
    const startMinutes = startH * 60 + (startM || 0);

    // 跨夜班次判断：当班次的结束时间 < 开始时间时，说明是跨夜班（如 22:00-06:00）
    // 此时结束时间实际落在下一个日历日（即 date2 当天），所以间隔 = 后一天开始 - 前一天下班（同一天内）
    const currStartMinutes = (() => {
      const [sh, sm] = (curr.startTime || '').split(':').map(Number);
      return (isNaN(sh) ? 0 : sh) * 60 + (sm || 0);
    })();
    const isOvernightShift = endMinutes < currStartMinutes;

    let intervalMinutes: number;
    if (isOvernightShift) {
      // 跨夜班：结束时间落在 date2 当天（如 date1 22:00-02:00，实际02:00是date2凌晨）
      // 间隔 = date2的上班时间 - date2凌晨的下班时间
      intervalMinutes = startMinutes - endMinutes;
    } else {
      // 正常班次：shift 在 date1 当天结束
      // 间隔 = (24h - date1 下班时间) + date2 上班时间
      intervalMinutes = (24 * 60 - endMinutes) + startMinutes;
    }

    const actualHours = intervalMinutes / 60;
    if (actualHours < minIntervalHours) {
      violations.push({
        date1: curr.date,
        date2: next.date,
        actualHours,
      });
    }
  }

  return violations;
}
