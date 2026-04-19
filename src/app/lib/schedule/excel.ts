import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { AppError } from '@/app/lib/supabase/errors';
import type { ScheduleImportError } from '@/app/types/schedule-import';

export type ParsedScheduleExcelRow = {
  rowIndex: number;
  employeeNo?: string;
  employeeName?: string;
  departmentName?: string;
  assignments: Array<{
    scheduleDate: string;
    code: string;
  }>;
};

function normalizeHeaderDate(value: unknown) {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) {
      return null;
    }
    return dayjs(`${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`).format('YYYY-MM-DD');
  }

  if (typeof value === 'string') {
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : null;
  }

  if (value instanceof Date) {
    return dayjs(value).format('YYYY-MM-DD');
  }

  return null;
}

export function parseScheduleWorkbook(buffer: ArrayBuffer, scheduleMonth: string) {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new AppError('Excel 文件中缺少工作表', 'INVALID_EXCEL_FILE');
  }

  const rows = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: true,
    defval: '',
  });

  if (rows.length < 2) {
    throw new AppError('Excel 模板内容为空', 'INVALID_EXCEL_FILE');
  }

  const headerRow = rows[0];
  if (String(headerRow[0]).trim() !== '工号' || String(headerRow[1]).trim() !== '姓名' || String(headerRow[2]).trim() !== '部门') {
    throw new AppError('模板表头必须为：工号、姓名、部门、日期列', 'INVALID_EXCEL_TEMPLATE');
  }

  const monthPrefix = dayjs(scheduleMonth).format('YYYY-MM');
  const dateColumns = headerRow.slice(3).map((header, index) => {
    const normalizedDate = normalizeHeaderDate(header);
    if (!normalizedDate || !normalizedDate.startsWith(monthPrefix)) {
      throw new AppError(`第 ${index + 4} 列日期表头无效或不属于导入月份`, 'INVALID_EXCEL_TEMPLATE');
    }
    return normalizedDate;
  });

  const parsedRows: ParsedScheduleExcelRow[] = [];
  const errors: ScheduleImportError[] = [];

  rows.slice(1).forEach((row, rowOffset) => {
    const rowIndex = rowOffset + 2;
    const employeeNo = String(row[0] ?? '').trim();
    const employeeName = String(row[1] ?? '').trim();
    const departmentName = String(row[2] ?? '').trim();

    if (!employeeNo && !employeeName) {
      return;
    }

    const assignments = dateColumns
      .map((scheduleDate, dateIndex) => ({
        scheduleDate,
        code: String(row[dateIndex + 3] ?? '').trim(),
      }))
      .filter((item) => item.code);

    if (assignments.length === 0) {
      errors.push({
        rowIndex,
        employeeNo,
        employeeName,
        message: '该行没有可导入的排班编码',
      });
      return;
    }

    parsedRows.push({
      rowIndex,
      employeeNo,
      employeeName,
      departmentName,
      assignments,
    });
  });

  return {
    rows: parsedRows,
    errors,
  };
}

export function buildScheduleWorkbook(input: {
  scheduleMonth: string;
  rows: Array<{
    employeeNo?: string | null;
    employeeName: string;
    departmentName?: string | null;
    codesByDate: Record<string, string>;
  }>;
}) {
  const start = dayjs(input.scheduleMonth).startOf('month');
  const daysInMonth = start.daysInMonth();
  const header = ['工号', '姓名', '部门'];

  for (let day = 0; day < daysInMonth; day += 1) {
    header.push(start.add(day, 'day').format('YYYY-MM-DD'));
  }

  const sheetData = [
    header,
    ...input.rows.map((row) => [
      row.employeeNo || '',
      row.employeeName,
      row.departmentName || '',
      ...Array.from({ length: daysInMonth }).map((_, index) => {
        const scheduleDate = start.add(index, 'day').format('YYYY-MM-DD');
        return row.codesByDate[scheduleDate] || '';
      }),
    ]),
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '排班导出');
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}
