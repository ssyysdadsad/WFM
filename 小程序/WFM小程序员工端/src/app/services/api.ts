import { supabase } from './supabase';

// ============ Types ============
export type EmployeeProfile = {
  id: string;
  name: string;
  no: string;
  department: string;
  departmentId: string;
  channelId: string;
  phone: string;
  onboardDate: string;
  position: string;
  mustChangePassword: boolean;
};

// ============ Session helpers ============
export function getAccessToken(): string | null {
  // Supabase handles tokens internally
  return null;
}

let cachedEmployee: EmployeeProfile | null = null;

export function getEmployee(): EmployeeProfile | null {
  if (cachedEmployee) return cachedEmployee;
  const s = localStorage.getItem('wfm_employee');
  return s ? JSON.parse(s) : null;
}

export function saveEmployee(emp: EmployeeProfile) {
  cachedEmployee = emp;
  localStorage.setItem('wfm_employee', JSON.stringify(emp));
}

export function clearSession() {
  cachedEmployee = null;
  localStorage.removeItem('wfm_employee');
}

// ============ Auth ============
export async function login(phone: string, password: string) {
  // Try email-based auth first (accounts created as phone@wfm.local)
  const email = `${phone}@wfm.local`;
  let data: any = null;
  let error: any = null;

  const emailResult = await supabase.auth.signInWithPassword({ email, password });
  if (!emailResult.error) {
    data = emailResult.data;
  } else {
    // Fallback to phone auth
    const phoneResult = await supabase.auth.signInWithPassword({ phone, password });
    if (!phoneResult.error) {
      data = phoneResult.data;
    } else {
      error = phoneResult.error;
    }
  }

  if (error || !data) {
    return { success: false, message: `登录失败: ${error?.message || '未知错误'}` };
  }

  // Lookup user_account + employee
  const authUserId = data.user.id;
  const { data: account, error: accErr } = await supabase
    .from('user_account')
    .select('id, employee_id, must_change_password, mobile_number')
    .eq('auth_user_id', authUserId)
    .eq('is_enabled', true)
    .limit(1)
    .single();

  if (accErr || !account) {
    return { success: false, message: '未找到关联的员工账号' };
  }

  let employee: EmployeeProfile | null = null;
  if (account.employee_id) {
    const { data: emp } = await supabase
      .from('employee')
      .select('id, full_name, employee_no, department_id, channel_id, mobile_number, onboard_date')
      .eq('id', account.employee_id)
      .limit(1)
      .single();

    if (emp) {
      // Get department name
      let deptName = '';
      if (emp.department_id) {
        const { data: dept } = await supabase
          .from('department')
          .select('department_name')
          .eq('id', emp.department_id)
          .limit(1)
          .single();
        deptName = dept?.department_name || '';
      }

      employee = {
        id: emp.id,
        name: emp.full_name,
        no: emp.employee_no,
        department: deptName,
        departmentId: emp.department_id || '',
        channelId: emp.channel_id || '',
        phone: emp.mobile_number || '',
        onboardDate: emp.onboard_date || '',
        position: '',
        mustChangePassword: account.must_change_password,
      };
      saveEmployee(employee);
    }
  }

  return {
    success: true,
    data: {
      user: data.user,
      employee,
      mustChangePassword: account.must_change_password,
    },
  };
}

export async function changePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { success: false, message: `修改密码失败: ${error.message}` };
  }

  // Clear must_change_password flag
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from('user_account')
      .update({ must_change_password: false })
      .eq('auth_user_id', user.id);
  }

  return { success: true, message: '密码修改成功' };
}

