import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { type Page } from '@playwright/test';

dotenv.config({ path: '.env.local' });

export async function getAuthenticatedSupabaseClient(page: Page) {
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('Missing Supabase URL or Anon Key in .env.local');
  }

  const accessToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return null;
    const sessionStr = localStorage.getItem(key);
    if (!sessionStr) return null;
    const session = JSON.parse(sessionStr);
    return session?.access_token;
  });

  if (!accessToken) {
    throw new Error('Failed to extract access_token from localStorage in Playwright browser context.');
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export async function seedDeepBatchMasterData(supabase: ReturnType<typeof createClient>, batchId: string, employeeCount: number) {
  // 1. 创建部门
  const { data: deptData, error: deptErr } = await supabase.from('department').insert([
    { department_code: `DEPT_A_${batchId}`, department_name: `跑批A部_${batchId}`, is_enabled: true },
    { department_code: `DEPT_B_${batchId}`, department_name: `跑批B部_${batchId}`, is_enabled: true },
  ]).select();
  if (deptErr) throw new Error('Dept seed failed: ' + deptErr.message);

  const dept1Id = deptData[0].id;
  const dept2Id = deptData[1].id;

  // 2. 创建技能
  const { data: skillData, error: skillErr } = await supabase.from('skill').insert([
    { skill_code: `SKILL_1_${batchId}`, skill_name: `技能一_${batchId}`, is_enabled: true },
    { skill_code: `SKILL_2_${batchId}`, skill_name: `技能二_${batchId}`, is_enabled: true },
  ]).select();
  if (skillErr) throw new Error('Skill seed failed: ' + skillErr.message);

  // 2. 拉取一个实际合法的字典项目作为 channel_type_dict_item_id 防止违背非空规则
  const { data: dictItems } = await supabase.from('dict_item').select('id').limit(1);
  const fallbackDictItemId = dictItems?.[0]?.id || null;

  // 3. 创建渠道
  const { data: channelData, error: channelErr } = await supabase.from('channel').insert([
    { channel_code: `CH_1_${batchId}`, channel_name: `渠道一_${batchId}`, is_enabled: true, channel_type_dict_item_id: fallbackDictItemId },
    { channel_code: `CH_2_${batchId}`, channel_name: `渠道二_${batchId}`, is_enabled: true, channel_type_dict_item_id: fallbackDictItemId }
  ]).select();
  if (channelErr) throw new Error('Channel seed failed: ' + channelErr.message);

  const channel1Id = channelData[0].id;

  // 4. 创建员工
  const employeePayloads = [];
  for (let i = 1; i <= employeeCount; i++) {
    const isDept1 = i % 2 !== 0;
    employeePayloads.push({
      employee_no: `EMP_${batchId}_${i.toString().padStart(3, '0')}`,
      full_name: `批跑员工${i}_${batchId}`,
      mobile_number: `138${batchId.substring(0, 4)}${i.toString().padStart(4, '0')}`,
      department_id: isDept1 ? dept1Id : dept2Id,
      channel_id: channel1Id,
      onboard_date: '2025-01-01',
      employee_status_dict_item_id: fallbackDictItemId,
    });
  }

  const { data: empData, error: empErr } = await supabase.from('employee').insert(employeePayloads).select();
  if (empErr) throw new Error('Employee seed failed: ' + empErr.message);

  // 4. 挂载技能 (每个员工挂载1个技能)
  const empSkillPayloads = empData.map((emp, idx) => ({
    employee_id: emp.id,
    skill_id: skillData[idx % 2].id,
    skill_level: 1,
    efficiency_coefficient: 1.0,
    is_primary: true,
    is_enabled: true
  }));
  const { error: empSkillErr } = await supabase.from('employee_skill').insert(empSkillPayloads);
  if (empSkillErr) throw new Error('Employee Skill seed failed: ' + empSkillErr.message);

  return {
    departments: deptData,
    skills: skillData,
    employees: empData,
  };
}
