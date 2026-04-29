import * as XLSX from 'xlsx';
import { saveEmployeeRecord } from './master-data.service';
import { supabase } from '@/app/lib/supabase/client';
import type { ReferenceOption } from '@/app/types/master-data';

/** Excel 列名与内部字段的映射 */
export const EMPLOYEE_COLUMN_HEADERS = [
  '工号',
  '姓名*',
  '手机号*',
  '部门名称*',
  '渠道名称*',
  '劳务关系',
  '入职日期(YYYY-MM-DD)',
  '技能（多个用顿号分隔）',
  '备注',
];

/** 导出当前员工列表为 Excel 文件（含技能列） */
export async function exportEmployeesToExcel(
  employees: {
    id: string;
    employeeNo: string;
    fullName: string;
    mobileNumber: string;
    departmentId: string;
    channelId: string;
    laborRelationDictItemId?: string | null;
    onboardDate?: string | null;
    remark?: string | null;
  }[],
  deptMap: Record<string, string>,
  channelMap: Record<string, string>,
  laborRelationMap?: Record<string, string>,
  fileName = '员工列表.xlsx',
) {
  // 批量查询所有员工的技能关联
  const employeeIds = employees.map(e => e.id);
  const skillsByEmployee: Record<string, string[]> = {};

  if (employeeIds.length > 0) {
    const { data: esData } = await supabase
      .from('employee_skill')
      .select('employee_id, skill:skill_id(skill_name)')
      .in('employee_id', employeeIds)
      .eq('is_enabled', true);

    if (esData) {
      for (const row of esData as any[]) {
        const empId = row.employee_id;
        const skillName = row.skill?.skill_name;
        if (skillName) {
          if (!skillsByEmployee[empId]) skillsByEmployee[empId] = [];
          skillsByEmployee[empId].push(skillName);
        }
      }
    }
  }

  const rows = employees.map((emp) => [
    emp.employeeNo,
    emp.fullName,
    emp.mobileNumber,
    deptMap[emp.departmentId] || emp.departmentId,
    channelMap[emp.channelId] || emp.channelId,
    emp.laborRelationDictItemId && laborRelationMap ? (laborRelationMap[emp.laborRelationDictItemId] || '') : '',
    emp.onboardDate || '',
    (skillsByEmployee[emp.id] || []).join('、'),
    emp.remark || '',
  ]);

  const sheetData = [EMPLOYEE_COLUMN_HEADERS, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // 设置列宽
  ws['!cols'] = [
    { wch: 18 }, // 工号
    { wch: 14 }, // 姓名
    { wch: 14 }, // 手机号
    { wch: 18 }, // 部门
    { wch: 18 }, // 渠道
    { wch: 14 }, // 劳务关系
    { wch: 18 }, // 入职日期
    { wch: 30 }, // 技能
    { wch: 30 }, // 备注
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '员工数据');
  XLSX.writeFile(wb, fileName);
}

/** 下载导入模板（空表头） */
export function downloadEmployeeTemplate() {
  const sheetData = [
    EMPLOYEE_COLUMN_HEADERS,
    ['（可填可不填，留空系统自动生成）', '张三', '13800138000', '参照部门名称填写', '参照渠道名称填写', '正式员工', '2025-01-01', '罗湖、福田', '备注说明'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 28 }, // 工号
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
    { wch: 20 },
    { wch: 20 },
    { wch: 30 }, // 技能
    { wch: 30 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '员工导入模板');
  XLSX.writeFile(wb, '员工导入模板.xlsx');
}

export type ImportRow = {
  rowIndex: number;
  employeeNo: string;
  fullName: string;
  mobileNumber: string;
  departmentName: string;
  channelName: string;
  laborRelationName: string;
  onboardDate: string;
  skillNames: string;
  remark: string;
  error?: string;
};

/** 列名关键词匹配规则：从表头自动识别列位置 */
const COLUMN_MATCHERS: { field: keyof Omit<ImportRow, 'rowIndex' | 'error'>; keywords: string[] }[] = [
  { field: 'employeeNo',       keywords: ['工号', '编号', '员工编号', 'emp'] },
  { field: 'fullName',         keywords: ['姓名', '名字', '员工姓名', 'name'] },
  { field: 'mobileNumber',     keywords: ['手机', '电话', '联系方式', 'mobile', 'phone'] },
  { field: 'departmentName',   keywords: ['部门', 'dept', 'department'] },
  { field: 'channelName',      keywords: ['渠道', 'channel'] },
  { field: 'laborRelationName',keywords: ['劳务', '用工', '关系', 'labor'] },
  { field: 'onboardDate',      keywords: ['入职', '日期', 'date', 'onboard'] },
  { field: 'skillNames',       keywords: ['技能', 'skill'] },
  { field: 'remark',           keywords: ['备注', '说明', 'remark', 'note'] },
];

/** 根据表头行自动检测列位置，返回 field → columnIndex 映射 */
function detectColumnMapping(headerRow: any[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const usedIndices = new Set<number>();

  for (const matcher of COLUMN_MATCHERS) {
    for (let i = 0; i < headerRow.length; i++) {
      if (usedIndices.has(i)) continue;
      const headerText = String(headerRow[i] || '').trim().toLowerCase();
      if (!headerText) continue;
      const matched = matcher.keywords.some(kw => headerText.includes(kw.toLowerCase()));
      if (matched) {
        mapping[matcher.field] = i;
        usedIndices.add(i);
        break;
      }
    }
  }

  return mapping;
}

/** 解析上传的 Excel 文件（自动识别列位置，兼容不同顺序的表格） */
export function parseEmployeeExcel(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rows.length === 0) {
          resolve([]);
          return;
        }

        // 尝试自动检测列位置
        const headerRow = rows[0];
        const colMap = detectColumnMapping(headerRow);

        // 如果连姓名和手机号都没匹配到，回退到固定索引
        const useAutoDetect = colMap['fullName'] !== undefined && colMap['mobileNumber'] !== undefined;

        const getVal = (row: any[], field: string, fallbackIdx: number): string => {
          const idx = useAutoDetect ? (colMap[field] ?? fallbackIdx) : fallbackIdx;
          return String(row[idx] ?? '').trim();
        };

        // 跳过表头行（第一行）
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ''));

        const result: ImportRow[] = dataRows.map((row, idx) => {
          const employeeNo       = getVal(row, 'employeeNo', 0);
          const fullName         = getVal(row, 'fullName', 1);
          const mobileNo         = getVal(row, 'mobileNumber', 2);
          const deptName         = getVal(row, 'departmentName', 3);
          const channelName      = getVal(row, 'channelName', 4);
          const laborRelationName= getVal(row, 'laborRelationName', 5);
          let   onboardDate      = getVal(row, 'onboardDate', 6);
          const skillNames       = getVal(row, 'skillNames', 7);
          const remark           = getVal(row, 'remark', 8);

          // 智能日期格式处理：Excel 数值日期 → YYYY-MM-DD
          const onboardIdx = useAutoDetect ? (colMap['onboardDate'] ?? 6) : 6;
          const rawDateCell = row[onboardIdx];
          if (typeof rawDateCell === 'number' && rawDateCell > 30000 && rawDateCell < 100000) {
            // Excel 日期序列号转换
            const excelEpoch = new Date(1899, 11, 30);
            const d = new Date(excelEpoch.getTime() + rawDateCell * 86400000);
            onboardDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          } else if (onboardDate && /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(onboardDate)) {
            // 处理 YYYY/MM/DD 格式
            onboardDate = onboardDate.replace(/\//g, '-').replace(/-(\d)(?=-|$)/g, '-0$1');
          }

          let error = '';
          if (!fullName)  error += '姓名不能为空；';
          if (!mobileNo)  error += '手机号不能为空；';
          if (mobileNo && !/^1\d{10}$/.test(mobileNo)) error += '手机号格式错误；';
          if (!deptName)  error += '部门名称不能为空；';
          if (!channelName) error += '渠道名称不能为空；';
          if (onboardDate && !/^\d{4}-\d{2}-\d{2}$/.test(onboardDate)) error += '日期格式应为 YYYY-MM-DD；';

          return {
            rowIndex: idx + 2,
            employeeNo,
            fullName,
            mobileNumber: mobileNo,
            departmentName: deptName,
            channelName,
            laborRelationName,
            onboardDate,
            skillNames,
            remark,
            error: error || undefined,
          };
        });

        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsArrayBuffer(file);
  });
}