// ============ Profile ============
export async function getMe() {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { success: false, message: '未认证' };
  }

  const { data: account } = await supabase
    .from('user_account')
    .select('id, employee_id, must_change_password')
    .eq('auth_user_id', user.id)
    .eq('is_enabled', true)
    .limit(1)
    .single();

  if (!account?.employee_id) {
    return { success: false, message: '未找到员工信息' };
  }

  const { data: emp } = await supabase
    .from('employee')
    .select('id, full_name, employee_no, department_id, channel_id, mobile_number, onboard_date')
    .eq('id', account.employee_id)
    .limit(1)
    .single();

  if (!emp) {
    return { success: false, message: '未找到员工信息' };
  }

  let deptName = '';
  if (emp.department_id) {
    const { data: dept } = await supabase
      .from('department')
      .select('department_name')
      .eq('id', emp.department_id)
      .limit(1)
      .single();
    deptName = dept?.department_name || '';
  }

  // Get skills
  let primarySkill = '';
  let skillLevel = '';
  const { data: skills } = await supabase
    .from('employee_skill')
    .select('skill_id, skill_level, is_primary')
    .eq('employee_id', emp.id)
    .eq('is_primary', true)
    .limit(1);
  if (skills && skills.length > 0) {
    const { data: sk } = await supabase
      .from('skill')
      .select('skill_name')
      .eq('id', skills[0].skill_id)
      .limit(1)
      .single();
    primarySkill = sk?.skill_name || '';
    const lvMap: Record<number, string> = { 1: '初级', 2: '中级', 3: '高级' };
    skillLevel = lvMap[skills[0].skill_level] || '';
  }

  // Work metrics
  const { data: metrics } = await supabase
    .from('employee_work_metric')
    .select('*')
    .eq('employee_id', emp.id)
    .limit(1)
    .maybeSingle();

  const employee: EmployeeProfile = {
    id: emp.id,
    name: emp.full_name,
    no: emp.employee_no,
    department: deptName,
    departmentId: emp.department_id || '',
    channelId: emp.channel_id || '',
    phone: emp.mobile_number || '',
    onboardDate: emp.onboard_date || '',
    position: primarySkill ? `${primarySkill} · ${skillLevel}` : '',
    mustChangePassword: account.must_change_password,
  };
  saveEmployee(employee);

  return {
    success: true,
    data: {
      employee,
      metrics: metrics ? {
        avg7d: Number(metrics.avg_daily_hours_7d) || 0,
        avg30d: Number(metrics.avg_daily_hours_30d) || 0,
        avgShift30d: Number(metrics.avg_shift_hours_30d) || 0,
        avgWeek30d: Number(metrics.avg_weekly_hours_30d) || 0,
        total: Number(metrics.total_hours) || 0,
        monthPlanned: 0,
        monthCompleted: 0,
      } : null,
    },
  };
}

