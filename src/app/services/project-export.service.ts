import * as XLSX from 'xlsx';
import { supabase } from '@/app/lib/supabase/client';

/**
 * 导出指定项目激活排班版本的排班表为 Excel
 * 表头: 员工姓名 | 工号 | 日期1 | 日期2 | ...
 * 每个单元格显示班次名称
 */
export async function exportProjectScheduleToExcel(projectId: string, projectName: string) {
  // 1. 查找激活且已发布的排班版本
  const { data: version, error: vErr } = await supabase
    .from('schedule_version')
    .select('id, version_no, schedule_month')
    .eq('project_id', projectId)
    .eq('is_active', true)
    .not('published_at', 'is', null)
    .limit(1)
    .single();

  if (vErr || !version) throw new Error('该项目暂无已发布的激活排班版本');

  // 2. 获取项目成员
  const { data: peRows } = await supabase
    .from('project_employee')
    .select('employee_id')
    .eq('project_id', projectId)
    .eq('is_active', true);

  const empIds = (peRows || []).map((r: any) => r.employee_id);
  if (empIds.length === 0) throw new Error('该项目暂无成员');

  // 3. 获取员工信息
  const { data: emps } = await supabase
    .from('employee')
    .select('id, full_name, employee_no')
    .in('id', empIds)
    .order('full_name');

  if (!emps || emps.length === 0) throw new Error('未找到员工信息');

  // 4. 获取排班数据
  const { data: schedules } = await supabase
    .from('schedule')
    .select('employee_id, schedule_date, schedule_code_dict_item_id')
    .eq('schedule_version_id', version.id)
    .in('employee_id', empIds)
    .order('schedule_date');

  // 5. 获取班次代码名称映射
  const codeIds = [...new Set((schedules || []).map((s: any) => s.schedule_code_dict_item_id).filter(Boolean))];
  let codeNameMap: Record<string, string> = {};
  if (codeIds.length > 0) {
    const { data: codes } = await supabase
      .from('dict_item')
      .select('id, item_name')
      .in('id', codeIds);
    (codes || []).forEach((c: any) => { codeNameMap[c.id] = c.item_name || '?'; });
  }

  // 6. 从 schedule_month 计算日期范围（月初到月末）
  const monthDate = new Date(version.schedule_month);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0); // 月末
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().split('T')[0]);
  }

  // 7. 构建排班 map: empId -> date -> codeName
  const schedMap: Record<string, Record<string, string>> = {};
  (schedules || []).forEach((s: any) => {
    if (!schedMap[s.employee_id]) schedMap[s.employee_id] = {};
    schedMap[s.employee_id][s.schedule_date] = codeNameMap[s.schedule_code_dict_item_id] || '';
  });

  // 8. 构建 Excel 数据
  const header = ['姓名', '工号', ...dates.map(d => {
    const dt = new Date(d);
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()];
    return `${d.slice(5)}\n周${weekday}`;
  })];

  const rows = emps.map((emp: any) => {
    const empSched = schedMap[emp.id] || {};
    return [
      emp.full_name,
      emp.employee_no || '',
      ...dates.map(d => empSched[d] || ''),
    ];
  });

  const sheetData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // 列宽
  ws['!cols'] = [
    { wch: 10 }, // 姓名
    { wch: 14 }, // 工号
    ...dates.map(() => ({ wch: 8 })),
  ];

  const monthStr = `${year}年${month + 1}月`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '排班表');
  XLSX.writeFile(wb, `${projectName}_排班表_${monthStr}_V${version.version_no}.xlsx`);
}

/**
 * 导出指定项目的员工信息为 Excel
 */
export async function exportProjectEmployeesToExcel(projectId: string, projectName: string) {
  // 获取项目成员
  const { data: peRows } = await supabase
    .from('project_employee')
    .select('employee_id, role, joined_at')
    .eq('project_id', projectId)
    .eq('is_active', true);

  const empIds = (peRows || []).map((r: any) => r.employee_id);
  if (empIds.length === 0) throw new Error('该项目暂无成员');

  const roleMap: Record<string, string> = {};
  const joinMap: Record<string, string> = {};
  (peRows || []).forEach((r: any) => {
    roleMap[r.employee_id] = r.role === 'leader' ? '组长' : '成员';
    joinMap[r.employee_id] = r.joined_at ? r.joined_at.split('T')[0] : '';
  });

  // 获取员工详情
  const { data: emps } = await supabase
    .from('employee')
    .select('id, full_name, employee_no, mobile_number, onboard_date, remark, department:department_id(department_name), channel:channel_id(channel_name)')
    .in('id', empIds)
    .order('full_name');

  if (!emps || emps.length === 0) throw new Error('未找到员工信息');

  // 获取技能
  const { data: esData } = await supabase
    .from('employee_skill')
    .select('employee_id, skill:skill_id(skill_name)')
    .in('employee_id', empIds)
    .eq('is_enabled', true);

  const skillMap: Record<string, string[]> = {};
  (esData || []).forEach((r: any) => {
    if (r.skill?.skill_name) {
      if (!skillMap[r.employee_id]) skillMap[r.employee_id] = [];
      skillMap[r.employee_id].push(r.skill.skill_name);
    }
  });

  const header = ['姓名', '工号', '手机号', '部门', '渠道', '项目角色', '入职日期', '加入项目日期', '技能', '备注'];
  const rows = emps.map((e: any) => [
    e.full_name,
    e.employee_no || '',
    e.mobile_number || '',
    e.department?.department_name || '',
    e.channel?.channel_name || '',
    roleMap[e.id] || '成员',
    e.onboard_date || '',
    joinMap[e.id] || '',
    (skillMap[e.id] || []).join('、'),
    e.remark || '',
  ]);

  const sheetData = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  ws['!cols'] = [
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 20 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '项目员工');
  XLSX.writeFile(wb, `${projectName}_员工信息.xlsx`);
}
