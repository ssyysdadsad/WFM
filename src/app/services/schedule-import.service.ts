import dayjs from 'dayjs';
import { supabase, supabaseUrl, publicAnonKey } from '@/app/lib/supabase/client';
import { AppError, toAppError } from '@/app/lib/supabase/errors';
import { parseScheduleWorkbook } from '@/app/lib/schedule/excel';
import { bulkUpsertScheduleCells, loadScheduleMatrixReferences, resolveShiftTypeDictItemId } from '@/app/services/schedule.service';
import { validateScheduleBatch } from '@/app/services/labor-rule.service';
import type { ScheduleCellChange } from '@/app/types/schedule';
import type {
  ScheduleImportBatchRecord,
  ScheduleImportError,
  ScheduleImportMode,
  ScheduleImportResult,
} from '@/app/types/schedule-import';

function mapBatch(row: any): ScheduleImportBatchRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    scheduleMonth: row.schedule_month,
    importMode: row.import_mode,
    processingStatus: row.processing_status,
    sourceFileName: row.source_file_name ?? row.original_file_url,
    importedRows: row.success_row_count ?? 0,
    failedRows: row.failed_row_count ?? 0,
    scheduleVersionId: row.schedule_version_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function fetchFunction<T>(functionName: string, options: RequestInit) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    ...options,
    headers: {
      apikey: publicAnonKey,
      Authorization: `Bearer ${accessToken || publicAnonKey}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${functionName} ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getOrCreateImportVersion(params: {
  projectId: string;
  scheduleMonth: string;
  importMode: ScheduleImportMode;
  operatorUserAccountId: string;
}) {
  const monthStart = dayjs(params.scheduleMonth).startOf('month').format('YYYY-MM-DD');
  const { data, error } = await supabase
    .from('schedule_version')
    .select('*')
    .eq('project_id', params.projectId)
    .eq('schedule_month', monthStart)
    .order('version_no', { ascending: false });

  if (error) {
    throw toAppError(error, '获取导入版本失败');
  }

  const rows = data || [];
  if (params.importMode === 'cover_draft') {
    const draftRow = rows.find((item: any) => !item.published_at);
    if (draftRow) {
      return draftRow.id as string;
    }
  }

  const nextVersionNo = (rows[0]?.version_no || 0) + 1;
  const { data: draftStatusRows, error: draftStatusError } = await supabase
    .from('dict_item')
    .select('id')
    .eq('item_code', 'draft')
    .limit(1);

  const draftStatusId = draftStatusRows?.[0]?.id;
  if (draftStatusError || !draftStatusId) {
    throw toAppError(draftStatusError || new Error('缺少 draft 状态字典项'), '创建导入版本失败');
  }

  const { data: insertRows, error: insertError } = await supabase
    .from('schedule_version')
    .insert({
      project_id: params.projectId,
      schedule_month: monthStart,
      version_no: nextVersionNo,
      publish_status_dict_item_id: draftStatusId,
      generation_type: 'excel',
      created_by_user_account_id: params.operatorUserAccountId,
      remark: '通过 Excel 导入生成',
    })
    .select('id')
    .limit(1);

  if (insertError || !insertRows?.[0]?.id) {
    throw toAppError(insertError || new Error('创建导入版本失败'), '创建导入版本失败');
  }

  return insertRows[0].id as string;
}

async function createImportBatch(params: {
  projectId: string;
  scheduleMonth: string;
  importMode: ScheduleImportMode;
  scheduleVersionId: string;
  operatorUserAccountId: string;
  fileName: string;
}) {
  const { data, error } = await supabase
    .from('schedule_import_batch')
    .insert({
      project_id: params.projectId,
      schedule_month: params.scheduleMonth,
      import_mode: params.importMode,
      processing_status: 'processing',
      total_row_count: 0,
      success_row_count: 0,
      failed_row_count: 0,
      schedule_version_id: params.scheduleVersionId,
      original_file_url: params.fileName,
      imported_by_user_account_id: params.operatorUserAccountId,
    })
    .select('id')
    .limit(1);

  if (error || !data?.[0]?.id) {
    throw toAppError(error || new Error('创建导入批次失败'), '创建导入批次失败');
  }

  return data[0].id as string;
}

async function updateImportBatch(batchId: string, payload: Record<string, any>) {
  const { error } = await supabase.from('schedule_import_batch').update(payload).eq('id', batchId);
  if (error) {
    throw toAppError(error, '更新导入批次失败');
  }
}

export async function listScheduleImportBatches() {
  const { data, error } = await supabase
    .from('schedule_import_batch')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    throw toAppError(error, '加载导入批次失败');
  }

  const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  const now = Date.now();
  const staleIds: string[] = [];

  const mapped = (data || []).map((row) => {
    const batch = mapBatch(row);
    // Detect stale "processing" records
    if (batch.processingStatus === 'processing' && batch.createdAt) {
      const elapsed = now - new Date(batch.createdAt).getTime();
      if (elapsed > STALE_THRESHOLD_MS) {
        batch.processingStatus = 'failed';
        staleIds.push(batch.id);
      }
    }
    return batch;
  });

  // Fire-and-forget: fix stale records in DB
  if (staleIds.length > 0) {
    supabase
      .from('schedule_import_batch')
      .update({ processing_status: 'failed', completed_at: new Date().toISOString() })
      .in('id', staleIds)
      .then(() => { /* silently fixed */ });
  }

  return mapped;
}

export async function importScheduleExcel(params: {
  file: File;
  projectId: string;
  scheduleMonth: string;
  importMode: ScheduleImportMode;
  operatorUserAccountId: string;
}) {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('project_id', params.projectId);
  formData.append('schedule_month', params.scheduleMonth);
  formData.append('import_mode', params.importMode);
  formData.append('operator_user_account_id', params.operatorUserAccountId);

  try {
    return await fetchFunction<ScheduleImportResult>('excel-import', {
      method: 'POST',
      body: formData,
    });
  } catch (error) {
    console.warn('excel-import function 不可用，回退到前端导入逻辑:', error);
  }

  const refs = await loadScheduleMatrixReferences();
  const parsed = parseScheduleWorkbook(await params.file.arrayBuffer(), params.scheduleMonth);
  const versionId = await getOrCreateImportVersion({
    projectId: params.projectId,
    scheduleMonth: params.scheduleMonth,
    importMode: params.importMode,
    operatorUserAccountId: params.operatorUserAccountId,
  });
  const batchId = await createImportBatch({
    projectId: params.projectId,
    scheduleMonth: dayjs(params.scheduleMonth).startOf('month').format('YYYY-MM-DD'),
    importMode: params.importMode,
    scheduleVersionId: versionId,
    operatorUserAccountId: params.operatorUserAccountId,
    fileName: params.file.name,
  });

  try {
    if (params.importMode === 'cover_draft') {
      await supabase
        .from('schedule')
        .delete()
        .eq('schedule_version_id', versionId)
        .gte('schedule_date', dayjs(params.scheduleMonth).startOf('month').format('YYYY-MM-DD'))
        .lte('schedule_date', dayjs(params.scheduleMonth).endOf('month').format('YYYY-MM-DD'));
    }

    const employeeMap = new Map(
      refs.employees.flatMap((employee) => [
        [employee.employeeNo || '', employee],
        [employee.fullName, employee],
      ]),
    );
    const codeMap = new Map(
      refs.codeItems.flatMap((item) => {
        const keys: [string, typeof item][] = [
          [item.itemCode, item],
          [item.itemName, item],
        ];
        // Also match by excel_code if set
        const excelCode = item.extraConfig?.excel_code;
        if (excelCode) keys.push([String(excelCode), item]);
        // Also match by any alias
        try {
          const aliases = item.extraConfig?.aliases;
          const arr = typeof aliases === 'string' ? JSON.parse(aliases) : aliases;
          if (Array.isArray(arr)) {
            arr.forEach((a: string) => { if (a) keys.push([String(a).trim(), item]); });
          }
        } catch { /* ignore */ }
        return keys;
      }),
    );

    // Resolve planned hours directly from schedule_code extra_config
    function resolveImportHours(codeItem: any): number {
      const extra = codeItem?.extraConfig || {};
      if (extra.planned_hours != null) return Number(extra.planned_hours);
      return Number(extra.standard_hours || 8);
    }

    const errors: ScheduleImportError[] = [...parsed.errors];
    const changes: ScheduleCellChange[] = [];

    parsed.rows.forEach((row) => {
      const employee = employeeMap.get(row.employeeNo || '') || employeeMap.get(row.employeeName || '');
      if (!employee) {
        errors.push({
          rowIndex: row.rowIndex,
          employeeNo: row.employeeNo,
          employeeName: row.employeeName,
          message: '未匹配到员工',
        });
        return;
      }

      row.assignments.forEach((assignment) => {
        const codeItem = codeMap.get(assignment.code);
        if (!codeItem) {
          errors.push({
            rowIndex: row.rowIndex,
            employeeNo: row.employeeNo,
            employeeName: row.employeeName,
            scheduleDate: assignment.scheduleDate,
            code: assignment.code,
            message: '未匹配到排班编码',
          });
          return;
        }

        changes.push({
          employeeId: employee.id,
          departmentId: employee.departmentId,
          projectId: params.projectId,
          scheduleDate: assignment.scheduleDate,
          scheduleCodeDictItemId: codeItem.id,
          shiftTypeDictItemId: resolveShiftTypeDictItemId(codeItem),
          plannedHours: resolveImportHours(codeItem),
          sourceType: 'excel',
          remark: `导入批次 ${batchId}`,
          sortOrder: row.rowIndex,
        });
      });
    });

    if (changes.length > 0) {
      await bulkUpsertScheduleCells({
        scheduleVersionId: versionId,
        changes,
      });

      // 自动将导入的员工关联到项目（如果尚未关联）
      const uniqueEmpIds = [...new Set(changes.map(c => c.employeeId))];
      if (uniqueEmpIds.length > 0) {
        const peRows = uniqueEmpIds.map(empId => ({
          project_id: params.projectId,
          employee_id: empId,
          role: 'member',
        }));
        await supabase
          .from('project_employee')
          .upsert(peRows, { onConflict: 'project_id,employee_id' });
      }
    }

    // Labor rule validation on imported data
    let laborRuleWarnings: ScheduleImportResult['laborRuleWarnings'] = undefined;
    if (changes.length > 0) {
      try {
        // Build employee name map for readable messages
        const empNameMap = new Map<string, string>();
        refs.employees.forEach(e => { empNameMap.set(e.id, e.fullName); });

        // Build code category map
        const codeCategoryMap = new Map<string, string>();
        refs.codeItems.forEach(c => {
          codeCategoryMap.set(c.id, c.extraConfig?.category || 'work');
        });

        const entries = changes.map(c => ({
          employeeId: c.employeeId,
          employeeName: empNameMap.get(c.employeeId) || c.employeeId.substring(0, 6),
          date: c.scheduleDate,
          plannedHours: c.plannedHours || 0,
          isWorkDay: codeCategoryMap.get(c.scheduleCodeDictItemId) === 'work',
        }));

        const validationResult = await validateScheduleBatch(entries, params.projectId);
        if (validationResult.hardViolations.length > 0 || validationResult.softViolations.length > 0) {
          laborRuleWarnings = {
            hardViolations: validationResult.hardViolations.map(v => ({ message: v.message, ruleName: v.ruleName })),
            softViolations: validationResult.softViolations.map(v => ({ message: v.message, ruleName: v.ruleName })),
          };
        }
      } catch {
        // Validation errors don't block the import
      }
    }

    await updateImportBatch(batchId, {
      processing_status: errors.length > 0 ? 'completed_with_errors' : 'completed',
      total_row_count: changes.length + errors.length,
      success_row_count: changes.length,
      failed_row_count: errors.length,
      completed_at: new Date().toISOString(),
    });

    return {
      success: true,
      scheduleVersionId: versionId,
      batchId,
      importedRows: changes.length,
      failedRows: errors.length,
      errors,
      message: errors.length > 0 ? '导入完成，但存在部分错误' : '导入成功',
      laborRuleWarnings,
    } satisfies ScheduleImportResult;
  } catch (error) {
    await updateImportBatch(batchId, {
      processing_status: 'failed',
      failed_row_count: 1,
      completed_at: new Date().toISOString(),
    });
    throw toAppError(error, '导入 Excel 失败');
  }
}