// ============ Schedule ============
export async function getSchedule(month: string) {
  const emp = getEmployee();
  if (!emp) return { success: false, message: '未登录', data: { schedule: {}, shiftTypes: {} } };

  // Parse YYYY-MM to get date range
  const [year, mon] = month.split('-').map(Number);
  const startDate = `${month}-01`;
  const daysInMonth = new Date(year, mon, 0).getDate();
  const endDate = `${month}-${String(daysInMonth).padStart(2, '0')}`;

  // Get schedule records for this employee in this month
  // We need the latest published version's schedules
  const { data: rows, error } = await supabase
    .from('schedule')
    .select('schedule_date, schedule_code_dict_item_id, shift_type_dict_item_id, planned_hours, project_id, task_id, device_id')
    .eq('employee_id', emp.id)
    .gte('schedule_date', startDate)
    .lte('schedule_date', endDate)
    .order('schedule_date');

  if (error) {
    console.error('Schedule query error:', error);
    return { success: false, message: error.message, data: { schedule: {}, shiftTypes: {} } };
  }

  // Get shift types config at the same time
  const shiftTypes = await getShiftTypesConfig();

  // Get code items (schedule_code)
  const { data: dtList } = await supabase
    .from('dict_type')
    .select('id, type_code')
    .order('sort_order');
  const schedTypeId = (dtList || []).find(
    (t: any) => t.type_code === 'schedule_code' || t.type_code === 'shift_code' || t.type_code === 'schedule_type'
  )?.id;

  let codeItems: any[] = [];
  if (schedTypeId) {
    const { data: items } = await supabase
      .from('dict_item')
      .select('id, item_code, item_name, extra_config')
      .eq('dict_type_id', schedTypeId)
      .eq('is_enabled', true)
      .order('sort_order');
    codeItems = items || [];
  }

  // Build code map
  const codeMap: Record<string, any> = {};
  codeItems.forEach((c: any) => { codeMap[c.id] = c; });

  // Get shift_type items for time info
  const shiftTypeId = (dtList || []).find((t: any) => t.type_code === 'shift_type')?.id;
  let shiftItems: any[] = [];
  if (shiftTypeId) {
    const { data: items } = await supabase
      .from('dict_item')
      .select('id, item_code, item_name, extra_config')
      .eq('dict_type_id', shiftTypeId)
      .eq('is_enabled', true);
    shiftItems = items || [];
  }
  const shiftItemMap: Record<string, any> = {};
  shiftItems.forEach((s: any) => { shiftItemMap[s.item_code] = s; });

  // Get project name
  let projectMap: Record<string, string> = {};
  if (rows && rows.length > 0) {
    const projectIds = [...new Set(rows.filter(r => r.project_id).map(r => r.project_id))];
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('project')
        .select('id, project_name')
        .in('id', projectIds);
      (projects || []).forEach((p: any) => { projectMap[p.id] = p.project_name; });
    }
  }

  // Transform to { "1": { code, category, hours, time, project } } format
  const schedule: Record<string, any> = {};
  (rows || []).forEach(row => {
    const day = new Date(row.schedule_date).getDate();
    const code = codeMap[row.schedule_code_dict_item_id];
    const codeStr = code?.item_code || '-';
    const extra = code?.extra_config || {};
    const category = code ? (extra.category || 'work') : 'unknown';

    // Get time from linked shift type
    const relCode = extra.related_shift_type_item_code;
    const shiftItem = relCode ? shiftItemMap[relCode] : null;
    const shiftExtra = shiftItem?.extra_config || {};
    const startTime = shiftExtra.start_time || '';
    const endTime = shiftExtra.end_time || '';
    const timeStr = startTime && endTime ? `${startTime}-${endTime}` : '';

    schedule[String(day)] = {
      code: codeStr,
      category,
      hours: Number(row.planned_hours) || 0,
      time: timeStr,
      project: row.project_id ? (projectMap[row.project_id] || '') : '',
      projectId: row.project_id || '',
    };
  });

  return {
    success: true,
    data: {
      employee: { id: emp.id, name: emp.name, no: emp.no, department: emp.department },
      yearMonth: month,
      schedule,
      shiftTypes: shiftTypes.success ? shiftTypes.data : {},
    },
  };
}

