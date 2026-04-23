/**
 * user-management.service.ts
 * 超级管理员用：账号管理 & 管理员权限配置
 */
import { supabase } from '@/app/lib/supabase/client';
import { getErrorMessage } from '@/app/lib/supabase/errors';

// ── 类型 ────────────────────────────────────────────────────
export type AccountRole = 'admin' | 'manager' | 'employee';

export interface UserAccountItem {
  id: string;
  username: string;
  displayName: string;
  employeeId?: string;
  accountStatus: string;
  isEnabled: boolean;
  roleCodes: AccountRole[];
  roleNames: string[];
  createdAt: string;
}

export interface PermissionItem {
  id: string;
  permissionCode: string;
  permissionName: string;
  moduleCode: string;
  actionCode: string;
  sortOrder: number;
}

export interface CreateAccountPayload {
  username: string;
  password: string;           // plain text, Edge Function / backend should hash
  employeeId?: string;
  roleCode: AccountRole;
}

export interface UpdateAccountPayload {
  username?: string;
  employeeId?: string | null;
  roleCode?: AccountRole;
  isEnabled?: boolean;
}

// ── 内部帮助 ────────────────────────────────────────────────
async function getRoleId(roleCode: AccountRole): Promise<string> {
  const { data, error } = await supabase.from('role').select('id').eq('role_code', roleCode).single();
  if (error || !data) throw new Error(`找不到角色: ${roleCode}`);
  return data.id;
}

// ── 读取账号列表 ─────────────────────────────────────────────
export async function listUserAccounts(): Promise<UserAccountItem[]> {
  const [accountsRes, userRolesRes, rolesRes] = await Promise.all([
    supabase.from('user_account').select('id, username, employee_id, account_status, is_enabled, created_at').order('created_at'),
    supabase.from('user_role').select('user_account_id, role_id'),
    supabase.from('role').select('id, role_code, role_name'),
  ]);

  if (accountsRes.error) throw accountsRes.error;
  if (userRolesRes.error) throw userRolesRes.error;
  if (rolesRes.error) throw rolesRes.error;

  const accounts  = accountsRes.data  ?? [];
  const userRoles = userRolesRes.data ?? [];
  const roles     = rolesRes.data     ?? [];

  // 加载关联员工姓名
  const empIds = accounts.map((a) => a.employee_id).filter(Boolean) as string[];
  let empMap: Record<string, string> = {};
  if (empIds.length > 0) {
    const { data: emps } = await supabase.from('employee').select('id, full_name').in('id', empIds);
    empMap = Object.fromEntries((emps ?? []).map((e) => [e.id, e.full_name]));
  }

  return accounts.map((acct) => {
    const acctRoleIds = userRoles.filter((ur) => ur.user_account_id === acct.id).map((ur) => ur.role_id);
    const acctRoles = roles.filter((r) => acctRoleIds.includes(r.id));
    return {
      id: acct.id,
      username: acct.username ?? acct.id,
      displayName: empMap[acct.employee_id ?? ''] ?? acct.username ?? acct.id,
      employeeId: acct.employee_id ?? undefined,
      accountStatus: acct.account_status,
      isEnabled: acct.is_enabled,
      roleCodes: acctRoles.map((r) => r.role_code as AccountRole),
      roleNames: acctRoles.map((r) => r.role_name),
      createdAt: acct.created_at,
    };
  });
}

// ── 创建账号 ─────────────────────────────────────────────────
export async function createUserAccount(payload: CreateAccountPayload): Promise<string> {
  // 1. 写 user_account（mock 模式无需真实密码哈希，存占位符）
  const { data: acct, error: acctErr } = await supabase
    .from('user_account')
    .insert({
      username:       payload.username,
      password_hash:  payload.password ? `mock::${payload.password}` : 'mock::',
      employee_id:    payload.employeeId ?? null,
      account_status: 'active',
      account_source: 'web',   // CHECK: web | wechat | mixed
      is_enabled:     true,
    })
    .select('id')
    .single();

  if (acctErr || !acct) throw acctErr ?? new Error('创建账号失败');

  // 2. 绑定角色
  const roleId = await getRoleId(payload.roleCode);
  const { error: roleErr } = await supabase.from('user_role').insert({ user_account_id: acct.id, role_id: roleId });
  if (roleErr) throw roleErr;

  return acct.id;
}

// ── 更新账号 ─────────────────────────────────────────────────
export async function updateUserAccount(accountId: string, payload: UpdateAccountPayload): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (payload.username    !== undefined) updates.username    = payload.username;
  if (payload.employeeId  !== undefined) updates.employee_id = payload.employeeId;
  if (payload.isEnabled   !== undefined) updates.is_enabled  = payload.isEnabled;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('user_account').update(updates).eq('id', accountId);
    if (error) throw error;
  }

  // 更新角色
  if (payload.roleCode) {
    const roleId = await getRoleId(payload.roleCode);
    await supabase.from('user_role').delete().eq('user_account_id', accountId);
    const { error } = await supabase.from('user_role').insert({ user_account_id: accountId, role_id: roleId });
    if (error) throw error;
  }
}

// ── 读取所有可配置权限 ────────────────────────────────────────
export async function listAllPermissions(): Promise<PermissionItem[]> {
  const { data, error } = await supabase
    .from('permission')
    .select('id, permission_code, permission_name, module_code, action_code, sort_order')
    .eq('platform_code', 'web')
    .eq('is_enabled', true)
    .order('sort_order');
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    permissionCode: p.permission_code,
    permissionName: p.permission_name,
    moduleCode: p.module_code,
    actionCode: p.action_code,
    sortOrder: p.sort_order,
  }));
}

