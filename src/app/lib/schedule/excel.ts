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

// ============================================================
//  格式1：旧格式 — 工号|姓名|部门|日期列
//  格式2：新格式 — 标题行 / 日期数字行 / 星期行 / 员工行（姓名在B列）
// ============================================================

function normalizeHeaderDate(value: unknown) {
  if (typeof value === 'number') {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return dayjs(
      `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`,
    ).format('YYYY-MM-DD');
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

/**
 * 在前 5 行内定位包含"排班"或"项目"字样的标题行
 */
function findTitleRowIndex(rows: any[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    const text = (rows[i] ?? []).map((c: any) => String(c ?? '').trim()).filter(Boolean).join('');
    if (text.includes('排班') || text.includes('项目')) return i;
  }
  return -1;
}

/**
 * 将单元格解析为完整日期字符串 "YYYY-MM-DD"。
 * 支持:
 *  - Excel 日期序列号（如 46113 => 2026-04-01）
 *  - 纯数字 1~31（需配合 year/month 参数组装完整日期）
 */
function parseCellToFullDate(cell: any, fallbackYear?: number, fallbackMonth?: number): string | null {
  const v = Number(cell);
  if (!Number.isFinite(v)) return null;

  // Excel 日期序列号 (>= 1 代表 1900-01-01 起的天数, 实际日期值通常 > 40000)
  if (v > 366) {
    const parsed = XLSX.SSF.parse_date_code(v);
    if (parsed) {
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${mm}-${dd}`;
    }
  }

  // 纯日数 1~31，需要有年月上下文
  if (Number.isInteger(v) && v >= 1 && v <= 31 && fallbackYear && fallbackMonth) {
    const d = new Date(fallbackYear, fallbackMonth - 1, v);
    if (d.getFullYear() === fallbackYear && d.getMonth() + 1 === fallbackMonth) {
      const mm = String(fallbackMonth).padStart(2, '0');
      const dd = String(v).padStart(2, '0');
      return `${fallbackYear}-${mm}-${dd}`;
    }
  }

  return null;
}

/** 从标题文字中提取年月，如 "项目排班表(2026年4月)" => { year: 2026, month: 4 } */
function extractYearMonthFromTitle(title: string): { year: number; month: number } | null {
  const m = title.match(/(\d{4})[年\-\/](\d{1,2})/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/** 判断某行是否为"姓名"标题行 */
function isHeaderLabelRow(row: any[]): boolean {
  const firstCell = String(row[0] ?? '').trim();
  return firstCell === '姓名' || firstCell === '工号';
}

/** 判断某行是否为星期行（包含一二三等中文但不包含排班编码） */
function isWeekdayRow(row: any[]): boolean {
  const text = row.map((c: any) => String(c ?? '').trim()).join('');
  return /[一二三四五六日]{2,}/.test(text) && !/休|班/.test(text);
}

/** 非员工姓名的关键词，用于过滤汇总行 */
const NON_EMPLOYEE_KEYWORDS = ['总出勤', '出勤率', '合计', '小计', '总计', '备注', '月度', '人力统计'];
function isNonEmployeeRow(cellValue: string): boolean {
  return NON_EMPLOYEE_KEYWORDS.some(kw => cellValue.includes(kw));
}

/**
 * 检测是否为「项目排班表」新格式
 */
function detectNewFormat(rows: any[][]): boolean {
  if (rows.length < 3) return false;

  const titleIdx = findTitleRowIndex(rows);
  if (titleIdx === -1) return false;

  // 标题行下一行应该包含可解析为日期（序列号或1~31）的单元格
  const dateRow = rows[titleIdx + 1] ?? [];
  const hasDateLikeCells = dateRow.some((cell: any) => {
    const v = Number(cell);
    if (!Number.isFinite(v)) return false;
    // Excel 序列号
    if (v > 366) return XLSX.SSF.parse_date_code(v) !== null && XLSX.SSF.parse_date_code(v) !== undefined;
    // 纯日数
    return Number.isInteger(v) && v >= 1 && v <= 31;
  });

  return hasDateLikeCells;
}

/**
 * 解析「项目排班表」格式（新格式）。
 *
 * 核心改进：
 *   - 日期列通过 Excel 序列号解析出完整 YYYY-MM-DD，只保留属于目标 scheduleMonth 的列
 *   - 智能跳过"姓名"标题行和星期行
 *   - 过滤"总出勤"等汇总行
 *   - 忽略日期列之后的统计列（通过 colToDate 映射精准匹配）
 */
function parseNewFormat(
  rows: any[][],
  scheduleMonth: string,
): { rows: ParsedScheduleExcelRow[]; errors: ScheduleImportError[] } {
  const errors: ScheduleImportError[] = [];
  const parsedRows: ParsedScheduleExcelRow[] = [];
  const monthBase = dayjs(scheduleMonth).startOf('month');
  const targetMonthPrefix = monthBase.format('YYYY-MM');

  const titleIdx = findTitleRowIndex(rows);
  // 尝试从标题提取年月，用于纯数字日期的回退解析
  const titleRow = rows[titleIdx] ?? [];
  const titleText = titleRow.map((c: any) => String(c ?? '').trim()).find((s) => /\d{4}/.test(s)) ?? '';
  const titleYM = extractYearMonthFromTitle(titleText);

  // 日期行（标题行的下一行）
  const dateRow = rows[titleIdx + 1] ?? [];

  // 先扫描：如果日期行中存在 Excel 序列号 (>366)，则只用序列号模式
  // 这样可避免日期列后面的统计数字（8, 1, 5 等）被误判成日期
  const hasSerialNumbers = dateRow.some((cell: any) => {
    const v = Number(cell);
    return Number.isFinite(v) && v > 366 && XLSX.SSF.parse_date_code(v) != null;
  });

  const colToDate = new Map<number, string>();
  dateRow.forEach((cell, colIdx) => {
    const v = Number(cell);
    if (!Number.isFinite(v)) return;

    let fullDate: string | null = null;
    if (v > 366) {
      // Excel 日期序列号
      fullDate = parseCellToFullDate(cell);
    } else if (!hasSerialNumbers && Number.isInteger(v) && v >= 1 && v <= 31) {
      // 纯数字日期模式（行内无序列号时才启用，防止统计列干扰）
      fullDate = parseCellToFullDate(cell, titleYM?.year, titleYM?.month);
    }
    if (!fullDate) return;
    // 只保留属于目标导入月份的列
    if (!fullDate.startsWith(targetMonthPrefix)) return;
    colToDate.set(colIdx, fullDate);
  });

  if (colToDate.size === 0) {
    // 没有任何列匹配目标月份 — 静默跳过此 Sheet（可能是其他月份的表）
    return { rows: parsedRows, errors };
  }

  // 从日期行之后开始，智能跳过"姓名"标题行和星期行
  let firstDataRowIndex = titleIdx + 2;
  while (firstDataRowIndex < rows.length) {
    const candidate = rows[firstDataRowIndex];
    if (isHeaderLabelRow(candidate) || isWeekdayRow(candidate)) {
      firstDataRowIndex++;
    } else {
      break;
    }
  }

  rows.slice(firstDataRowIndex).forEach((row, offset) => {
    const rowIndex = firstDataRowIndex + offset + 1; // 1-based Excel 行号

    // 姓名优先取 A 列（index 0），若为空则取 B 列（index 1）
    const cellA = String(row[0] ?? '').trim();
    const cellB = String(row[1] ?? '').trim();
    const employeeName = cellA || cellB;

    if (!employeeName) return; // 空白行跳过
    if (isNonEmployeeRow(employeeName)) return; // 汇总行跳过

    const assignments: { scheduleDate: string; code: string }[] = [];
    colToDate.forEach((scheduleDate, colIdx) => {
      const code = String(row[colIdx] ?? '').trim();
      if (code) assignments.push({ scheduleDate, code });
    });

    if (assignments.length === 0) {
      // 该行在目标月份没有任何排班数据，静默跳过
      return;
    }

    parsedRows.push({
      rowIndex,
      employeeName,
      assignments,
    });
  });

  return { rows: parsedRows, errors };
}

/** 检测是否为旧格式 */
export function detectOldFormat(rows: any[][]): boolean {
  if (rows.length < 2) return false;
  const headerRow = rows[0] ?? [];
  return (
    String(headerRow[0] ?? '').trim() === '工号' &&
    String(headerRow[1] ?? '').trim() === '姓名' &&
    String(headerRow[2] ?? '').trim() === '部门'
  );
}

/**
 * 解析「旧格式」：工号 | 姓名 | 部门 | 日期列
 */
function parseOldFormat(
  rows: any[][],
  scheduleMonth: string,
): { rows: ParsedScheduleExcelRow[]; errors: ScheduleImportError[] } {
  const headerRow = rows[0];

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

    if (!employeeNo && !employeeName) return;

    const assignments = dateColumns
      .map((scheduleDate, dateIndex) => ({
        scheduleDate,
        code: String(row[dateIndex + 3] ?? '').trim(),
      }))
      .filter((item) => item.code);

    if (assignments.length === 0) {
      errors.push({ rowIndex, employeeNo, employeeName, message: '该行没有可导入的排班编码' });
      return;
    }

    parsedRows.push({ rowIndex, employeeNo, employeeName, departmentName, assignments });
  });

  return { rows: parsedRows, errors };
}

/** 统一入口：自动检测格式并解析，遍历所有 Sheet */
export function parseScheduleWorkbook(
  buffer: ArrayBuffer,
  scheduleMonth: string,
): { rows: ParsedScheduleExcelRow[]; errors: ScheduleImportError[] } {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const allRows: ParsedScheduleExcelRow[] = [];
  const allErrors: ScheduleImportError[] = [];
  let foundAnyValidSheet = false;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // 使用 defval: '' 确保数组能对齐，防止空列越界
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, raw: true, defval: '' });
    if (rows.length < 2) continue;

    if (detectNewFormat(rows)) {
      const result = parseNewFormat(rows, scheduleMonth);
      // 只有实际解析到员工行时才算"找到有效 Sheet"
      if (result.rows.length > 0) {
        foundAnyValidSheet = true;
        allRows.push(...result.rows);
      }
      const contextualErrors = result.errors.map(e => ({
        ...e,
        message: `[工作表 ${sheetName}] ` + e.message
      }));
      allErrors.push(...contextualErrors);
    } else if (detectOldFormat(rows)) {
      foundAnyValidSheet = true;
      const result = parseOldFormat(rows, scheduleMonth);
      allRows.push(...result.rows);
      const contextualErrors = result.errors.map(e => ({
        ...e,
        message: `[工作表 ${sheetName}] ` + e.message
      }));
      allErrors.push(...contextualErrors);
    }
    // 不匹配任何已知格式的 Sheet（如"班次"定义表、"演员信息表"等）=> 自动忽略
  }

  if (!foundAnyValidSheet) {
    throw new AppError(
      '未在 Excel 中检测到属于目标月份的有效排班数据，请确认文件和导入月份是否匹配。',
      'INVALID_EXCEL_TEMPLATE',
    );
  }

  // 跨 Sheet 去重：同一员工 + 同一日期只保留最后出现的排班（后面 Sheet 覆盖前面）
  const deduplicatedRows = deduplicateByEmployeeDate(allRows);

  return { rows: deduplicatedRows, errors: allErrors };
}

/**
 * 跨 Sheet 去重：同一员工的同一日期排班只保留最后出现的那条。
 * 这样当多个 Sheet 描述同一员工（如"汇总"表和"4月班表"同时包含"文杰"）时，
 * 后处理的 Sheet 数据会覆盖先处理的，不会产生冲突。
 */
function deduplicateByEmployeeDate(rows: ParsedScheduleExcelRow[]): ParsedScheduleExcelRow[] {
  // key = "employeeName|scheduleDate" => 最新的 code
  const seen = new Map<string, { code: string; rowIndex: number }>();
  // 收集每个员工的出现顺序
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

  // 重新按员工顺序构建去重后的结果
  return employeeOrder.map(name => {
    const assignments: { scheduleDate: string; code: string }[] = [];
    let rowIndex = 0;
    seen.forEach((val, key) => {
      if (key.startsWith(`${name}|`)) {
        const date = key.slice(name.length + 1);
        assignments.push({ scheduleDate: date, code: val.code });
        rowIndex = val.rowIndex;
      }
    });
    // 按日期排序
    assignments.sort((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
    const original = rows.find(r => (r.employeeName ?? r.employeeNo) === name);
    return {
      rowIndex,
      employeeName: original?.employeeName,
      employeeNo: original?.employeeNo,
      departmentName: original?.departmentName,
      assignments,
    };
  });
}

// ============================================================
//  构建导出表格（新格式 — 匹配「项目排班表」模板）
//  Row 0: 合并标题 "XXX排班表（2026年4月）"
//  Row 1: 姓名 | 1 | 2 | 3 | ... (日号)
//  Row 2:      | 三 | 四 | 五 | ... (星期)
//  Row 3+: 员工姓名 | 排班编码名称 ...
// ============================================================
export function buildScheduleWorkbook(input: {
  scheduleMonth: string;
  projectName?: string;
  rows: Array<{
    employeeNo?: string | null;
    employeeName: string;
    departmentName?: string | null;
    codesByDate: Record<string, string>;
  }>;
}) {
  const start = dayjs(input.scheduleMonth).startOf('month');
  const daysInMonth = start.daysInMonth();
  const year = start.year();
  const month = start.month() + 1;
  const WEEKDAY_MAP = ['日', '一', '二', '三', '四', '五', '六'];
  const projectLabel = input.projectName || '项目';

  // Row 0: 合并标题
  const titleRow: any[] = [`${projectLabel}排班表（${year}年${month}月）`];

  // Row 1: 姓名 + 日号（使用 Excel 日期序列号以匹配模板格式）
  const dateNumRow: any[] = ['姓名'];
  // Row 2: 空 + 星期
  const weekdayRow: any[] = [''];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = start.date(d);
    dateNumRow.push(d);
    weekdayRow.push(WEEKDAY_MAP[date.day()]);
  }

  // Row 3+: 员工数据行
  const dataRows = input.rows.map(row => {
    const cells: any[] = [row.employeeName];
    for (let d = 0; d < daysInMonth; d++) {
      const scheduleDate = start.add(d, 'day').format('YYYY-MM-DD');
      cells.push(row.codesByDate[scheduleDate] || '');
    }
    return cells;
  });

  const sheetData = [titleRow, dateNumRow, weekdayRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // 合并第1行标题
  const totalCols = daysInMonth + 1;
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

  // 行高
  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 28 };
  ws['!rows'][1] = { hpt: 22 };
  ws['!rows'][2] = { hpt: 20 };

  // 列宽
  ws['!cols'] = [
    { wch: 10 },
    ...Array.from({ length: daysInMonth }, () => ({ wch: 5 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '排班表');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}

// ============================================================
//  生成「项目排班表」格式的模板（供用户下载填写）
// ============================================================
export function buildScheduleImportTemplate(scheduleMonth: string, projectName = '项目', exampleCodes?: string[]) {
  const start = dayjs(scheduleMonth).startOf('month');
  const daysInMonth = start.daysInMonth();
  const year = start.year();
  const month = start.month() + 1;

  const WEEKDAY_MAP = ['日', '一', '二', '三', '四', '五', '六'];

  // 第1行：标题（只填 A1，其余为空，合并单元格范围后续设置）
  const titleRow = [`${projectName}排班表（${year}年${month}月）`];

  // 第2行：A列"姓名"，B列起填日期数字
  const dateRow = ['姓名'];
  const weekRow = [''];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = start.date(d);
    dateRow.push(String(d));
    weekRow.push(WEEKDAY_MAP[date.day()]);
  }

  // 示例数据行：从字典编码动态生成，无字典时使用通用占位
  const codes = exampleCodes && exampleCodes.length > 0 ? exampleCodes : ['编码1', '编码2'];
  const code1 = codes[0] || '编码1';
  const code2 = codes[1] || codes[0] || '编码2';
  const exampleRow1 = ['员工A', ...Array.from({ length: daysInMonth }, (_, i) => (i === 0 ? '(留空即跳过)' : code1))];
  const exampleRow2 = ['员工B', ...Array.from({ length: daysInMonth }, () => code2)];

  const sheetData = [titleRow, dateRow, weekRow, exampleRow1, exampleRow2];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // 合并第1行标题单元格（A1 到最后一列）
  const totalCols = daysInMonth + 1; // 姓名列 + 日期列
  if (!ws['!merges']) ws['!merges'] = [];
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } });

  // 第1行行高、加粗
  if (!ws['!rows']) ws['!rows'] = [];
  ws['!rows'][0] = { hpt: 28 };
  ws['!rows'][1] = { hpt: 22 };
  ws['!rows'][2] = { hpt: 20 };

  // 列宽
  ws['!cols'] = [
    { wch: 14 }, // 姓名列
    ...Array.from({ length: daysInMonth }, () => ({ wch: 5 })),
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '排班表');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
}