// ============ Shift Types Config ============
export async function getShiftTypesConfig() {
  // Get schedule_code dict items + linked shift_type info
  const { data: dtList } = await supabase
    .from('dict_type')
    .select('id, type_code')
    .order('sort_order');

  const schedTypeId = (dtList || []).find(
    (t: any) => t.type_code === 'schedule_code' || t.type_code === 'shift_code' || t.type_code === 'schedule_type'
  )?.id;

  const shiftTypeId = (dtList || []).find((t: any) => t.type_code === 'shift_type')?.id;

  if (!schedTypeId) return { success: true, data: {} };

  const { data: codeItems } = await supabase
    .from('dict_item')
    .select('id, item_code, item_name, extra_config')
    .eq('dict_type_id', schedTypeId)
    .eq('is_enabled', true)
    .order('sort_order');

  let shiftItems: any[] = [];
  if (shiftTypeId) {
    const { data: items } = await supabase
      .from('dict_item')
      .select('id, item_code, item_name, extra_config')
      .eq('dict_type_id', shiftTypeId)
      .eq('is_enabled', true);
    shiftItems = items || [];
  }
  const shiftMap: Record<string, any> = {};
  shiftItems.forEach((s: any) => { shiftMap[s.item_code] = s; });

  // Color palette
  const PALETTE = [
    { bg: '#E8F5E9', text: '#2E7D32' },
    { bg: '#E3F2FD', text: '#1565C0' },
    { bg: '#FFF3E0', text: '#E65100' },
    { bg: '#F3E5F5', text: '#7B1FA2' },
    { bg: '#FFF8E1', text: '#F9A825' },
    { bg: '#FCE4EC', text: '#C62828' },
    { bg: '#E0F7FA', text: '#00838F' },
    { bg: '#EFEBE9', text: '#4E342E' },
  ];

  const result: Record<string, any> = {};
  (codeItems || []).forEach((c: any, i: number) => {
    const extra = c.extra_config || {};
    const category = extra.category || 'work';
    const relCode = extra.related_shift_type_item_code;
    const shift = relCode ? shiftMap[relCode] : null;
    const shiftExtra = shift?.extra_config || {};

    const isRest = category === 'rest' || category === 'leave';
    const color = extra.color
      ? { bg: extra.color + '20', text: extra.color }
      : isRest
        ? { bg: '#F5F5F5', text: '#9E9E9E' }
        : PALETTE[i % PALETTE.length];

    const startTime = shiftExtra.start_time || '';
    const endTime = shiftExtra.end_time || '';
    const hours = Number(shiftExtra.planned_hours || extra.standard_hours || 0);

    result[c.item_code] = {
      bg: color.bg,
      text: color.text,
      label: `${c.item_code} · ${c.item_name}`,
      category,
      hours,
      time: startTime && endTime ? `${startTime}-${endTime}` : '',
    };
  });

  return { success: true, data: result };
}

// ============ Announcements ============
export async function getAnnouncements(type?: string) {
  let query = supabase
    .from('announcement')
    .select('id, title, content, announcement_type_dict_item_id, published_at, visibility_scope_type')
    .order('published_at', { ascending: false });

  const { data: rows, error } = await query;
  if (error) return { success: true, data: [] };

  // Get type names
  const typeIds = [...new Set((rows || []).map(r => r.announcement_type_dict_item_id))];
  let typeMap: Record<string, string> = {};
  if (typeIds.length > 0) {
    const { data: types } = await supabase
      .from('dict_item')
      .select('id, item_name')
      .in('id', typeIds);
    (types || []).forEach((t: any) => { typeMap[t.id] = t.item_name; });
  }

  const announcements = (rows || []).map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    type: typeMap[r.announcement_type_dict_item_id] || '通知',
    typeCode: r.announcement_type_dict_item_id,
    date: r.published_at ? r.published_at.split('T')[0] : '',
  }));

  const filtered = type && type !== '全部'
    ? announcements.filter(a => a.type === type)
    : announcements;

  return { success: true, data: filtered };
}

export async function getAnnouncementDetail(id: string) {
  const { data, error } = await supabase
    .from('announcement')
    .select('id, title, content, announcement_type_dict_item_id, published_at')
    .eq('id', id)
    .limit(1)
    .single();

  if (error || !data) return { success: false, message: '公告不存在' };

  const { data: typeItem } = await supabase
    .from('dict_item')
    .select('item_name')
    .eq('id', data.announcement_type_dict_item_id)
    .limit(1)
    .single();

  return {
    success: true,
    data: {
      id: data.id,
      title: data.title,
      content: data.content,
      type: typeItem?.item_name || '通知',
      date: data.published_at ? data.published_at.split('T')[0] : '',
    },
  };
}

