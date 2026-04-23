import { supabase } from '@/app/lib/supabase/client';
import { toAppError } from '@/app/lib/supabase/errors';
import type { CurrentUser, MockLoginOption, AppPermission, AppRole } from '@/app/types/auth';

const STORAGE_KEY = 'wfm.mock-session.user-id';
const MOCK_USER_LOAD_TIMEOUT_MS = 3_000;

// ── 内置 fallback（数据库无账号时使用）────────────────────────
const FALLBACK_USERS: MockLoginOption[] = [
  {
    id: 'mock-admin',
    label: '超级管理员',
    description: '可访问全部管理模块',
    user: {
      id: 'mock-admin',
      username: 'admin',
      displayName: '超级管理员',
      accountStatus: 'active',
      roleCodes: ['admin'],
      roles: [{ id: 'mock-role-admin', roleCode: 'admin', roleName: '超级管理员', roleScope: 'global' }],
      permissions: [],
      isAdmin: true,
    },
  },
];

// ── Row 类型 ─────────────────────────────────────────────────
type UserAccountRow = {
  id: string;
  auth_user_id?: string | null;
  username: string | null;
  employee_id: string | null;
  account_status: string;
  is_enabled: boolean;
};
type EmployeeRow   = { id: string; full_name: string };
type RoleRow       = { id: string; role_code: string; role_name: string; role_scope: string; is_enabled: boolean };
type PermissionRow = { id: string; permission_code: string; permission_name: string; platform_code: string; module_code: string; action_code: string; is_enabled: boolean };
type UserRoleRow       = { user_account_id: string; role_id: string };
type RolePermissionRow = { role_id: string; permission_id: string };
type UserPermissionRow = { user_account_id: string; permission_id: string };

type CurrentUserProfileRpc = {
  id: string;
  auth_user_id?: string | null;
  username: string;
  display_name: string;
  employee_id?: string | null;
  employee_name?: string | null;
  account_status: string;
  role_codes?: string[];
  roles?: Array<{ id: string; role_code: string; role_name: string; role_scope: string }>;
  permissions?: Array<{ id: string; permission_code: string; permission_name: string; platform_code: string; module_code: string; action_code: string }>;
  is_admin?: boolean;
};

// ── 辅助函数 ─────────────────────────────────────────────────
function buildPermission(record: PermissionRow): AppPermission {
  return { id: record.id, permissionCode: record.permission_code, permissionName: record.permission_name, platformCode: record.platform_code, moduleCode: record.module_code, actionCode: record.action_code };
}
function buildRole(record: RoleRow): AppRole {
  return { id: record.id, roleCode: record.role_code, roleName: record.role_name, roleScope: record.role_scope };
}
function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}
function withTimeout<T>(promise: Promise<T>, timeoutMs = MOCK_USER_LOAD_TIMEOUT_MS) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      window.setTimeout(() => reject(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs),
    ),
  ]);
}

