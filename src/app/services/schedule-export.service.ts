import dayjs from 'dayjs';
import { supabase, supabaseUrl, publicAnonKey } from '@/app/lib/supabase/client';
import { buildScheduleWorkbook } from '@/app/lib/schedule/excel';
import { toAppError } from '@/app/lib/supabase/errors';
import type { ScheduleExportResult } from '@/app/types/schedule-import';

async function fetchFunction<T>(functionName: string, body: Record<string, any>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publicAnonKey,
      Authorization: `Bearer ${accessToken || publicAnonKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`${functionName} ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function exportScheduleExcel(params: {
  projectId: string;
  scheduleVersionId: string;
  scheduleMonth: string;
}) {
  try {
    const result = await fetchFunction<{ file_name: string; base64_content: string }>('excel-export', {
      project_id: params.projectId,
      schedule_version_id: params.scheduleVersionId,
      schedule_month: params.scheduleMonth,
    });
    const binaryString = atob(result.base64_content);
    const bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
    return {
      fileName: result.file_name,
      blob: new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    } satisfies ScheduleExportResult;
  } catch (error) {
    console.warn('excel-export function 不可用，回退到前端导出逻辑:', error);
  }

  const [scheduleRes, employeeRes, departmentRes, dictRes, projectRes] = await Promise.all([
    supabase
      .from('schedule')
      .select('*')
      .eq('schedule_version_id', params.scheduleVersionId)
      .order('schedule_date'),
    supabase.from('employee').select('id, employee_no, full_name, department_id'),
    supabase.from('department').select('id, department_name'),
    supabase.from('dict_item').select('id, item_code, item_name'),
    supabase.from('project').select('id, project_name').eq('id', params.projectId).limit(1),
  ]);

  if (scheduleRes.error || employeeRes.error || departmentRes.error || dictRes.error || projectRes.error) {
    throw toAppError(
      scheduleRes.error || employeeRes.error || departmentRes.error || dictRes.error || projectRes.error,
      '导出 Excel 失败',
    );
  }

  const projectName = (projectRes.data as any)?.[0]?.project_name || '项目';

  const employeeMap = new Map((employeeRes.data || []).map((row: any) => [row.id, row]));
  const departmentMap = new Map((departmentRes.data || []).map((row: any) => [row.id, row.department_name]));
  const codeMap = new Map((dictRes.data || []).map((row: any) => [row.id, row.item_name]));

  const rowMap = new Map<
    string,
    {
      employeeNo?: string | null;
      employeeName: string;
      departmentName?: string | null;
      codesByDate: Record<string, string>;
    }
  >();

  (scheduleRes.data || []).forEach((row: any) => {
    const employee = employeeMap.get(row.employee_id);
    if (!employee) {
      return;
    }

    const current = rowMap.get(employee.id) || {
      employeeNo: employee.employee_no,
      employeeName: employee.full_name,
      departmentName: departmentMap.get(employee.department_id),
      codesByDate: {} as Record<string, string>,
    };

    current.codesByDate[row.schedule_date] = codeMap.get(row.schedule_code_dict_item_id) || '';
    rowMap.set(employee.id, current);
  });

  const workbook = buildScheduleWorkbook({
    scheduleMonth: params.scheduleMonth,
    projectName,
    rows: Array.from(rowMap.values()),
  });

  return {
    fileName: `schedule-${dayjs(params.scheduleMonth).format('YYYY-MM')}-v${params.scheduleVersionId.slice(0, 8)}.xlsx`,
    blob: new Blob([workbook], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  } satisfies ScheduleExportResult;
}

export function triggerScheduleExportDownload(result: ScheduleExportResult) {
  const href = URL.createObjectURL(result.blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(href);
}
