import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

type ImportMode = 'cover_draft' | 'new_version';

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

async function resolveOperatorUserAccountId(
  supabase: ReturnType<typeof createClient>,
  request: Request,
  fallbackOperatorUserAccountId?: string,
) {
  const accessToken = getBearerToken(request);

  if (accessToken) {
    const { data: authUserData, error: authUserError } = await supabase.auth.getUser(accessToken);
    if (authUserError) {
      throw new Error(authUserError.message || '获取当前登录用户失败');
    }

    const authUserId = authUserData.user?.id;
    if (authUserId) {
      const { data: userAccount, error: accountError } = await supabase
        .from('user_account')
        .select('id')
        .eq('auth_user_id', authUserId)
        .eq('is_enabled', true)
        .maybeSingle();

      if (accountError) {
        throw new Error(accountError.message || '加载操作者账号失败');
      }

      if (userAccount?.id) {
        return userAccount.id;
      }
    }
  }

  if (fallbackOperatorUserAccountId) {
    return fallbackOperatorUserAccountId;
  }

  throw new Error('未解析到当前操作者账号');
}

function normalizeHeaderDate(value: unknown) {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
    if (match) {
      return `${match[1]}-${match[2]}-${match[3]}`;
    }
  }

  return null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const projectId = String(formData.get('project_id') || '');
    const scheduleMonth = String(formData.get('schedule_month') || '');
    const importMode = String(formData.get('import_mode') || 'cover_draft') as ImportMode;
    const fallbackOperatorUserAccountId = String(formData.get('operator_user_account_id') || '');

    if (!(file instanceof File) || !projectId || !scheduleMonth) {
      return Response.json(
        { success: false, error_code: 'VALIDATION_FAILED', message: '缺少导入必填参数' },
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
    const operatorUserAccountId = await resolveOperatorUserAccountId(
      supabase,
      request,
      fallbackOperatorUserAccountId,
    );
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[firstSheetName], {
      header: 1,
      raw: true,
      defval: '',
    });

    if (rows.length < 2) {
      return Response.json(
        { success: false, error_code: 'INVALID_EXCEL_TEMPLATE', message: 'Excel 内容为空' },
        { status: 400, headers: corsHeaders },
      );
    }

    const headerRow = rows[0];
    if (String(headerRow[0]).trim() !== '工号' || String(headerRow[1]).trim() !== '姓名' || String(headerRow[2]).trim() !== '部门') {
      return Response.json(
        { success: false, error_code: 'INVALID_EXCEL_TEMPLATE', message: '模板表头必须为：工号、姓名、部门、日期列' },
        { status: 400, headers: corsHeaders },
      );
    }

    const monthPrefix = scheduleMonth.slice(0, 7);
    const dateColumns = headerRow.slice(3).map((header) => normalizeHeaderDate(header));
    if (dateColumns.some((date) => !date || !date.startsWith(monthPrefix))) {
      return Response.json(
        { success: false, error_code: 'INVALID_EXCEL_TEMPLATE', message: '日期表头必须属于目标月份' },
        { status: 400, headers: corsHeaders },
      );
    }

    const [{ data: versionRows, error: versionError }, refs] = await Promise.all([
      supabase
        .from('schedule_version')
        .select('*')
        .eq('project_id', projectId)
        .eq('schedule_month', `${monthPrefix}-01`)
        .order('version_no', { ascending: false }),
      Promise.all([
        supabase.from('employee').select('id, employee_no, full_name, department_id'),
        supabase.from('dict_type').select('id, type_code').eq('type_code', 'schedule_code').limit(1),
        supabase.from('dict_item').select('id, item_code').eq('item_code', 'draft').limit(1),
      ]),
    ]);

    if (versionError) {
      return Response.json(
        { success: false, error_code: versionError.code || 'VERSION_LOAD_FAILED', message: versionError.message },
        { status: 400, headers: corsHeaders },
      );
    }

    const [employeeRes, typeRes, draftStatusRes] = refs;
    if (employeeRes.error || typeRes.error || draftStatusRes.error) {
      return Response.json(
        { success: false, error_code: employeeRes.error?.code || typeRes.error?.code || draftStatusRes.error?.code || 'REF_LOAD_FAILED', message: employeeRes.error?.message || typeRes.error?.message || draftStatusRes.error?.message || '加载导入引用数据失败' },
        { status: 400, headers: corsHeaders },
      );
    }

    const draftStatusId = draftStatusRes.data?.[0]?.id;
    if (!draftStatusId) {
      return Response.json(
        { success: false, error_code: 'DICT_STATUS_MISSING', message: '缺少 draft 状态字典项' },
        { status: 400, headers: corsHeaders },
      );
    }

    const { data: codeRows, error: codeError } = await supabase
      .from('dict_item')
      .select('id, item_name, item_code, extra_config')
      .eq('dict_type_id', typeRes.data?.[0]?.id || '');
    if (codeError) {
      return Response.json(
        { success: false, error_code: codeError.code || 'CODE_LOAD_FAILED', message: codeError.message },
        { status: 400, headers: corsHeaders },
      );
    }

    let scheduleVersionId = versionRows?.find((item) => importMode === 'cover_draft' && !item.published_at)?.id;
    if (!scheduleVersionId) {
      const nextVersionNo = ((versionRows && versionRows[0]?.version_no) || 0) + 1;
      const { data: insertedVersion, error: insertVersionError } = await supabase
        .from('schedule_version')
        .insert({
          project_id: projectId,
          schedule_month: `${monthPrefix}-01`,
          version_no: nextVersionNo,
          publish_status_dict_item_id: draftStatusId,
          generation_type: 'excel',
          created_by_user_account_id: operatorUserAccountId,
          remark: '通过 Excel 导入生成',
        })
        .select('id')
        .limit(1);

      if (insertVersionError || !insertedVersion?.[0]?.id) {
        return Response.json(
          { success: false, error_code: insertVersionError?.code || 'VERSION_CREATE_FAILED', message: insertVersionError?.message || '创建排班版本失败' },
          { status: 400, headers: corsHeaders },
        );
      }
      scheduleVersionId = insertedVersion[0].id;
    }

    const { data: batchRows, error: batchError } = await supabase
      .from('schedule_import_batch')
      .insert({
        project_id: projectId,
        schedule_month: `${monthPrefix}-01`,
        import_mode: importMode,
        processing_status: 'processing',
        total_row_count: 0,
        success_row_count: 0,
        failed_row_count: 0,
        schedule_version_id: scheduleVersionId,
        original_file_url: file.name,
        imported_by_user_account_id: operatorUserAccountId,
      })
      .select('id')
      .limit(1);

    if (batchError || !batchRows?.[0]?.id) {
      return Response.json(
        { success: false, error_code: batchError?.code || 'BATCH_CREATE_FAILED', message: batchError?.message || '创建导入批次失败' },
        { status: 400, headers: corsHeaders },
      );
    }

    const batchId = batchRows[0].id;
    if (importMode === 'cover_draft') {
      await supabase
        .from('schedule')
        .delete()
        .eq('schedule_version_id', scheduleVersionId)
        .gte('schedule_date', `${monthPrefix}-01`)
        .lte('schedule_date', `${monthPrefix}-31`);
    }

    const employeeMap = new Map(
      (employeeRes.data || []).flatMap((employee) => [
        [employee.employee_no || '', employee],
        [employee.full_name, employee],
      ]),
    );
    const codeMap = new Map(
      (codeRows || []).flatMap((code) => [
        [code.item_code, code],
        [code.item_name, code],
      ]),
    );

    const errors: Array<Record<string, unknown>> = [];
    const records: any[] = [];

    rows.slice(1).forEach((row, rowOffset) => {
      const rowIndex = rowOffset + 2;
      const employeeNo = String(row[0] || '').trim();
      const employeeName = String(row[1] || '').trim();
      if (!employeeNo && !employeeName) return;

      const employee = employeeMap.get(employeeNo) || employeeMap.get(employeeName);
      if (!employee) {
        errors.push({ rowIndex, employeeNo, employeeName, message: '未匹配到员工' });
        return;
      }

      dateColumns.forEach((scheduleDate, index) => {
        const codeValue = String(row[index + 3] || '').trim();
        if (!codeValue || !scheduleDate) return;
        const codeItem = codeMap.get(codeValue);
        if (!codeItem) {
          errors.push({ rowIndex, employeeNo, employeeName, scheduleDate, code: codeValue, message: '未匹配到排班编码' });
          return;
        }

        records.push({
          schedule_version_id: scheduleVersionId,
          employee_id: employee.id,
          department_id: employee.department_id,
          project_id: projectId,
          schedule_date: scheduleDate,
          schedule_code_dict_item_id: codeItem.id,
          shift_type_dict_item_id: codeItem.extra_config?.shift_type_dict_item_id || codeItem.id,
          planned_hours: Number(codeItem.extra_config?.standard_hours || 8),
          source_type: 'excel',
          remark: `导入批次 ${batchId}`,
        });
      });
    });

    if (records.length > 0) {
      const { error: upsertError } = await supabase
        .from('schedule')
        .upsert(records, { onConflict: 'schedule_version_id,employee_id,schedule_date' });
      if (upsertError) {
        return Response.json(
          { success: false, error_code: upsertError.code || 'SCHEDULE_IMPORT_FAILED', message: upsertError.message },
          { status: 400, headers: corsHeaders },
        );
      }
    }

    await supabase
      .from('schedule_import_batch')
      .update({
        processing_status: errors.length > 0 ? 'completed_with_errors' : 'completed',
        total_row_count: records.length + errors.length,
        success_row_count: records.length,
        failed_row_count: errors.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    return Response.json(
      {
        success: true,
        scheduleVersionId,
        batchId,
        importedRows: records.length,
        failedRows: errors.length,
        errors,
        message: errors.length > 0 ? '导入完成，但存在部分错误' : '导入成功',
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