// ============ Shift Changes ============
export async function getShiftChanges(status?: string) {
  const emp = getEmployee();
  if (!emp) return { success: true, data: [] };

  let query = supabase
    .from('shift_change_request')
    .select('*')
    .eq('applicant_employee_id', emp.id)
    .order('created_at', { ascending: false });

  const { data: rows, error } = await query;
  if (error) return { success: true, data: [] };

  // Get approval status labels
  const statusIds = [...new Set((rows || []).map(r => r.approval_status_dict_item_id))];
  let statusNameMap: Record<string, string> = {};
  if (statusIds.length > 0) {
    const { data: items } = await supabase
      .from('dict_item')
      .select('id, item_code, item_name')
      .in('id', statusIds);
    (items || []).forEach((i: any) => { statusNameMap[i.id] = i.item_code; });
  }

  // Get target employee names
  const targetEmpIds = [...new Set((rows || []).filter(r => r.target_employee_id).map(r => r.target_employee_id))];
  let empNameMap: Record<string, string> = {};
  if (targetEmpIds.length > 0) {
    const { data: emps } = await supabase
      .from('employee')
      .select('id, full_name')
      .in('id', targetEmpIds);
    (emps || []).forEach((e: any) => { empNameMap[e.id] = e.full_name; });
  }

  // Get schedule code info for display
  const schedIds = [...new Set((rows || []).flatMap(r => [r.original_schedule_id, r.target_schedule_id]).filter(Boolean))];
  let schedCodeMap: Record<string, string> = {};
  let schedDateMap: Record<string, string> = {};
  if (schedIds.length > 0) {
    const { data: scheds } = await supabase
      .from('schedule')
      .select('id, schedule_date, schedule_code_dict_item_id')
      .in('id', schedIds);
    if (scheds) {
      const codeIds = [...new Set(scheds.map(s => s.schedule_code_dict_item_id))];
      let codeNameMap: Record<string, string> = {};
      if (codeIds.length > 0) {
        const { data: codes } = await supabase.from('dict_item').select('id, item_code').in('id', codeIds);
        (codes || []).forEach((c: any) => { codeNameMap[c.id] = c.item_code; });
      }
      scheds.forEach((s: any) => {
        schedCodeMap[s.id] = codeNameMap[s.schedule_code_dict_item_id] || '?';
        schedDateMap[s.id] = s.schedule_date;
      });
    }
  }

  const statusCodeToLabel: Record<string, string> = {
    pending: '待审批',
    approved: '已通过',
    rejected: '已拒绝',
  };

  const requests = (rows || []).map(r => {
    const statusCode = statusNameMap[r.approval_status_dict_item_id] || 'pending';
    return {
      id: r.id,
      type: r.request_type,
      applicantName: emp.name,
      originalDate: r.original_schedule_id ? schedDateMap[r.original_schedule_id] || '' : '',
      originalShift: r.original_schedule_id ? schedCodeMap[r.original_schedule_id] || '' : '',
      targetDate: r.target_schedule_id ? schedDateMap[r.target_schedule_id] || '' : (r.target_date || ''),
      targetShift: r.target_schedule_id ? schedCodeMap[r.target_schedule_id] || '' : '',
      targetEmployeeName: r.target_employee_id ? empNameMap[r.target_employee_id] || '' : null,
      reason: r.reason,
      status: statusCode,
      statusLabel: statusCodeToLabel[statusCode] || statusCode,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      approverComment: r.approval_comment,
    };
  });

  const filtered = status && status !== 'all'
    ? requests.filter(r => r.status === status)
    : requests;

  return { success: true, data: filtered };
}

