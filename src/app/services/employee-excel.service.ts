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

/** 解析上传的 Excel 文件 */
export function parseEmployeeExcel(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        // 跳过表头行（第一行）
        const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell).trim() !== ''));

        const result: ImportRow[] = dataRows.map((row, idx) => {
          const employeeNo  = String(row[0] || '').trim();
          const fullName    = String(row[1] || '').trim();
          const mobileNo    = String(row[2] || '').trim();
          const deptName    = String(row[3] || '').trim();
          const channelName = String(row[4] || '').trim();
          const laborRelationName = String(row[5] || '').trim();
          const onboardDate = String(row[6] || '').trim();
          const skillNames  = String(row[7] || '').trim();
          const remark      = String(row[8] || '').trim();

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

/** 批量导入员工（返回成功数 / 失败行信息） */
export async function batchImportEmployees(
  rows: ImportRow[],
  departments: ReferenceOption[],
  channels: ReferenceOption[],
): Promise<{ successCount: number; failedRows: { rowIndex: number; name: string; reason: string }[] }> {
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

  let successCount = 0;
  const failedRows: { rowIndex: number; name: string; reason: string }[] = [];

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

      // 如果有未匹配的技能名，仍然算成功，但附加警告
      if (unmatchedSkills.length > 0) {
        failedRows.push({
          rowIndex: row.rowIndex,
          name: row.fullName,
          reason: `员工已创建，但以下技能未找到：${unmatchedSkills.join('、')}`,
        });
      }
    } catch (err: any) {
      failedRows.push({ rowIndex: row.rowIndex, name: row.fullName, reason: err?.message || '导入失败' });
    }
  }

  return { successCount, failedRows };
}
