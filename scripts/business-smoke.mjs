import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@supabase/supabase-js';
import XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'tmp-business-smoke.json');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }

  return values;
}

function getConfig() {
  const envFile = loadEnvFile(path.join(projectRoot, '.env.local'));
  const get = (...keys) => {
    for (const key of keys) {
      if (process.env[key]) return process.env[key];
      if (envFile[key]) return envFile[key];
    }
    return undefined;
  };

  const supabaseUrl = get('VITE_SUPABASE_URL');
  const anonKey = get('VITE_SUPABASE_ANON_KEY');
  const email = get('WFM_SMOKE_EMAIL', 'E2E_SUPABASE_EMAIL');
  const password = get('WFM_SMOKE_PASSWORD', 'E2E_SUPABASE_PASSWORD');
  const scheduleMonth = get('WFM_SMOKE_MONTH') || new Date().toISOString().slice(0, 7) + '-01';

  if (!supabaseUrl || !anonKey) {
    throw new Error('missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  }
  if (!email || !password) {
    throw new Error('missing WFM_SMOKE_EMAIL/WFM_SMOKE_PASSWORD or E2E_SUPABASE_EMAIL/E2E_SUPABASE_PASSWORD');
  }

  return {
    supabaseUrl,
    anonKey,
    email,
    password,
    projectId: get('WFM_SMOKE_PROJECT_ID'),
    scheduleMonth,
    shiftChangeRequestId: get('WFM_SMOKE_SHIFT_CHANGE_REQUEST_ID'),
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toMonthDates(scheduleMonth, dayCount) {
  const prefix = scheduleMonth.slice(0, 7);
  return Array.from({ length: dayCount }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);
}

function buildImportWorkbook({ employees, codes, scheduleMonth }) {
  const dates = toMonthDates(scheduleMonth, 2);
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['\u5de5\u53f7', '\u59d3\u540d', '\u90e8\u95e8', ...dates],
    ...employees.map((employee, index) => [
      employee.employee_no,
      employee.full_name,
      employee.department_name || '',
      codes[index % codes.length].item_name,
      codes[(index + 1) % codes.length].item_name,
    ]),
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ImportDemo');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

async function invokeJsonFunction({ supabaseUrl, anonKey, accessToken, functionName, body }) {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return {
    status: response.status,
    body: await parseJsonResponse(response),
  };
}

async function invokeImportFunction({ supabaseUrl, anonKey, accessToken, fileBuffer, projectId, scheduleMonth }) {
  const formData = new FormData();
  formData.set(
    'file',
    new Blob([fileBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    'business-smoke.xlsx',
  );
  formData.set('project_id', projectId);
  formData.set('schedule_month', scheduleMonth);
  formData.set('import_mode', 'new_version');

  const response = await fetch(`${supabaseUrl}/functions/v1/excel-import`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: anonKey,
    },
    body: formData,
  });

  return {
    status: response.status,
    body: await parseJsonResponse(response),
  };
}

async function fetchSingle(supabase, table, queryBuilder) {
  const { data, error } = await queryBuilder(supabase.from(table)).single();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

async function fetchMaybeSingle(supabase, table, queryBuilder) {
  const { data, error } = await queryBuilder(supabase.from(table)).maybeSingle();
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

async function fetchList(supabase, table, queryBuilder) {
  const { data, error } = await queryBuilder(supabase.from(table));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function main() {
  const config = getConfig();
  const result = {
    startedAt: new Date().toISOString(),
    config: {
      supabaseUrl: config.supabaseUrl,
      email: config.email,
      projectId: config.projectId || null,
      scheduleMonth: config.scheduleMonth,
      shiftChangeRequestId: config.shiftChangeRequestId || null,
    },
  };

  const supabase = createClient(config.supabaseUrl, config.anonKey);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });
  if (authError || !authData.session?.access_token || !authData.user?.id) {
    throw new Error(`signIn failed: ${authError?.message || 'missing session'}`);
  }

  const accessToken = authData.session.access_token;
  result.auth = {
    authUserId: authData.user.id,
    email: config.email,
  };

  const operatorAccount = await fetchSingle(supabase, 'user_account', (query) =>
    query.select('id, username, auth_user_id').eq('auth_user_id', authData.user.id).eq('is_enabled', true),
  );
  result.operator = operatorAccount;

  const project =
    config.projectId
      ? await fetchSingle(supabase, 'project', (query) => query.select('id, project_name').eq('id', config.projectId))
      : await fetchSingle(supabase, 'project', (query) =>
          query.select('id, project_name').order('created_at', { ascending: true }).limit(1),
        );
  result.project = project;

  const employees = await fetchList(supabase, 'employee', (query) =>
    query.select('id, employee_no, full_name, department_id').order('employee_no', { ascending: true }).limit(3),
  );
  assert(employees.length >= 2, 'not enough employees for smoke import');

  const departments = await fetchList(supabase, 'department', (query) =>
    query.select('id, department_name'),
  );
  const departmentMap = new Map(departments.map((row) => [row.id, row.department_name]));

  const scheduleDictType = await fetchSingle(supabase, 'dict_type', (query) =>
    query.select('id, type_code').eq('type_code', 'schedule_code').limit(1),
  );
  const scheduleCodes = await fetchList(supabase, 'dict_item', (query) =>
    query
      .select('id, item_code, item_name, extra_config')
      .eq('dict_type_id', scheduleDictType.id)
      .not('item_name', 'is', null)
      .order('item_code', { ascending: true })
      .limit(5),
  );
  assert(scheduleCodes.length >= 2, 'not enough schedule codes for smoke import');

  const importEmployees = employees.slice(0, 3).map((employee) => ({
    ...employee,
    department_name: departmentMap.get(employee.department_id) || '',
  }));
  const fileBuffer = buildImportWorkbook({
    employees: importEmployees,
    codes: scheduleCodes.slice(0, 3),
    scheduleMonth: config.scheduleMonth,
  });

  const importRes = await invokeImportFunction({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.anonKey,
    accessToken,
    fileBuffer,
    projectId: project.id,
    scheduleMonth: config.scheduleMonth,
  });
  result.import = importRes;
  assert(importRes.status === 200, `excel-import failed: ${JSON.stringify(importRes.body)}`);
  assert(importRes.body?.scheduleVersionId, 'excel-import missing scheduleVersionId');
  assert(importRes.body?.batchId, 'excel-import missing batchId');

  const importedVersion = await fetchSingle(supabase, 'schedule_version', (query) =>
    query
      .select('id, project_id, schedule_month, version_no, generation_type, publish_status_dict_item_id, created_by_user_account_id, published_at')
      .eq('id', importRes.body.scheduleVersionId),
  );
  const importedBatch = await fetchSingle(supabase, 'schedule_import_batch', (query) =>
    query
      .select('id, processing_status, total_row_count, success_row_count, failed_row_count, schedule_version_id, imported_by_user_account_id')
      .eq('id', importRes.body.batchId),
  );
  const importedSchedules = await fetchList(supabase, 'schedule', (query) =>
    query
      .select('id, schedule_date')
      .eq('schedule_version_id', importRes.body.scheduleVersionId)
      .order('schedule_date', { ascending: true }),
  );
  result.importVerification = {
    scheduleVersion: importedVersion,
    batch: importedBatch,
    scheduleCount: importedSchedules.length,
  };
  assert(importedSchedules.length > 0, 'excel-import wrote no schedules');

  const publishRes = await invokeJsonFunction({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.anonKey,
    accessToken,
    functionName: 'schedule-publish',
    body: {
      schedule_version_id: importRes.body.scheduleVersionId,
      create_announcement: false,
    },
  });
  result.publish = publishRes;
  assert(publishRes.status === 200, `schedule-publish failed: ${JSON.stringify(publishRes.body)}`);

  const publishedVersion = await fetchSingle(supabase, 'schedule_version', (query) =>
    query
      .select('id, published_at, published_by_user_account_id, publish_status_dict_item_id')
      .eq('id', importRes.body.scheduleVersionId),
  );
  result.publishVerification = publishedVersion;
  assert(publishedVersion.published_at, 'schedule-publish did not set published_at');
  assert(
    publishedVersion.published_by_user_account_id === operatorAccount.id,
    'schedule-publish did not record current operator',
  );

  const exportRes = await invokeJsonFunction({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.anonKey,
    accessToken,
    functionName: 'excel-export',
    body: {
      project_id: project.id,
      schedule_version_id: importRes.body.scheduleVersionId,
      schedule_month: config.scheduleMonth,
    },
  });
  result.export = {
    status: exportRes.status,
    body: exportRes.body
      ? {
          file_name: exportRes.body.file_name,
          has_base64_content: Boolean(exportRes.body.base64_content),
        }
      : null,
  };
  assert(exportRes.status === 200, `excel-export failed: ${JSON.stringify(exportRes.body)}`);
  assert(exportRes.body?.base64_content, 'excel-export missing base64_content');

  const exportedWorkbook = XLSX.read(Buffer.from(exportRes.body.base64_content, 'base64'), { type: 'buffer' });
  const firstSheetName = exportedWorkbook.SheetNames[0];
  const exportedRows = XLSX.utils.sheet_to_json(exportedWorkbook.Sheets[firstSheetName], {
    header: 1,
    raw: true,
    defval: '',
  });
  result.exportVerification = {
    sheetName: firstSheetName,
    rowCount: exportedRows.length,
  };
  assert(exportedRows.length >= 2, 'excel-export workbook is empty');

  let shiftChangeCandidate = null;
  let shiftChangeMode = 'auto';
  if (config.shiftChangeRequestId) {
    shiftChangeMode = 'env';
    shiftChangeCandidate = await fetchMaybeSingle(supabase, 'shift_change_request', (query) =>
      query
        .select('id, request_type, approved_at, approver_user_account_id, approval_comment, original_schedule_id, target_schedule_id')
        .eq('id', config.shiftChangeRequestId),
    );
  }

  if (!shiftChangeCandidate) {
    shiftChangeCandidate = await fetchMaybeSingle(supabase, 'shift_change_request', (query) =>
      query
        .select('id, request_type, approved_at, approver_user_account_id, approval_comment, original_schedule_id, target_schedule_id')
        .is('approved_at', null)
        .order('created_at', { ascending: false })
        .limit(1),
    );
    if (shiftChangeCandidate) {
      shiftChangeMode = 'pending';
    }
  }

  if (!shiftChangeCandidate) {
    shiftChangeCandidate = await fetchMaybeSingle(supabase, 'shift_change_request', (query) =>
      query
        .select('id, request_type, approved_at, approver_user_account_id, approval_comment, original_schedule_id, target_schedule_id')
        .not('approved_at', 'is', null)
        .order('approved_at', { ascending: false })
        .limit(1),
    );
    if (shiftChangeCandidate) {
      shiftChangeMode = 'processed_guard';
    }
  }

  assert(shiftChangeCandidate, 'no shift_change_request available for smoke validation');

  const shiftChangeRes = await invokeJsonFunction({
    supabaseUrl: config.supabaseUrl,
    anonKey: config.anonKey,
    accessToken,
    functionName: 'shift-change-approve',
    body: {
      shift_change_request_id: shiftChangeCandidate.id,
      action: 'approve',
      approval_comment: 'business smoke validation',
    },
  });
  result.shiftChange = {
    mode: shiftChangeMode,
    requestId: shiftChangeCandidate.id,
    response: shiftChangeRes,
  };

  if (shiftChangeMode === 'processed_guard') {
    assert(
      shiftChangeRes.status === 409 &&
        shiftChangeRes.body?.error_code === 'SHIFT_CHANGE_ALREADY_PROCESSED',
      `shift-change guard check failed: ${JSON.stringify(shiftChangeRes.body)}`,
    );
  } else {
    assert(shiftChangeRes.status === 200, `shift-change approve failed: ${JSON.stringify(shiftChangeRes.body)}`);
  }

  const shiftChangeAfter = await fetchSingle(supabase, 'shift_change_request', (query) =>
    query
      .select('id, approved_at, approver_user_account_id, approval_comment')
      .eq('id', shiftChangeCandidate.id),
  );
  result.shiftChangeVerification = shiftChangeAfter;
  assert(shiftChangeAfter.approved_at, 'shift-change request is still unapproved');

  result.finishedAt = new Date().toISOString();
  result.success = true;

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  const failure = {
    success: false,
    finishedAt: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  };
  fs.writeFileSync(outputPath, JSON.stringify(failure, null, 2));
  console.error(JSON.stringify(failure, null, 2));
  process.exitCode = 1;
});