// ── 构建 CurrentUser（合并角色权限 + 用户直接权限）─────────────
function buildCurrentUser(
  account: UserAccountRow,
  employees: EmployeeRow[],
  roles: RoleRow[],
  permissions: PermissionRow[],
  userRoles: UserRoleRow[],
  rolePermissions: RolePermissionRow[],
  userPermissions: UserPermissionRow[],
): CurrentUser {
  const employee = employees.find((e) => e.id === account.employee_id);
  const accountRoleRows = userRoles.filter((ur) => ur.user_account_id === account.id);
  const accountRoles = roles.filter((r) => accountRoleRows.some((ur) => ur.role_id === r.id)).map(buildRole);
  const roleCodes = accountRoles.map((r) => r.roleCode);
  const isAdmin = roleCodes.includes('admin');

  // admin 不需要详细权限列表（全局放行）
  if (isAdmin) {
    return {
      id: account.id,
      username: account.username ?? account.id,
      displayName: employee?.full_name ?? account.username ?? '未命名账号',
      employeeId: account.employee_id ?? undefined,
      employeeName: employee?.full_name,
      accountStatus: account.account_status,
      roleCodes,
      roles: accountRoles,
      permissions: [],
      isAdmin: true,
    };
  }

  // 角色权限
  const rolePermIds = new Set(
    rolePermissions.filter((rp) => accountRoles.some((r) => r.id === rp.role_id)).map((rp) => rp.permission_id),
  );
  // 用户直接权限（管理员个性化配置）
  const userPermIds = new Set(userPermissions.filter((up) => up.user_account_id === account.id).map((up) => up.permission_id));

  const allPermIds = new Set([...rolePermIds, ...userPermIds]);
  const accountPermissions = permissions.filter((p) => allPermIds.has(p.id)).map(buildPermission);

  return {
    id: account.id,
    username: account.username ?? account.id,
    displayName: employee?.full_name ?? account.username ?? '未命名账号',
    employeeId: account.employee_id ?? undefined,
    employeeName: employee?.full_name,
    accountStatus: account.account_status,
    roleCodes,
    roles: accountRoles,
    permissions: dedupeById(accountPermissions),
    isAdmin: false,
  };
}

// ── Fallback：根据角色码硬编码权限 ──────────────────────────────
function buildFallbackPermissions(user: CurrentUser) {
  const moduleMap: Record<string, string[]> = {
    admin: [
      'dashboard', 'dict', 'scene', 'device', 'skill', 'labor_rule', 'project', 'task',
      'department', 'channel', 'employee', 'schedule_version', 'schedule', 'shift_change', 'report', 'announcement',
    ],
    manager: [
      'dashboard', 'schedule_version', 'schedule', 'shift_change', 'employee', 'announcement',
    ],
    employee: ['dashboard', 'schedule', 'announcement'],
  };
  const modules = new Set(user.roleCodes.flatMap((code) => moduleMap[code] ?? []));
  user.permissions = Array.from(modules).map((moduleCode) => ({
    id: `${user.id}-${moduleCode}`,
    permissionCode: `web.${moduleCode}.read`,
    permissionName: `${moduleCode} 访问权限`,
    platformCode: 'web',
    moduleCode,
    actionCode: 'read',
  }));
}

function cloneFallbackUsers() {
  return FALLBACK_USERS.map((item) => {
    const user = { ...item.user, permissions: [...item.user.permissions], roles: [...item.user.roles] };
    buildFallbackPermissions(user);
    return { ...item, user };
  });
}

// ── 加载所有鉴权基础数据 ─────────────────────────────────────
async function loadAuthReferenceData() {
  const [accountsRes, employeesRes, rolesRes, permissionsRes, userRolesRes, rolePermissionsRes, userPermissionsRes] =
    await withTimeout(
      Promise.all([
        supabase.from('user_account').select('id, auth_user_id, username, employee_id, account_status, is_enabled'),
        supabase.from('employee').select('id, full_name'),
        supabase.from('role').select('id, role_code, role_name, role_scope, is_enabled'),
        supabase.from('permission').select('id, permission_code, permission_name, platform_code, module_code, action_code, is_enabled'),
        supabase.from('user_role').select('user_account_id, role_id'),
        supabase.from('role_permission').select('role_id, permission_id'),
        supabase.from('user_permission').select('user_account_id, permission_id'),
      ]),
    );

  const firstError =
    accountsRes.error ?? employeesRes.error ?? rolesRes.error ?? permissionsRes.error ??
    userRolesRes.error ?? rolePermissionsRes.error ?? userPermissionsRes.error;

  if (firstError) throw firstError;

  return {
    accounts:        (accountsRes.data   ?? []).filter((a) => a.is_enabled && a.account_status !== 'locked'),
    employees:       employeesRes.data   ?? [],
    roles:           (rolesRes.data      ?? []).filter((r) => r.is_enabled),
    permissions:     (permissionsRes.data ?? []).filter((p) => p.is_enabled),
    userRoles:       userRolesRes.data       ?? [],
    rolePermissions: rolePermissionsRes.data ?? [],
    userPermissions: userPermissionsRes.data ?? [],
  };
}