export async function createShiftChange(body: {
  type: string;
  originalDate: string;
  originalShift: string;
  targetDate?: string;
  targetShift?: string;
  targetEmployeeId?: string;
  reason: string;
}) {
  const emp = getEmployee();
  if (!emp) return { success: false, message: '未登录' };

  // Find the original schedule record
  const { data: origSched } = await supabase
    .from('schedule')
    .select('id')
    .eq('employee_id', emp.id)
    .eq('schedule_date', body.originalDate)
    .limit(1)
    .maybeSingle();

  if (!origSched) {
    return { success: false, message: '未找到原排班记录' };
  }

  // Get 'pending' approval status dict item
  const { data: dtList } = await supabase
    .from('dict_type')
    .select('id, type_code');
  const approvalTypeId = (dtList || []).find((t: any) => t.type_code === 'approval_status')?.id;
  let pendingStatusId: string | null = null;
  if (approvalTypeId) {
    const { data: items } = await supabase
      .from('dict_item')
      .select('id, item_code')
      .eq('dict_type_id', approvalTypeId)
      .eq('item_code', 'pending')
      .limit(1)
      .maybeSingle();
    pendingStatusId = items?.id || null;
  }

  if (!pendingStatusId) {
    return { success: false, message: '系统配置异常：缺少审批状态字典' };
  }

  // Find target schedule if swap
  let targetScheduleId: string | null = null;
  if (body.type === 'swap' && body.targetEmployeeId && body.targetDate) {
    const { data: targetSched } = await supabase
      .from('schedule')
      .select('id')
      .eq('employee_id', body.targetEmployeeId)
      .eq('schedule_date', body.targetDate)
      .limit(1)
      .maybeSingle();
    targetScheduleId = targetSched?.id || null;
  }

  const { error } = await supabase
    .from('shift_change_request')
    .insert({
      request_type: body.type || 'direct_change',
      applicant_employee_id: emp.id,
      target_employee_id: body.targetEmployeeId || null,
      original_schedule_id: origSched.id,
      target_schedule_id: targetScheduleId,
      target_date: body.targetDate || body.originalDate,
      reason: body.reason,
      approval_status_dict_item_id: pendingStatusId,
    });

  if (error) {
    return { success: false, message: `提交失败: ${error.message}` };
  }

  return { success: true, message: '调班申请已提交' };
}

// ============ Work Metrics ============
export async function getWorkMetrics() {
  const emp = getEmployee();
  if (!emp) return { success: true, data: {} };

  const { data: metrics } = await supabase
    .from('employee_work_metric')
    .select('*')
    .eq('employee_id', emp.id)
    .limit(1)
    .maybeSingle();

  if (!metrics) return { success: true, data: {} };

  return {
    success: true,
    data: {
      avg7d: Number(metrics.avg_daily_hours_7d) || 0,
      avg30d: Number(metrics.avg_daily_hours_30d) || 0,
      avgShift30d: Number(metrics.avg_shift_hours_30d) || 0,
      avgWeek30d: Number(metrics.avg_weekly_hours_30d) || 0,
      total: Number(metrics.total_hours) || 0,
      monthPlanned: 0,
      monthCompleted: 0,
    },
  };
}

// ============ Employees (for swap) ============
export async function getEmployeeList() {
  const emp = getEmployee();
  if (!emp) return { success: true, data: [] };

  const { data: rows } = await supabase
    .from('employee')
    .select('id, full_name, employee_no, department_id')
    .neq('id', emp.id)
    .order('full_name');

  // Get department names
  const deptIds = [...new Set((rows || []).map(r => r.department_id).filter(Boolean))];
  let deptMap: Record<string, string> = {};
  if (deptIds.length > 0) {
    const { data: depts } = await supabase
      .from('department')
      .select('id, department_name')
      .in('id', deptIds);
    (depts || []).forEach((d: any) => { deptMap[d.id] = d.department_name; });
  }

  const employees = (rows || []).map(r => ({
    id: r.id,
    name: r.full_name,
    no: r.employee_no,
    department: deptMap[r.department_id] || '',
  }));

  return { success: true, data: employees };
}

