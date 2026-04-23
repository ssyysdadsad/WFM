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

// ── 错误信息帮助 ──────────────────────────────────────────────
export { getErrorMessage };
