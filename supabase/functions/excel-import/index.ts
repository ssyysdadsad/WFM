import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

type ImportMode = 'cover_draft' | 'new_version';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================================
//  公共工具
// ============================================================

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
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
    if (authUserError) throw new Error(authUserError.message || '获取当前登录用户失败');
    const authUserId = authUserData.user?.id;
    if (authUserId) {
      const { data: userAccount, error: accountError } = await supabase
        .from('user_account')
        .select('id')
        .eq('auth_user_id', authUserId)
        .eq('is_enabled', true)
        .maybeSingle();
      if (accountError) throw new Error(accountError.message || '加载操作者账号失败');
      if (userAccount?.id) return userAccount.id;
    }
  }
  if (fallbackOperatorUserAccountId) return fallbackOperatorUserAccountId;
  throw new Error('未解析到当前操作者账号');
}

// ============================================================
//  格式检测与解析
// ============================================================

/** 旧格式日期表头标准化 */
function normalizeHeaderDate(value: unknown): string | null {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
  }
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (match) {
      return `${match[1]}-${String(Number(match[2])).padStart(2, '0')}-${String(Number(match[3])).padStart(2, '0')}`;
    }
  }
  return null;
}

/** 在前 5 行内定位包含"排班"或"项目"字样的标题行 */
function findTitleRowIndex(rows: any[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const text = (rows[i] ?? []).map((c: any) => String(c ?? '').trim()).filter(Boolean).join('');
    if (text.includes('排班') || text.includes('项目')) return i;
  }
  return -1;
}