// ============ Urgent Shift (临时班次) ============
export async function getUrgentShifts() {
  const emp = getEmployee();
  if (!emp) return { success: false, message: '未登录', data: [] };

  const { data: shifts, error } = await supabase
    .from('urgent_shift')
    .select('*, project:project_id(project_name)')
    .order('shift_date', { ascending: true });

  if (error) return { success: false, message: error.message, data: [] };

  // Get signup info for current employee
  const shiftIds = (shifts || []).map((s: any) => s.id);
  let mySignupMap: Record<string, string> = {};
  let signupCountMap: Record<string, { total: number; approved: number }> = {};

  if (shiftIds.length > 0) {
    const { data: allSignups } = await supabase
      .from('urgent_shift_signup')
      .select('urgent_shift_id, employee_id, status')
      .in('urgent_shift_id', shiftIds);

    (allSignups || []).forEach((s: any) => {
      // My signup status
      if (s.employee_id === emp.id) mySignupMap[s.urgent_shift_id] = s.status;
      // Overall counts
      if (!signupCountMap[s.urgent_shift_id]) signupCountMap[s.urgent_shift_id] = { total: 0, approved: 0 };
      if (s.status !== 'cancelled') signupCountMap[s.urgent_shift_id].total++;
      if (s.status === 'approved') signupCountMap[s.urgent_shift_id].approved++;
    });
  }

  const result = (shifts || []).map((s: any) => ({
    id: s.id,
    title: s.title,
    shiftType: s.shift_type,
    shiftDate: s.shift_date,
    startTime: s.start_time,
    endTime: s.end_time,
    requiredCount: s.required_count,
    projectName: s.project?.project_name || '',
    description: s.description,
    signupDeadline: s.signup_deadline,
    status: s.status,
    signupCount: signupCountMap[s.id]?.total || 0,
    approvedCount: signupCountMap[s.id]?.approved || 0,
    mySignupStatus: mySignupMap[s.id] || null, // null = not signed up
  }));

  return { success: true, data: result };
}

export async function signupUrgentShift(urgentShiftId: string, remark?: string) {
  const emp = getEmployee();
  if (!emp) return { success: false, message: '未登录' };

  // Check deadline & status
  const { data: shift } = await supabase
    .from('urgent_shift')
    .select('signup_deadline, status')
    .eq('id', urgentShiftId)
    .single();

  if (!shift) return { success: false, message: '未找到该班次' };
  if (shift.status !== 'open') return { success: false, message: '该班次已关闭' };
  if (new Date(shift.signup_deadline) < new Date()) return { success: false, message: '已超过报名截止时间' };

  // Check existing signup
  const { data: existing } = await supabase
    .from('urgent_shift_signup')
    .select('id, status')
    .eq('urgent_shift_id', urgentShiftId)
    .eq('employee_id', emp.id)
    .limit(1);

  if (existing && existing.length > 0) {
    if (existing[0].status === 'cancelled') {
      await supabase.from('urgent_shift_signup').update({ status: 'pending', remark: remark || null }).eq('id', existing[0].id);
      return { success: true, message: '报名成功' };
    }
    return { success: false, message: '您已报名该班次' };
  }

  const { error } = await supabase.from('urgent_shift_signup').insert({
    urgent_shift_id: urgentShiftId,
    employee_id: emp.id,
    remark: remark || null,
  });

  if (error) return { success: false, message: `报名失败: ${error.message}` };
  return { success: true, message: '报名成功，请等待审批' };
}

export async function cancelUrgentSignup(urgentShiftId: string) {
  const emp = getEmployee();
  if (!emp) return { success: false, message: '未登录' };

  const { error } = await supabase
    .from('urgent_shift_signup')
    .update({ status: 'cancelled' })
    .eq('urgent_shift_id', urgentShiftId)
    .eq('employee_id', emp.id)
    .eq('status', 'pending');

  if (error) return { success: false, message: `取消失败: ${error.message}` };
  return { success: true, message: '已取消报名' };
}

export async function getMyMessages() {
  const emp = getEmployee();
  if (!emp) return { success: true, data: [], unreadCount: 0 };

  const { data: rows } = await supabase
    .from('employee_message')
    .select('*')
    .eq('employee_id', emp.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const unread = (rows || []).filter((r: any) => !r.is_read).length;

  return {
    success: true,
    data: (rows || []).map((r: any) => ({
      id: r.id,
      msgType: r.msg_type,
      title: r.title,
      content: r.content,
      extraData: r.extra_data,
      isRead: r.is_read,
      createdAt: r.created_at,
    })),
    unreadCount: unread,
  };
}

export async function markMessageRead(messageId: string) {
  await supabase.from('employee_message').update({ is_read: true }).eq('id', messageId);
  return { success: true };
}

// ============ Seed (no-op, data comes from real DB) ============
export async function seedData() {
  return { success: true, message: '数据已从后台系统同步，无需初始化' };
}