// ── 映射 RPC 返回值 ─────────────────────────────────────────
function mapCurrentUserProfileRpc(row: CurrentUserProfileRpc): CurrentUser {
  const user: CurrentUser = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    employeeId: row.employee_id ?? undefined,
    employeeName: row.employee_name ?? undefined,
    accountStatus: row.account_status,
    roleCodes: row.role_codes ?? [],
    roles: (row.roles ?? []).map((r) => ({ id: r.id, roleCode: r.role_code, roleName: r.role_name, roleScope: r.role_scope })),
    permissions: (row.permissions ?? []).map((p) => ({
      id: p.id, permissionCode: p.permission_code, permissionName: p.permission_name,
      platformCode: p.platform_code, moduleCode: p.module_code, actionCode: p.action_code,
    })),
    isAdmin: Boolean(row.is_admin),
  };
  if (user.permissions.length === 0) buildFallbackPermissions(user);
  return user;
}

// ── 公开 API ─────────────────────────────────────────────────
export async function getMockUsers(): Promise<MockLoginOption[]> {
  try {
    const { accounts, employees, roles, permissions, userRoles, rolePermissions, userPermissions } =
      await loadAuthReferenceData();

    if (accounts.length === 0) return cloneFallbackUsers();

    return accounts.map((account) => {
      const user = buildCurrentUser(account, employees, roles, permissions, userRoles, rolePermissions, userPermissions);
      if (!user.isAdmin && user.permissions.length === 0) buildFallbackPermissions(user);
      return {
        id: user.id,
        label: user.displayName,
        description: `${user.roles.map((r) => r.roleName).join(' / ') || '未分配角色'} · ${user.username}`,
        user,
      };
    });
  } catch (error) {
    console.warn('加载 mock 用户失败，回退到内置账号:', error);
    return cloneFallbackUsers();
  }
}

export function saveMockSessionUserId(userId: string) { localStorage.setItem(STORAGE_KEY, userId); }
export function readMockSessionUserId()               { return localStorage.getItem(STORAGE_KEY); }
export function clearMockSessionUserId()              { localStorage.removeItem(STORAGE_KEY); }

export async function loginWithMockUser(userId: string) {
  const users = await getMockUsers();
  const matched = users.find((item) => item.id === userId);
  if (!matched) throw toAppError(new Error('未找到可用的模拟账号'), '登录失败');
  saveMockSessionUserId(userId);
  return matched.user;
}

export async function getCurrentUserByAuthUserId(authUserId: string) {
  try {
    const rpcRes = await supabase.rpc('get_current_user_profile');
    if (!rpcRes.error && rpcRes.data) {
      const profile = mapCurrentUserProfileRpc(rpcRes.data as CurrentUserProfileRpc);
      if (authUserId && rpcRes.data.auth_user_id && rpcRes.data.auth_user_id !== authUserId) {
        throw new Error('当前会话与用户档案绑定不一致');
      }
      return profile;
    }

    const { accounts, employees, roles, permissions, userRoles, rolePermissions, userPermissions } =
      await loadAuthReferenceData();
    const matchedAccount = accounts.find((a) => a.auth_user_id === authUserId);
    if (!matchedAccount) throw new Error('未找到与当前 Supabase 会话绑定的账号');

    const user = buildCurrentUser(matchedAccount, employees, roles, permissions, userRoles, rolePermissions, userPermissions);
    if (!user.isAdmin && user.permissions.length === 0) buildFallbackPermissions(user);
    return user;
  } catch (error) {
    throw toAppError(error, '加载当前登录用户失败');
  }
}

export async function loginWithSupabasePassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw toAppError(error || new Error('登录失败'), '登录失败');
  return getCurrentUserByAuthUserId(data.user.id);
}

export async function logoutFromSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) throw toAppError(error, '退出登录失败');
}