/** 将单元格解析为完整日期字符串 "YYYY-MM-DD" */
function parseCellToFullDate(cell: any, fallbackYear?: number, fallbackMonth?: number): string | null {
  const v = Number(cell);
  if (!Number.isFinite(v)) return null;
  if (v > 366) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  if (Number.isInteger(v) && v >= 1 && v <= 31 && fallbackYear && fallbackMonth) {
    const d = new Date(fallbackYear, fallbackMonth - 1, v);
    if (d.getFullYear() === fallbackYear && d.getMonth() + 1 === fallbackMonth) {
      return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-${String(v).padStart(2, '0')}`;
    }
  }
  return null;
}

/** 从标题文字中提取年月 */
function extractYearMonthFromTitle(title: string): { year: number; month: number } | null {
  const m = title.match(/(\d{4})[年\-\/](\d{1,2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

function isHeaderLabelRow(row: any[]): boolean {
  const firstCell = String(row[0] ?? '').trim();
  return firstCell === '姓名' || firstCell === '工号';
}

function isWeekdayRow(row: any[]): boolean {
  const text = row.map((c: any) => String(c ?? '').trim()).join('');
  return /[一二三四五六日]{2,}/.test(text) && !/休|班/.test(text);
}

const NON_EMPLOYEE_KEYWORDS = ['总出勤', '出勤率', '合计', '小计', '总计', '备注', '月度', '人力统计'];
function isNonEmployeeRow(cellValue: string): boolean {
  return NON_EMPLOYEE_KEYWORDS.some(kw => cellValue.includes(kw));
}

/** 检测是否为「项目排班表」新格式 */
function detectNewFormat(rows: any[][]): boolean {
  if (rows.length < 3) return false;
  const titleIdx = findTitleRowIndex(rows);
  if (titleIdx === -1) return false;
  const dateRow = rows[titleIdx + 1] ?? [];
  return dateRow.some((cell: any) => {
    const v = Number(cell);
    if (!Number.isFinite(v)) return false;
    if (v > 366) return XLSX.SSF.parse_date_code(v) != null;
    return Number.isInteger(v) && v >= 1 && v <= 31;
  });
}

/** 检测是否为旧格式 */
function detectOldFormat(rows: any[][]): boolean {
  if (rows.length < 2) return false;
  const headerRow = rows[0] ?? [];
  return (
    String(headerRow[0] ?? '').trim() === '工号' &&
    String(headerRow[1] ?? '').trim() === '姓名' &&
    String(headerRow[2] ?? '').trim() === '部门'
  );
}

type ParsedRow = {
  rowIndex: number;
  employeeNo?: string;
  employeeName?: string;
  assignments: Array<{ scheduleDate: string; code: string }>;
};

/** 解析「项目排班表」新格式 */
function parseNewFormat(
  rows: any[][],
  scheduleMonth: string,
): { parsedRows: ParsedRow[]; parseErrors: string[] } {
  const parseErrors: string[] = [];
  const parsedRows: ParsedRow[] = [];
  const targetMonthPrefix = scheduleMonth.slice(0, 7);

  const titleIdx = findTitleRowIndex(rows);
  const titleRow = rows[titleIdx] ?? [];
  const titleText = titleRow.map((c: any) => String(c ?? '').trim()).find((s: string) => /\d{4}/.test(s)) ?? '';
  const titleYM = extractYearMonthFromTitle(titleText);

  const dateRow = rows[titleIdx + 1] ?? [];

  // 先扫描：如果日期行中存在 Excel 序列号 (>366)，则只用序列号模式
  // 避免统计数字（8, 1, 5 等）被误判成日期
  const hasSerialNumbers = dateRow.some((cell: any) => {
    const v = Number(cell);
    return Number.isFinite(v) && v > 366 && XLSX.SSF.parse_date_code(v) != null;
  });

  const colToDate = new Map<number, string>();
  dateRow.forEach((cell: any, colIdx: number) => {
    const v = Number(cell);
    if (!Number.isFinite(v)) return;

    let fullDate: string | null = null;
    if (v > 366) {
      fullDate = parseCellToFullDate(cell);
    } else if (!hasSerialNumbers && Number.isInteger(v) && v >= 1 && v <= 31) {
      fullDate = parseCellToFullDate(cell, titleYM?.year, titleYM?.month);
    }
    if (!fullDate) return;
    if (!fullDate.startsWith(targetMonthPrefix)) return;
    colToDate.set(colIdx, fullDate);
  });

  if (colToDate.size === 0) {
    return { parsedRows, parseErrors };
  }

  // 智能跳过"姓名"标题行和星期行
  let firstDataRowIndex = titleIdx + 2;
  while (firstDataRowIndex < rows.length) {
    const candidate = rows[firstDataRowIndex];
    if (isHeaderLabelRow(candidate) || isWeekdayRow(candidate)) {
      firstDataRowIndex++;
    } else {
      break;
    }
  }

  rows.slice(firstDataRowIndex).forEach((row: any[], offset: number) => {
    const rowIndex = firstDataRowIndex + offset + 1;
    const cellA = String(row[0] ?? '').trim();
    const cellB = String(row[1] ?? '').trim();
    const employeeName = cellA || cellB;
    if (!employeeName) return;
    if (isNonEmployeeRow(employeeName)) return;

    const assignments: { scheduleDate: string; code: string }[] = [];
    colToDate.forEach((scheduleDate, colIdx) => {
      const code = String(row[colIdx] ?? '').trim();
      if (code) assignments.push({ scheduleDate, code });
    });

    if (assignments.length === 0) return;
    parsedRows.push({ rowIndex, employeeName, assignments });
  });

  return { parsedRows, parseErrors };
}

/** 解析「旧格式」：工号 | 姓名 | 部门 | 日期列 */
function parseOldFormat(
  rows: any[][],
  scheduleMonth: string,
): { parsedRows: ParsedRow[]; parseErrors: string[] } {
  const parsedRows: ParsedRow[] = [];
  const parseErrors: string[] = [];
  const headerRow = rows[0];
  const monthPrefix = scheduleMonth.slice(0, 7);
  const dateColumns = headerRow.slice(3).map((header: any, index: number) => {
    const date = normalizeHeaderDate(header);
    if (!date || !date.startsWith(monthPrefix)) {
      parseErrors.push(`第 ${index + 4} 列日期表头无效或不属于导入月份`);
      return null;
    }
    return date;
  });

  if (parseErrors.length > 0) return { parsedRows, parseErrors };

  rows.slice(1).forEach((row: any[], rowOffset: number) => {
    const rowIndex = rowOffset + 2;
    const employeeNo = String(row[0] ?? '').trim();
    const employeeName = String(row[1] ?? '').trim();
    if (!employeeNo && !employeeName) return;
    const assignments: { scheduleDate: string; code: string }[] = [];
    dateColumns.forEach((scheduleDate: string | null, dateIndex: number) => {
      if (!scheduleDate) return;
      const code = String(row[dateIndex + 3] ?? '').trim();
      if (code) assignments.push({ scheduleDate, code });
    });
    parsedRows.push({ rowIndex, employeeNo, employeeName, assignments });
  });

  return { parsedRows, parseErrors };
}

/**
 * 跨 Sheet 去重：同一员工的同一日期排班只保留最后出现的那条
 */
function deduplicateParsedRows(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Map<string, { code: string; rowIndex: number }>();
  const employeeOrder: string[] = [];
  const employeeSet = new Set<string>();

  for (const row of rows) {
    const name = row.employeeName ?? row.employeeNo ?? '';
    if (!employeeSet.has(name)) {
      employeeSet.add(name);
      employeeOrder.push(name);
    }
    for (const a of row.assignments) {
      seen.set(`${name}|${a.scheduleDate}`, { code: a.code, rowIndex: row.rowIndex });
    }
  }

  return employeeOrder.map(name => {
    const assignments: { scheduleDate: string; code: string }[] = [];
    let rowIndex = 0;
    seen.forEach((val, key) => {
      if (key.startsWith(`${name}|`)) {
        assignments.push({ scheduleDate: key.slice(name.length + 1), code: val.code });
        rowIndex = val.rowIndex;
      }
    });
    assignments.sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
    const original = rows.find(r => (r.employeeName ?? r.employeeNo) === name);
    return {
      rowIndex,
      employeeNo: original?.employeeNo,
      employeeName: original?.employeeName,
      assignments,
    };
  });
}

// ============================================================
//  主入口
// ============================================================

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

    // ---- 解析 Excel ----
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    if (workbook.SheetNames.length === 0) {
      return Response.json(
        { success: false, error_code: 'INVALID_EXCEL_FILE', message: 'Excel 文件中缺少工作表' },
        { status: 400, headers: corsHeaders },
      );
    }

    const allParsedRows: ParsedRow[] = [];
    const allParseErrors: string[] = [];
    let foundAnyValidSheet = false;

    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], {
        header: 1,
        raw: true,
        defval: '',
      });
      if (rows.length < 2) continue;

      if (detectNewFormat(rows)) {
        const { parsedRows, parseErrors } = parseNewFormat(rows, scheduleMonth);
        if (parsedRows.length > 0) {
          foundAnyValidSheet = true;
          allParsedRows.push(...parsedRows);
        }
        allParseErrors.push(...parseErrors.map(e => `[工作表 ${sheetName}] ${e}`));
      } else if (detectOldFormat(rows)) {
        foundAnyValidSheet = true;
        const { parsedRows, parseErrors } = parseOldFormat(rows, scheduleMonth);
        allParsedRows.push(...parsedRows);
        allParseErrors.push(...parseErrors.map(e => `[工作表 ${sheetName}] ${e}`));
      }
    }

    if (!foundAnyValidSheet) {
      return Response.json(
        { success: false, error_code: 'INVALID_EXCEL_TEMPLATE', message: '未在 Excel 中检测到属于目标月份的有效排班数据，请确认文件和导入月份是否匹配。' },
        { status: 400, headers: corsHeaders },
      );
    }

    if (allParseErrors.length > 0) {
      return Response.json(
        { success: false, error_code: 'INVALID_EXCEL_TEMPLATE', message: allParseErrors[0] },
        { status: 400, headers: corsHeaders },
      );
    }

    if (allParsedRows.length === 0) {
      return Response.json(
        { success: false, error_code: 'INVALID_EXCEL_TEMPLATE', message: 'Excel 中未解析到有效的员工数据行' },
        { status: 400, headers: corsHeaders },
      );
    }

    // 跨 Sheet 去重
    const parsedRows = deduplicateParsedRows(allParsedRows);

    // ---- 加载引用数据 ----
    const monthPrefix = scheduleMonth.slice(0, 7);
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
        {
          success: false,
          error_code: employeeRes.error?.code || typeRes.error?.code || draftStatusRes.error?.code || 'REF_LOAD_FAILED',
          message: employeeRes.error?.message || typeRes.error?.message || draftStatusRes.error?.message || '加载导入引用数据失败',
        },
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

    // ---- 创建/选取排班版本 ----
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
          {
            success: false,
            error_code: insertVersionError?.code || 'VERSION_CREATE_FAILED',
            message: insertVersionError?.message || '创建排班版本失败',
          },
          { status: 400, headers: corsHeaders },
        );
      }
      scheduleVersionId = insertedVersion[0].id;
    }

    // ---- 创建导入批次 ----
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
        {
          success: false,
          error_code: batchError?.code || 'BATCH_CREATE_FAILED',
          message: batchError?.message || '创建导入批次失败',
        },
        { status: 400, headers: corsHeaders },
      );
    }

    const batchId = batchRows[0].id;

    // 覆盖草稿模式：先清空本月已有排班
    if (importMode === 'cover_draft') {
      await supabase
        .from('schedule')
        .delete()
        .eq('schedule_version_id', scheduleVersionId)
        .gte('schedule_date', `${monthPrefix}-01`)
        .lte('schedule_date', `${monthPrefix}-31`);
    }

    // ---- 构建员工/编码查找表 ----
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

    // ---- 逐行匹配并生成排班记录 ----
    const errors: Array<Record<string, unknown>> = [];
    const records: any[] = [];

    parsedRows.forEach(({ rowIndex, employeeNo, employeeName, assignments }) => {
      const employee =
        (employeeNo ? employeeMap.get(employeeNo) : undefined) ||
        (employeeName ? employeeMap.get(employeeName) : undefined);

      if (!employee) {
        errors.push({ rowIndex, employeeNo, employeeName, message: '未匹配到员工' });
        return;
      }

      if (assignments.length === 0) {
        errors.push({ rowIndex, employeeNo, employeeName, message: '该行没有可导入的排班编码' });
        return;
      }

      assignments.forEach(({ scheduleDate, code }) => {
        const codeItem = codeMap.get(code);
        if (!codeItem) {
          errors.push({ rowIndex, employeeNo, employeeName, scheduleDate, code, message: '未匹配到排班编码' });
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

    // ---- 写入数据库 ----
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
