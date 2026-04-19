import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim();
}

async function ensureAuthenticatedUserAccount(
  supabase: ReturnType<typeof createClient>,
  request: Request,
) {
  const accessToken = getBearerToken(request);
  if (!accessToken) {
    throw new Error('缺少登录凭证');
  }

  const { data: authUserData, error: authUserError } = await supabase.auth.getUser(accessToken);
  if (authUserError) {
    throw new Error(authUserError.message || '获取当前登录用户失败');
  }

  const authUserId = authUserData.user?.id;
  if (!authUserId) {
    throw new Error('未解析到当前登录用户');
  }

  const { data: userAccount, error: accountError } = await supabase
    .from('user_account')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('is_enabled', true)
    .maybeSingle();

  if (accountError) {
    throw new Error(accountError.message || '加载当前账号失败');
  }

  if (!userAccount?.id) {
    throw new Error('未绑定后台账号');
  }
}

function buildWorkbook(scheduleMonth: string, rows: Array<{
  employeeNo?: string | null;
  employeeName: string;
  departmentName?: string | null;
  codesByDate: Record<string, string>;
}>) {
  const month = new Date(scheduleMonth);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const header = ['工号', '姓名', '部门'];

  for (let day = 1; day <= daysInMonth; day += 1) {
    header.push(`${scheduleMonth.slice(0, 7)}-${String(day).padStart(2, '0')}`);
  }

  const data = [
    header,
    ...rows.map((row) => [
      row.employeeNo || '',
      row.employeeName,
      row.departmentName || '',
      ...Array.from({ length: daysInMonth }).map((_, index) => {
        const date = `${scheduleMonth.slice(0, 7)}-${String(index + 1).padStart(2, '0')}`;
        return row.codesByDate[date] || '';
      }),
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '排班导出');
  return XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
}

function getMonthRange(scheduleMonth: string) {
  const month = new Date(scheduleMonth);
  const year = month.getFullYear();
  const monthNumber = month.getMonth() + 1;
  const daysInMonth = new Date(year, month.getMonth() + 1, 0).getDate();

  return {
    start: `${scheduleMonth.slice(0, 7)}-01`,
    end: `${scheduleMonth.slice(0, 7)}-${String(daysInMonth).padStart(2, '0')}`,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await request.json();
    const projectId = String(payload.project_id || '');
    const scheduleVersionId = String(payload.schedule_version_id || '');
    const scheduleMonth = String(payload.schedule_month || '');

    if (!projectId || !scheduleVersionId || !scheduleMonth) {
      return Response.json(
        { success: false, error_code: 'VALIDATION_FAILED', message: '缺少导出必填参数' },
        { status: 400, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      return Response.json(
        { success: false, error_code: 'SERVER_CONFIG_MISSING', message: '缺少 Supabase 服务端配置' },
        { status: 500, headers: corsHeaders },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    await ensureAuthenticatedUserAccount(supabase, request);
    const monthRange = getMonthRange(scheduleMonth);
    const [scheduleRes, employeeRes, departmentRes, dictRes] = await Promise.all([
      supabase
        .from('schedule')
        .select('*')
        .eq('project_id', projectId)
        .eq('schedule_version_id', scheduleVersionId)
        .gte('schedule_date', monthRange.start)
        .lte('schedule_date', monthRange.end),
      supabase.from('employee').select('id, employee_no, full_name, department_id'),
      supabase.from('department').select('id, department_name'),
      supabase.from('dict_item').select('id, item_code'),
    ]);

    if (scheduleRes.error || employeeRes.error || departmentRes.error || dictRes.error) {
      return Response.json(
        {
          success: false,
          error_code: scheduleRes.error?.code || employeeRes.error?.code || departmentRes.error?.code || dictRes.error?.code || 'EXPORT_LOAD_FAILED',
          message:
            scheduleRes.error?.message ||
            employeeRes.error?.message ||
            departmentRes.error?.message ||
            dictRes.error?.message ||
            '加载导出数据失败',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const employeeMap = new Map((employeeRes.data || []).map((row) => [row.id, row]));
    const departmentMap = new Map((departmentRes.data || []).map((row) => [row.id, row.department_name]));
    const codeMap = new Map((dictRes.data || []).map((row) => [row.id, row.item_code]));

    const exportRows = new Map<string, {
      employeeNo?: string | null;
      employeeName: string;
      departmentName?: string | null;
      codesByDate: Record<string, string>;
    }>();

    (scheduleRes.data || []).forEach((row) => {
      const employee = employeeMap.get(row.employee_id);
      if (!employee) return;
      const current = exportRows.get(employee.id) || {
        employeeNo: employee.employee_no,
        employeeName: employee.full_name,
        departmentName: departmentMap.get(employee.department_id),
        codesByDate: {},
      };
      current.codesByDate[row.schedule_date] = codeMap.get(row.schedule_code_dict_item_id) || '';
      exportRows.set(employee.id, current);
    });

    return Response.json(
      {
        file_name: `schedule-${scheduleMonth.slice(0, 7)}.xlsx`,
        base64_content: buildWorkbook(scheduleMonth, Array.from(exportRows.values())),
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error_code: 'UNEXPECTED_ERROR',
        message: error instanceof Error ? error.message : 'unknown error',
      },
      { status: 500, headers: corsHeaders },
    );
  }
});