// ── 读取某用户直接权限 (user_permission) ─────────────────────
export async function getUserDirectPermissions(accountId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('user_permission')
    .select('permission_id')
    .eq('user_account_id', accountId);
  if (error) throw error;
  return (data ?? []).map((r) => r.permission_id);
}

// ── 设置某用户直接权限（全量覆盖） ────────────────────────────
export async function setUserDirectPermissions(
  accountId: string,
  permissionIds: string[],
  grantedByAccountId?: string,
): Promise<void> {
  // 先清空
  const { error: delErr } = await supabase.from('user_permission').delete().eq('user_account_id', accountId);
  if (delErr) throw delErr;

  if (permissionIds.length === 0) return;

  const rows = permissionIds.map((pid) => ({
    user_account_id: accountId,
    permission_id: pid,
    granted_by_user_account_id: grantedByAccountId ?? null,
  }));
  const { error: insErr } = await supabase.from('user_permission').insert(rows);
  if (insErr) throw insErr;
}

// ── 删除账号 ─────────────────────────────────────────────────
export async function deleteUserAccount(accountId: string): Promise<void> {
  // 1. 先删除 user_permission 关联
  const { error: permErr } = await supabase
    .from('user_permission')
    .delete()
    .eq('user_account_id', accountId);
  if (permErr) {
    console.error('删除 user_permission 失败:', permErr);
  }

  // 2. 再删除 user_role 关联
  const { error: roleErr } = await supabase
    .from('user_role')
    .delete()
    .eq('user_account_id', accountId);
  if (roleErr) {
    console.error('删除 user_role 失败:', roleErr);
  }

  // 3. 最后删除 user_account 本身
  const { data, error, count } = await supabase
    .from('user_account')
    .delete()
    .eq('id', accountId)
    .select();

  console.log('删除结果:', { data, error, count, accountId });

  if (error) {
    throw new Error(`删除账号失败: ${error.message} (code: ${error.code})`);
  }
  if (!data || data.length === 0) {
    throw new Error('删除失败: 账号不存在或无权操作');
  }
}

/** 批量删除账号 */
export async function batchDeleteAccounts(
  accountIds: string[],
): Promise<{ success: number; failed: number }> {
  let success = 0;
  let failed = 0;
  for (const id of accountIds) {
    try {
      await deleteUserAccount(id);
      success++;
    } catch {
      failed++;
    }
  }
  return { success, failed };
}

// ── 错误信息帮助 ──────────────────────────────────────────────
export { getErrorMessage };

// ── 批量开通员工账号 ──────────────────────────────────────────

export interface UnprovisionedEmployee {
  id: string;
  employeeNo: string;
  fullName: string;
  mobileNumber: string;
  departmentName: string;
}

/** 获取未开通账号的员工列表 */
export async function getUnprovisionedEmployees(): Promise<UnprovisionedEmployee[]> {
  // Get all employees
  const { data: employees, error: empErr } = await supabase
    .from('employee')
    .select('id, employee_no, full_name, mobile_number, department:department_id(department_name)')
    .order('employee_no');
  if (empErr) throw empErr;

  // Get existing accounts with employee_id
  const { data: accounts, error: accErr } = await supabase
    .from('user_account')
    .select('employee_id')
    .not('employee_id', 'is', null);
  if (accErr) throw accErr;

  const existingEmpIds = new Set((accounts || []).map((a: any) => a.employee_id));

  // Also check by mobile_number matching username
  const { data: usernameAccounts } = await supabase
    .from('user_account')
    .select('username');
  const existingUsernames = new Set((usernameAccounts || []).map((a: any) => a.username));

  return (employees || [])
    .filter((e: any) => !existingEmpIds.has(e.id) && !existingUsernames.has(e.mobile_number))
    .filter((e: any) => e.mobile_number) // 必须有手机号
    .map((e: any) => ({
      id: e.id,
      employeeNo: e.employee_no || '-',
      fullName: e.full_name || '-',
      mobileNumber: e.mobile_number,
      departmentName: e.department?.department_name || '-',
    }));
}

/** 批量为员工开通账号 */
export async function batchProvisionAccounts(
  employeeIds: string[],
): Promise<{ success: number; failed: number; errors: string[] }> {
  if (employeeIds.length === 0) return { success: 0, failed: 0, errors: [] };

  // Load selected employees
  const { data: employees, error: empErr } = await supabase
    .from('employee')
    .select('id, full_name, mobile_number')
    .in('id', employeeIds);
  if (empErr) throw empErr;

  // Get employee role id
  const roleId = await getRoleId('employee');

  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const emp of (employees || [])) {
    const mobile = emp.mobile_number;
    if (!mobile) {
      errors.push(`${emp.full_name}: 缺少手机号`);
      failed++;
      continue;
    }

    const defaultPassword = mobile.slice(-6); // 手机号后6位

    try {
      // Create user_account
      const { data: acct, error: acctErr } = await supabase
        .from('user_account')
        .insert({
          username: mobile,
          password_hash: `mock::${defaultPassword}`,
          employee_id: emp.id,
          account_status: 'active',
          account_source: 'web',
          is_enabled: true,
        })
        .select('id')
        .single();

      if (acctErr) {
        if (acctErr.code === '23505') {
          errors.push(`${emp.full_name}(${mobile}): 用户名已存在`);
        } else {
          errors.push(`${emp.full_name}: ${acctErr.message}`);
        }
        failed++;
        continue;
      }

      // Bind employee role
      await supabase.from('user_role').insert({ user_account_id: acct.id, role_id: roleId });
      success++;
    } catch (e: any) {
      errors.push(`${emp.full_name}: ${e.message || '未知错误'}`);
      failed++;
    }
  }

  return { success, failed, errors };
}