/** 批量导入员工（返回成功数 / 失败行信息 / 账号开通统计） */
export async function batchImportEmployees(
  rows: ImportRow[],
  departments: ReferenceOption[],
  channels: ReferenceOption[],
  projectId?: string,
): Promise<{
  successCount: number;
  skippedCount: number;
  skippedRows: { rowIndex: number; name: string; reason: string }[];
  failedRows: { rowIndex: number; name: string; reason: string }[];
  warningRows: { rowIndex: number; name: string; reason: string }[];
  accountProvisionResult: { success: number; failed: number; errors: string[] };
}> {
  const deptLabelMap = Object.fromEntries(departments.map((d) => [d.label.trim(), d.id]));
  const channelLabelMap = Object.fromEntries(channels.map((c) => [c.label.trim(), c.id]));

  // 预加载所有技能（用于名称→ID映射）
  const { data: allSkills } = await supabase
    .from('skill')
    .select('id, skill_name')
    .eq('is_enabled', true);
  const skillNameMap = new Map<string, string>();
  (allSkills || []).forEach((s: any) => {
    skillNameMap.set(s.skill_name.trim(), s.id);
  });

  // 动态查询默认员工状态：优先取 item_code='active'，其次取第一个员工状态字典项
  let defaultStatusId: string | null = null;
  try {
    const { data: statusItems } = await supabase
      .from('dict_item')
      .select('id, item_code, dict_type!inner(type_code)')
      .eq('dict_type.type_code', 'employee_status')
      .order('sort_order');

    if (statusItems && statusItems.length > 0) {
      // 优先找 active，其次找正常，其次找直接第一个
      const active  = statusItems.find((s: any) => s.item_code === 'active');
      const normal  = statusItems.find((s: any) => ['normal', '正常', 'DI_MO6XXKV0'].includes(s.item_code));
      defaultStatusId = (active || normal || statusItems[0]).id;
    }
  } catch {
    // 查询失败时保持 null，后续每行会报 DB 错误后已有错误提示
  }

  // 预加载劳务关系字典项（名称→ID映射）
  const laborRelationNameMap = new Map<string, string>();
  let defaultLaborRelationId: string | null = null;
  try {
    const { data: lrItems } = await supabase
      .from('dict_item')
      .select('id, item_code, item_name, dict_type!inner(type_code)')
      .eq('dict_type.type_code', 'labor_relation_type')
      .eq('is_enabled', true)
      .order('sort_order');
    if (lrItems && lrItems.length > 0) {
      lrItems.forEach((item: any) => {
        laborRelationNameMap.set(item.item_name.trim(), item.id);
      });
      // 默认为"正式员工"
      const formal = lrItems.find((s: any) => s.item_code === 'formal');
      defaultLaborRelationId = (formal || lrItems[0]).id;
    }
  } catch { /* ignore */ }

  // 预加载 employee 角色 ID（用于自动开通账号）
  let employeeRoleId: string | null = null;
  try {
    const { data: roleData } = await supabase
      .from('role')
      .select('id')
      .eq('role_code', 'employee')
      .single();
    if (roleData) employeeRoleId = roleData.id;
  } catch { /* ignore */ }

  // 预加载已有账号的手机号和员工ID集合（避免重复开通）
  const existingAccountMobiles = new Set<string>();
  const existingAccountEmpIds = new Set<string>();
  try {
    const { data: existingAccounts } = await supabase
      .from('user_account')
      .select('username, employee_id');
    (existingAccounts || []).forEach((a: any) => {
      if (a.username) existingAccountMobiles.add(a.username);
      if (a.employee_id) existingAccountEmpIds.add(a.employee_id);
    });
  } catch { /* ignore */ }

  let successCount = 0;
  let skippedCount = 0;
  const skippedRows: { rowIndex: number; name: string; reason: string }[] = [];
  const failedRows: { rowIndex: number; name: string; reason: string }[] = [];

  // 账号开通统计
  const accountProvisionResult = { success: 0, failed: 0, errors: [] as string[] };
  const warningRows: { rowIndex: number; name: string; reason: string }[] = [];

  // 收集成功导入的员工信息（用于后续自动开通账号）
  const importedEmployees: { id: string; fullName: string; mobileNumber: string }[] = [];
  // 收集已存在的员工（用于关联项目，但不重复创建）
  const existingEmployeesForProject: { id: string; fullName: string }[] = [];

  // 预加载系统中所有员工的手机号→ID映射（用于判断是否已存在）
  const existingEmpByMobile = new Map<string, { id: string; fullName: string }>();
  try {
    const { data: allEmps } = await supabase
      .from('employee')
      .select('id, full_name, mobile_number');
    (allEmps || []).forEach((e: any) => {
      if (e.mobile_number) {
        existingEmpByMobile.set(e.mobile_number, { id: e.id, fullName: e.full_name });
      }
    });
  } catch { /* ignore */ }

  // 本地校验失败的行直接跳过
  const validRows = rows.filter((row) => !row.error);
  const invalidRows = rows.filter((row) => !!row.error);

  for (const row of invalidRows) {
    failedRows.push({ rowIndex: row.rowIndex, name: row.fullName || `第${row.rowIndex}行`, reason: row.error! });
  }

  for (const row of validRows) {
    const departmentId = deptLabelMap[row.departmentName];
    const channelId    = channelLabelMap[row.channelName];

    if (!departmentId) {
      failedRows.push({ rowIndex: row.rowIndex, name: row.fullName, reason: `找不到部门"${row.departmentName}"，请核对部门名称` });
      continue;
    }
    if (!channelId) {
      failedRows.push({ rowIndex: row.rowIndex, name: row.fullName, reason: `找不到渠道"${row.channelName}"，请核对渠道名称` });
      continue;
    }

    // 检查该手机号是否已存在
    const existingEmp = existingEmpByMobile.get(row.mobileNumber);
    if (existingEmp) {
      // 员工已存在，不重复创建，只收集起来用于项目关联
      existingEmployeesForProject.push(existingEmp);
      skippedCount++;
      const reason = projectId
        ? `员工已存在，已自动关联到所选项目`
        : `员工已存在，已跳过`;
      skippedRows.push({
        rowIndex: row.rowIndex,
        name: row.fullName,
        reason,
      });
      continue;
    }

    // 解析技能名列表
    const parsedSkillNames = row.skillNames
      ? row.skillNames.split(/[、，,;；]/).map(s => s.trim()).filter(Boolean)
      : [];

    // 校验技能名是否都能匹配
    const unmatchedSkills = parsedSkillNames.filter(name => !skillNameMap.has(name));

    try {
      // 解析劳务关系名称→ID
      const laborRelationId = row.laborRelationName
        ? (laborRelationNameMap.get(row.laborRelationName) || defaultLaborRelationId)
        : defaultLaborRelationId;

      const savedEmployee = await saveEmployeeRecord({
        employeeNo: row.employeeNo || `EMP-IMP-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        fullName: row.fullName,
        mobileNumber: row.mobileNumber,
        departmentId,
        channelId,
        onboardDate: row.onboardDate || null,
        remark: row.remark || null,
        employeeStatusDictItemId: defaultStatusId,
        laborRelationDictItemId: laborRelationId,
      });

      // 创建技能关联
      if (parsedSkillNames.length > 0 && savedEmployee?.id) {
        const skillInserts = parsedSkillNames
          .map(name => skillNameMap.get(name))
          .filter((id): id is string => !!id)
          .map((skillId, idx) => ({
            employee_id: savedEmployee.id,
            skill_id: skillId,
            skill_level: 1,
            efficiency_coefficient: 1.0,
            is_primary: idx === 0, // 第一个技能设为主技能
            is_enabled: true,
          }));

        if (skillInserts.length > 0) {
          await supabase.from('employee_skill').insert(skillInserts);
        }
      }

      successCount++;

      // 收集成功导入的员工（用于自动开通账号）
      if (savedEmployee?.id && row.mobileNumber) {
        importedEmployees.push({
          id: savedEmployee.id,
          fullName: row.fullName,
          mobileNumber: row.mobileNumber,
        });
      }

      // 如果有未匹配的技能名，记录为警告（不影响成功计数）
      if (unmatchedSkills.length > 0) {
        warningRows.push({
          rowIndex: row.rowIndex,
          name: row.fullName,
          reason: `员工已创建，但以下技能未找到：${unmatchedSkills.join('、')}`,
        });
      }
    } catch (err: any) {
      failedRows.push({ rowIndex: row.rowIndex, name: row.fullName, reason: err?.message || '导入失败' });
    }
  }

  // ── 自动关联到指定项目（包含新导入 + 已存在的员工） ──────────────────────────
  const allEmployeesToAssociate = [...importedEmployees, ...existingEmployeesForProject];
  if (projectId && allEmployeesToAssociate.length > 0) {
    // 去重（同一个员工可能同时在两个数组中）
    const uniqueIds = [...new Set(allEmployeesToAssociate.map(e => e.id))];

    // 先查询已关联的员工ID集合，避免重复插入
    const { data: existingPE } = await supabase
      .from('project_employee')
      .select('employee_id')
      .eq('project_id', projectId)
      .in('employee_id', uniqueIds);
    const existingPEIds = new Set((existingPE || []).map((r: any) => r.employee_id));

    const peInserts = uniqueIds
      .filter(empId => !existingPEIds.has(empId))
      .map(empId => ({
        project_id: projectId,
        employee_id: empId,
        is_active: true,
      }));

    if (peInserts.length > 0) {
      const { error: peError } = await supabase.from('project_employee').insert(peInserts);
      if (peError) {
        console.warn('自动关联项目失败:', peError.message);
      }
    }
  }

  // ── 自动为成功导入的员工开通登录账号（通过 Edge Function 在 Supabase Auth 中创建认证用户） ──
  if (importedEmployees.length > 0) {
    // 过滤掉已有账号的员工
    const newEmployeeIds = importedEmployees
      .filter(emp => !existingAccountMobiles.has(emp.mobileNumber) && !existingAccountEmpIds.has(emp.id))
      .map(emp => emp.id);

    if (newEmployeeIds.length > 0) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        // 动态导入获取配置
        const { supabaseUrl, publicAnonKey } = await import('@/app/lib/supabase/client');
        const authToken = token || publicAnonKey;

        const res = await fetch(`${supabaseUrl}/functions/v1/employee-account-provision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            'apikey': publicAnonKey,
          },
          body: JSON.stringify({
            employee_ids: newEmployeeIds,
            default_password: undefined, // 使用 Edge Function 内的默认密码逻辑
          }),
        });

        const result = await res.json();
        if (result.success && result.data?.results) {
          for (const r of result.data.results) {
            if (r.status === 'success') {
              accountProvisionResult.success++;
            } else if (r.status === 'skipped') {
              accountProvisionResult.success++; // 已存在视为成功
            } else {
              accountProvisionResult.failed++;
              accountProvisionResult.errors.push(`${r.employeeName}(${r.employeeId}): ${r.message}`);
            }
          }
        } else {
          // Edge Function 整体失败
          accountProvisionResult.failed += newEmployeeIds.length;
          accountProvisionResult.errors.push(result.message || '账号开通服务异常');
        }
      } catch (e: any) {
        accountProvisionResult.failed += newEmployeeIds.length;
        accountProvisionResult.errors.push(`调用账号开通服务失败: ${e.message || '未知错误'}`);
      }
    }

    // 已有账号的员工计入成功
    const skippedCount2 = importedEmployees.length - newEmployeeIds.length;
    accountProvisionResult.success += skippedCount2;
  }

  return { successCount, skippedCount, skippedRows, failedRows, warningRows, accountProvisionResult };
}
