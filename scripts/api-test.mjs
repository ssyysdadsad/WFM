/**
 * WFM 系统全接口自动化测试脚本
 * 覆盖：后台管理 + 小程序员工端 + Edge Functions
 * 场景：正常、异常、边界值、空值、超长参数
 *
 * 运行: node scripts/api-test.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gtzbjvqqxsrffsvglula.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0emJqdnFxeHNyZmZzdmdsdWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzOTA2MDYsImV4cCI6MjA5MTk2NjYwNn0.F24I7-E0TnyRIKcaW2U0pu2Wa-N_qprqVStmUCOfLno';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

// ─── Test Framework ───
const results = [];
let currentModule = '';

function setModule(name) { currentModule = name; }

async function test(name, fn) {
  const full = `[${currentModule}] ${name}`;
  const start = Date.now();
  try {
    await fn();
    results.push({ name: full, status: 'PASS', ms: Date.now() - start });
  } catch (e) {
    results.push({ name: full, status: 'FAIL', ms: Date.now() - start, error: String(e.message || e).slice(0, 200) });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertArray(val, msg) { assert(Array.isArray(val), msg || `Expected array, got ${typeof val}`); }
function assertObj(val, msg) { assert(val && typeof val === 'object', msg || `Expected object, got ${typeof val}`); }
function assertHas(obj, key) { assert(obj && key in obj, `Missing key "${key}"`); }

// ─── Helpers ───
let testCreatedIds = {}; // track IDs for cleanup

// ════════════════════════════════════════════════
// MODULE 1: 字典管理 (dict_type / dict_item)
// ════════════════════════════════════════════════
async function testDictModule() {
  setModule('字典管理');

  // 1.1 正常：查询所有字典类型
  await test('查询字典类型列表', async () => {
    const { data, error } = await supabase.from('dict_type').select('*').order('sort_order');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '字典类型应不为空');
    assertHas(data[0], 'type_code');
    assertHas(data[0], 'type_name');
  });

  // 1.2 正常：按type_code查询
  await test('按type_code查询排班编码', async () => {
    const { data, error } = await supabase.from('dict_type').select('id').eq('type_code', 'schedule_code').maybeSingle();
    assert(!error, `查询失败: ${error?.message}`);
    assert(data, '应找到schedule_code类型');
  });

  // 1.3 正常：查询字典项
  await test('查询排班编码字典项', async () => {
    const { data: dt } = await supabase.from('dict_type').select('id').eq('type_code', 'schedule_code').single();
    const { data, error } = await supabase.from('dict_item').select('*').eq('dict_type_id', dt.id).order('sort_order');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '排班编码项应不为空');
    assertHas(data[0], 'item_code');
    assertHas(data[0], 'extra_config');
  });

  // 1.4 异常：查询不存在的type_code
  await test('查询不存在的type_code返回空', async () => {
    const { data } = await supabase.from('dict_type').select('id').eq('type_code', 'nonexistent_xxx').maybeSingle();
    assert(data === null, '不存在的type_code应返回null');
  });

  // 1.5 边界值：创建+删除字典类型
  await test('创建并删除字典类型', async () => {
    const code = `TEST_${Date.now()}`;
    const { data, error } = await supabase.from('dict_type').insert({
      type_code: code, type_name: '测试类型', sort_order: 999, is_enabled: true,
    }).select('id').single();
    assert(!error, `创建失败: ${error?.message}`);
    assert(data?.id, '应返回ID');
    // cleanup
    await supabase.from('dict_type').delete().eq('id', data.id);
  });

  // 1.6 异常：空type_name创建
  await test('空type_code创建应失败(非空约束)', async () => {
    const { error } = await supabase.from('dict_type').insert({ type_code: null, type_name: '测试' });
    assert(error, '空type_code应报错');
  });

  // 1.7 超长参数：type_name超长
  await test('超长type_name(500字符)', async () => {
    const longName = 'A'.repeat(500);
    const { error } = await supabase.from('dict_type').insert({
      type_code: `LONG_${Date.now()}`, type_name: longName, sort_order: 0, is_enabled: true,
    });
    // May succeed or fail depending on VARCHAR limit
    if (!error) {
      // cleanup
      await supabase.from('dict_type').delete().eq('type_name', longName);
    }
    // Record result regardless
    results[results.length - 1].note = error ? `拒绝: ${error.message.slice(0, 80)}` : '接受了500字符';
  });
}

// ════════════════════════════════════════════════
// MODULE 2: 部门管理 (department)
// ════════════════════════════════════════════════
async function testDepartmentModule() {
  setModule('部门管理');

  await test('查询部门列表', async () => {
    const { data, error } = await supabase.from('department').select('*').order('department_name');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '部门应不为空');
  });

  await test('按ID查询单个部门', async () => {
    const { data: list } = await supabase.from('department').select('id').limit(1).single();
    const { data, error } = await supabase.from('department').select('*').eq('id', list.id).single();
    assert(!error && data, '应能查到部门');
    assertHas(data, 'department_name');
  });

  await test('查询不存在的部门ID', async () => {
    const { data } = await supabase.from('department').select('*').eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle();
    assert(data === null, '不存在的ID应返回null');
  });

  await test('创建并删除部门', async () => {
    const { data, error } = await supabase.from('department').insert({
      department_code: `TEST_D_${Date.now()}`, department_name: '自动化测试部门',
    }).select('id').single();
    assert(!error, `创建失败: ${error?.message}`);
    await supabase.from('department').delete().eq('id', data.id);
  });
}

// ════════════════════════════════════════════════
// MODULE 3: 员工管理 (employee)
// ════════════════════════════════════════════════
async function testEmployeeModule() {
  setModule('员工管理');

  await test('查询员工列表(默认排序)', async () => {
    const { data, error } = await supabase.from('employee').select('*')
      .order('department_id').order('full_name').limit(50);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '员工列表应不为空');
  });

  await test('模糊搜索员工姓名', async () => {
    const { data, error } = await supabase.from('employee').select('id, full_name')
      .ilike('full_name', '%张%').limit(10);
    assert(!error, `搜索失败: ${error?.message}`);
    assertArray(data);
  });

  await test('分页查询(第2页)', async () => {
    const { data, error } = await supabase.from('employee').select('*', { count: 'exact' })
      .range(10, 19);
    assert(!error, `分页失败: ${error?.message}`);
    assertArray(data);
  });

  await test('查询不存在的员工', async () => {
    const { data } = await supabase.from('employee').select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle();
    assert(data === null, '应返回null');
  });

  await test('创建员工(缺少必填字段应失败)', async () => {
    const { error } = await supabase.from('employee').insert({ full_name: null });
    assert(error, '空姓名应报错');
  });

  await test('创建并删除测试员工', async () => {
    const no = `T${Date.now()}`;
    const { data, error } = await supabase.from('employee').insert({
      employee_no: no, full_name: '自动测试员工', mobile_number: '19900001111',
    }).select('id').single();
    assert(!error, `创建失败: ${error?.message}`);
    testCreatedIds.testEmployee = data.id;
    // cleanup
    await supabase.from('employee').delete().eq('id', data.id);
  });

  await test('超长手机号(20位)', async () => {
    const { error } = await supabase.from('employee').insert({
      employee_no: `TL${Date.now()}`, full_name: '超长手机测试',
      mobile_number: '1'.repeat(20),
    });
    if (!error) {
      await supabase.from('employee').delete().eq('full_name', '超长手机测试');
    }
    results[results.length - 1].note = error ? `拒绝: ${error.message.slice(0, 80)}` : '接受了20位手机号(潜在Bug)';
  });

  // 员工技能关联
  await test('查询员工技能关联', async () => {
    const { data, error } = await supabase.from('employee_skill').select('*, skill:skill_id(skill_name)').limit(10);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });
}

// ════════════════════════════════════════════════
// MODULE 4: 项目管理 (project)
// ════════════════════════════════════════════════
async function testProjectModule() {
  setModule('项目管理');

  await test('查询项目列表', async () => {
    const { data, error } = await supabase.from('project').select('*').order('project_name');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '项目应不为空');
    assertHas(data[0], 'project_name');
    assertHas(data[0], 'start_date');
  });

  await test('查询项目含关联排班版本数', async () => {
    const { data: projects } = await supabase.from('project').select('id').limit(1).single();
    const { data: versions, error } = await supabase.from('schedule_version')
      .select('id').eq('project_id', projects.id);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(versions);
  });

  await test('创建并删除测试项目', async () => {
    const { data, error } = await supabase.from('project').insert({
      project_code: `TP_${Date.now()}`, project_name: '自动测试项目',
      start_date: '2026-01-01', end_date: '2026-12-31',
    }).select('id').single();
    assert(!error, `创建失败: ${error?.message}`);
    await supabase.from('project').delete().eq('id', data.id);
  });
}

// ════════════════════════════════════════════════
// MODULE 5: 技能管理 (skill)
// ════════════════════════════════════════════════
async function testSkillModule() {
  setModule('技能管理');

  await test('查询技能列表', async () => {
    const { data, error } = await supabase.from('skill').select('*').order('skill_name');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('创建并删除技能', async () => {
    const { data, error } = await supabase.from('skill').insert({
      skill_code: `TS_${Date.now()}`, skill_name: '自动测试技能', is_enabled: true,
    }).select('id').single();
    assert(!error, `创建失败: ${error?.message}`);
    await supabase.from('skill').delete().eq('id', data.id);
  });
}

// ════════════════════════════════════════════════
// MODULE 6: 渠道管理 (channel)
// ════════════════════════════════════════════════
async function testChannelModule() {
  setModule('渠道管理');

  await test('查询渠道列表', async () => {
    const { data, error } = await supabase.from('channel').select('*').order('channel_name');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '渠道应不为空');
  });
}

// ════════════════════════════════════════════════
// MODULE 7: 场景管理 (scene)
// ════════════════════════════════════════════════
async function testSceneModule() {
  setModule('场景管理');

  await test('查询场景列表', async () => {
    const { data, error } = await supabase.from('scene').select('*');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });
}

// ════════════════════════════════════════════════
// MODULE 8: 排班版本 (schedule_version)
// ════════════════════════════════════════════════
async function testScheduleVersionModule() {
  setModule('排班版本');

  await test('查询排班版本列表', async () => {
    const { data, error } = await supabase.from('schedule_version').select('*, project:project_id(project_name)')
      .order('created_at', { ascending: false });
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '排班版本应不为空');
  });

  await test('查询激活版本', async () => {
    const { data, error } = await supabase.from('schedule_version').select('*')
      .eq('is_active', true).limit(5);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('查询不存在的版本', async () => {
    const { data } = await supabase.from('schedule_version').select('*')
      .eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle();
    assert(data === null, '应返回null');
  });
}

// ════════════════════════════════════════════════
// MODULE 9: 排班记录 (schedule)
// ════════════════════════════════════════════════
async function testScheduleModule() {
  setModule('排班记录');

  await test('查询排班记录(限30条)', async () => {
    const { data, error } = await supabase.from('schedule').select('*').limit(30);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '排班记录应不为空');
    assertHas(data[0], 'employee_id');
    assertHas(data[0], 'schedule_date');
    assertHas(data[0], 'planned_hours');
  });

  await test('按日期范围查询排班', async () => {
    const { data, error } = await supabase.from('schedule').select('id, schedule_date, employee_id')
      .gte('schedule_date', '2026-04-01').lte('schedule_date', '2026-04-30').limit(50);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('按员工+日期查询排班', async () => {
    const { data: emp } = await supabase.from('employee').select('id').limit(1).single();
    const { data, error } = await supabase.from('schedule').select('*')
      .eq('employee_id', emp.id).limit(10);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('空日期范围查询', async () => {
    const { data, error } = await supabase.from('schedule').select('id')
      .gte('schedule_date', '2099-01-01').lte('schedule_date', '2099-12-31');
    assert(!error, `查询失败: ${error?.message}`);
    assert(data.length === 0, '未来日期不应有排班');
  });
}

// ════════════════════════════════════════════════
// MODULE 10: 调班申请 (shift_change_request)
// ════════════════════════════════════════════════
async function testShiftChangeModule() {
  setModule('调班申请');

  await test('查询调班申请列表', async () => {
    const { data, error } = await supabase.from('shift_change_request')
      .select('*, applicant:applicant_employee_id(full_name)')
      .order('created_at', { ascending: false }).limit(20);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('按审批状态筛选', async () => {
    const { data: statusItem } = await supabase.from('dict_item')
      .select('id, dict_type!inner(type_code)')
      .eq('dict_type.type_code', 'approval_status')
      .eq('item_code', 'pending').maybeSingle();
    if (statusItem) {
      const { data, error } = await supabase.from('shift_change_request')
        .select('id').eq('approval_status_dict_item_id', statusItem.id);
      assert(!error, `筛选失败: ${error?.message}`);
      assertArray(data);
    }
  });

  await test('创建调班申请(缺少必填字段)', async () => {
    const { error } = await supabase.from('shift_change_request').insert({
      request_type: 'direct_change',
      // Missing applicant_employee_id, etc.
    });
    assert(error, '缺少必填字段应报错');
  });
}

// ════════════════════════════════════════════════
// MODULE 11: 紧急班次 (urgent_shift)
// ════════════════════════════════════════════════
async function testUrgentShiftModule() {
  setModule('紧急班次');

  await test('查询紧急班次列表', async () => {
    const { data, error } = await supabase.from('urgent_shift')
      .select('*, project:project_id(project_name)').order('created_at', { ascending: false });
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('查询紧急班次报名记录', async () => {
    const { data, error } = await supabase.from('urgent_shift_signup')
      .select('*, employee:employee_id(full_name)').limit(20);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('创建紧急班次(需求人数=0应失败)', async () => {
    const { error } = await supabase.from('urgent_shift').insert({
      title: '测试班次', shift_date: '2026-05-01',
      start_time: '09:00', end_time: '18:00',
      required_count: 0, status: 'open',
    });
    // 0人次在业务上无意义，检查是否有约束
    results[results.length - 1].note = error ? '有约束拒绝0人' : '接受了0人需求(建议添加CHECK约束)';
    if (!error) {
      await supabase.from('urgent_shift').delete().eq('title', '测试班次');
    }
  });

  await test('创建紧急班次(需求人数=负数)', async () => {
    const { error } = await supabase.from('urgent_shift').insert({
      title: '负数测试', shift_date: '2026-05-01',
      start_time: '09:00', end_time: '18:00',
      required_count: -5, status: 'open',
    });
    results[results.length - 1].note = error ? '有约束拒绝负数' : '接受了负数人数(Bug!)';
    if (!error) {
      await supabase.from('urgent_shift').delete().eq('title', '负数测试');
    }
  });

  await test('超长标题(1000字符)', async () => {
    const longTitle = '紧'.repeat(1000);
    const { error } = await supabase.from('urgent_shift').insert({
      title: longTitle, shift_date: '2026-05-01',
      start_time: '09:00', end_time: '18:00',
      required_count: 1, status: 'open',
    });
    if (!error) {
      await supabase.from('urgent_shift').delete().eq('title', longTitle);
    }
    results[results.length - 1].note = error ? `拒绝: ${error.message.slice(0, 80)}` : '接受了1000字符标题';
  });
}

// ════════════════════════════════════════════════
// MODULE 12: 用工规则 (labor_rule)
// ════════════════════════════════════════════════
async function testLaborRuleModule() {
  setModule('用工规则');

  await test('查询用工规则列表', async () => {
    const { data, error } = await supabase.from('labor_rule').select('*').order('created_at', { ascending: false });
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    if (data.length > 0) {
      assertHas(data[0], 'rule_name');
      assertHas(data[0], 'max_consecutive_days');
    }
  });

  await test('查询规则关联的项目', async () => {
    const { data: rules } = await supabase.from('labor_rule').select('id, project_id').limit(1);
    if (rules && rules.length > 0 && rules[0].project_id) {
      const { data, error } = await supabase.from('project').select('project_name')
        .eq('id', rules[0].project_id).single();
      assert(!error, '应能查到关联项目');
    }
  });
}

// ════════════════════════════════════════════════
// MODULE 13: 公告管理 (announcement)
// ════════════════════════════════════════════════
async function testAnnouncementModule() {
  setModule('公告管理');

  await test('查询公告列表', async () => {
    const { data, error } = await supabase.from('announcement').select('*')
      .order('published_at', { ascending: false });
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('创建并删除公告', async () => {
    const { data, error } = await supabase.from('announcement').insert({
      title: '自动测试公告', content: '这是一条测试内容',
      published_at: new Date().toISOString(),
    }).select('id').single();
    assert(!error, `创建失败: ${error?.message}`);
    await supabase.from('announcement').delete().eq('id', data.id);
  });

  await test('空标题创建公告', async () => {
    const { error } = await supabase.from('announcement').insert({
      title: null, content: '测试',
    });
    results[results.length - 1].note = error ? '有非空约束' : '接受了空标题(建议添加NOT NULL)';
    if (!error) {
      await supabase.from('announcement').delete().eq('content', '测试');
    }
  });
}

// ════════════════════════════════════════════════
// MODULE 14: 账号权限 (user_account / role)
// ════════════════════════════════════════════════
async function testUserAccountModule() {
  setModule('账号权限');

  await test('查询用户账号列表', async () => {
    const { data, error } = await supabase.from('user_account').select('*').limit(20);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '应有用户账号');
  });

  await test('查询角色列表', async () => {
    const { data, error } = await supabase.from('role').select('*');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
    assert(data.length > 0, '应有角色');
  });

  await test('查询用户角色关联', async () => {
    const { data, error } = await supabase.from('user_role')
      .select('*, user_account:user_account_id(username), role:role_id(role_name)').limit(10);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });

  await test('查询不存在的用户', async () => {
    const { data } = await supabase.from('user_account').select('*')
      .eq('username', 'nonexistent_user_xxxxx').maybeSingle();
    assert(data === null, '应返回null');
  });
}

// ════════════════════════════════════════════════
// MODULE 15: 设备管理 (device)
// ════════════════════════════════════════════════
async function testDeviceModule() {
  setModule('设备管理');

  await test('查询设备列表', async () => {
    const { data, error } = await supabase.from('device').select('*');
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });
}

// ════════════════════════════════════════════════
// MODULE 16: 任务管理 (task)
// ════════════════════════════════════════════════
async function testTaskModule() {
  setModule('任务管理');

  await test('查询任务列表', async () => {
    const { data, error } = await supabase.from('task').select('*, project:project_id(project_name)').limit(20);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });
}

// ════════════════════════════════════════════════
// MODULE 17: 统计报表 (聚合查询)
// ════════════════════════════════════════════════
async function testReportModule() {
  setModule('统计报表');

  await test('统计员工总数', async () => {
    const { count, error } = await supabase.from('employee').select('*', { count: 'exact', head: true });
    assert(!error, `统计失败: ${error?.message}`);
    assert(typeof count === 'number' && count > 0, '员工总数应>0');
  });

  await test('统计项目总数', async () => {
    const { count, error } = await supabase.from('project').select('*', { count: 'exact', head: true });
    assert(!error, `统计失败: ${error?.message}`);
    assert(typeof count === 'number', '应返回数字');
  });

  await test('统计排班记录总数', async () => {
    const { count, error } = await supabase.from('schedule').select('*', { count: 'exact', head: true });
    assert(!error, `统计失败: ${error?.message}`);
    assert(typeof count === 'number', '应返回数字');
  });

  await test('统计部门总数', async () => {
    const { count, error } = await supabase.from('department').select('*', { count: 'exact', head: true });
    assert(!error, `统计失败: ${error?.message}`);
    assert(typeof count === 'number' && count > 0, '部门总数应>0');
  });

  await test('工时聚合查询', async () => {
    const { data, error } = await supabase.from('employee_work_metric').select('*').limit(5);
    assert(!error, `查询失败: ${error?.message}`);
    assertArray(data);
  });
}

// ════════════════════════════════════════════════
// MODULE 18: Edge Functions
// ════════════════════════════════════════════════
async function testEdgeFunctions() {
  setModule('Edge Functions');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ANON_KEY}`,
    'apikey': ANON_KEY,
  };

  // 18.1 employee-account-provision
  await test('员工开通账号-空employee_ids', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/employee-account-provision`, {
      method: 'POST', headers,
      body: JSON.stringify({ employee_ids: [], default_password: '123456789' }),
    });
    const json = await res.json();
    assert(json.success === false || json.message, '空列表应返回错误提示');
  });

  await test('员工开通账号-无效employee_id', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/employee-account-provision`, {
      method: 'POST', headers,
      body: JSON.stringify({ employee_ids: ['00000000-0000-0000-0000-000000000000'], default_password: '123456789' }),
    });
    const json = await res.json();
    assert(json.data?.results?.[0]?.status === 'failed', '无效ID应报失败');
  });

  await test('密码重置-缺少参数', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/employee-account-provision`, {
      method: 'POST', headers,
      body: JSON.stringify({ action: 'reset_password' }),
    });
    const json = await res.json();
    assert(json.success === false, '缺少参数应失败');
  });

  // 18.2 schedule-publish
  await test('排班发布-无效版本ID', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/schedule-publish`, {
      method: 'POST', headers,
      body: JSON.stringify({ schedule_version_id: '00000000-0000-0000-0000-000000000000' }),
    });
    const json = await res.json();
    // Should handle gracefully
    results[results.length - 1].note = `返回: ${JSON.stringify(json).slice(0, 100)}`;
  });

  // 18.3 shift-change-approve
  await test('调班审批-空body', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/shift-change-approve`, {
      method: 'POST', headers,
      body: JSON.stringify({}),
    });
    const json = await res.json();
    results[results.length - 1].note = `返回: ${JSON.stringify(json).slice(0, 100)}`;
  });

  // 18.4 excel-export  
  await test('Excel导出-OPTIONS预检', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/excel-export`, {
      method: 'OPTIONS',
    });
    assert(res.ok || res.status === 204, 'OPTIONS应返回2xx');
  });
}

// ════════════════════════════════════════════════
// MODULE 19: 数据完整性校验
// ════════════════════════════════════════════════
async function testDataIntegrity() {
  setModule('数据完整性');

  await test('员工department_id外键有效', async () => {
    const { data: emps } = await supabase.from('employee').select('id, department_id').not('department_id', 'is', null).limit(50);
    if (emps && emps.length > 0) {
      const deptIds = [...new Set(emps.map(e => e.department_id))];
      const { data: depts } = await supabase.from('department').select('id').in('id', deptIds);
      const foundIds = new Set((depts || []).map(d => d.id));
      const orphans = deptIds.filter(id => !foundIds.has(id));
      assert(orphans.length === 0, `发现${orphans.length}个孤立department_id`);
    }
  });

  await test('排班schedule_code_dict_item_id外键有效', async () => {
    const { data: scheds } = await supabase.from('schedule').select('schedule_code_dict_item_id')
      .not('schedule_code_dict_item_id', 'is', null).limit(100);
    if (scheds && scheds.length > 0) {
      const codeIds = [...new Set(scheds.map(s => s.schedule_code_dict_item_id))];
      const { data: items } = await supabase.from('dict_item').select('id').in('id', codeIds);
      const foundIds = new Set((items || []).map(i => i.id));
      const orphans = codeIds.filter(id => !foundIds.has(id));
      assert(orphans.length === 0, `发现${orphans.length}个孤立排班编码引用`);
    }
  });

  await test('排班版本project_id外键有效', async () => {
    const { data: versions } = await supabase.from('schedule_version').select('project_id')
      .not('project_id', 'is', null);
    if (versions && versions.length > 0) {
      const projIds = [...new Set(versions.map(v => v.project_id))];
      const { data: projects } = await supabase.from('project').select('id').in('id', projIds);
      const foundIds = new Set((projects || []).map(p => p.id));
      const orphans = projIds.filter(id => !foundIds.has(id));
      assert(orphans.length === 0, `发现${orphans.length}个孤立project_id`);
    }
  });

  await test('用户角色关联完整性', async () => {
    const { data: roles } = await supabase.from('user_role').select('user_account_id, role_id').limit(50);
    if (roles && roles.length > 0) {
      const accIds = [...new Set(roles.map(r => r.user_account_id))];
      const { data: accs } = await supabase.from('user_account').select('id').in('id', accIds);
      const foundIds = new Set((accs || []).map(a => a.id));
      const orphans = accIds.filter(id => !foundIds.has(id));
      assert(orphans.length === 0, `发现${orphans.length}个孤立user_account_id`);
    }
  });
}

// ════════════════════════════════════════════════
// MODULE 20: RLS安全测试 (anon用户权限)
// ════════════════════════════════════════════════
async function testRLSSecurity() {
  setModule('RLS安全');

  const tables = ['employee', 'department', 'project', 'schedule', 'dict_type', 'dict_item',
    'skill', 'channel', 'scene', 'device', 'task', 'announcement', 'user_account',
    'role', 'schedule_version', 'shift_change_request', 'urgent_shift', 'labor_rule'];

  for (const table of tables) {
    await test(`${table}表查询权限`, async () => {
      const { error } = await supabase.from(table).select('id').limit(1);
      results[results.length - 1].note = error
        ? `拒绝访问(RLS启用): ${error.message.slice(0, 60)}`
        : '允许anon读取';
    });
  }
}

// ════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════');
  console.log(' WFM 全接口自动化测试');
  console.log(' 开始时间:', new Date().toISOString());
  console.log('═══════════════════════════════════════\n');

  await testDictModule();
  await testDepartmentModule();
  await testEmployeeModule();
  await testProjectModule();
  await testSkillModule();
  await testChannelModule();
  await testSceneModule();
  await testScheduleVersionModule();
  await testScheduleModule();
  await testShiftChangeModule();
  await testUrgentShiftModule();
  await testLaborRuleModule();
  await testAnnouncementModule();
  await testUserAccountModule();
  await testDeviceModule();
  await testTaskModule();
  await testReportModule();
  await testEdgeFunctions();
  await testDataIntegrity();
  await testRLSSecurity();

  // ─── Report ───
  const pass = results.filter(r => r.status === 'PASS');
  const fail = results.filter(r => r.status === 'FAIL');

  console.log('\n═══════════════════════════════════════');
  console.log(' 测试报告');
  console.log('═══════════════════════════════════════');
  console.log(`总计: ${results.length} | ✅ 通过: ${pass.length} | ❌ 失败: ${fail.length}`);
  console.log(`通过率: ${(pass.length / results.length * 100).toFixed(1)}%\n`);

  if (fail.length > 0) {
    console.log('──── ❌ 失败用例 ────');
    fail.forEach((r, i) => {
      console.log(`${i + 1}. ${r.name}`);
      console.log(`   错误: ${r.error}`);
      if (r.note) console.log(`   备注: ${r.note}`);
      console.log();
    });
  }

  // Print notes for pass cases
  const withNotes = results.filter(r => r.note);
  if (withNotes.length > 0) {
    console.log('──── 📝 备注项 (潜在问题) ────');
    withNotes.forEach(r => {
      console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name}`);
      console.log(`   ${r.note}`);
    });
  }

  console.log('\n──── 全部结果 ────');
  results.forEach(r => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    const ms = `${r.ms}ms`.padStart(6);
    console.log(`${icon} ${ms} ${r.name}${r.note ? ` [${r.note}]` : ''}`);
  });

  // Write JSON report
  const reportPath = new URL('../test-results/api-test-report.json', import.meta.url).pathname;
  const fs = await import('fs');
  fs.mkdirSync(new URL('../test-results', import.meta.url).pathname, { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: pass.length,
    failed: fail.length,
    passRate: `${(pass.length / results.length * 100).toFixed(1)}%`,
    results,
  }, null, 2));
  console.log(`\n📄 报告已保存: ${reportPath}`);
}

main().catch(console.error);
