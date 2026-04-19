import { supabase } from '@/app/lib/supabase/client';
import { toAppError } from '@/app/lib/supabase/errors';
import type { CurrentUser, MockLoginOption, AppPermission, AppRole } from '@/app/types/auth';

const STORAGE_KEY = 'wfm.mock-session.user-id';
const MOCK_USER_LOAD_TIMEOUT_MS = 15_000;

const FALLBACK_USERS: MockLoginOption[] = [
  {
    id: 'mock-admin',
    label: '系统管理员',
    description: '可访问全部管理模块',
    user: {
      id: 'mock-admin',
      username: 'admin',
      displayName: '系统管理员',
      accountStatus: 'active',
      roleCodes: ['admin'],
      roles: [
        {
          id: 'mock-role-admin',
          roleCode: 'admin',
          roleName: '管理员',
          roleScope: 'global',
        },
      ],
      permissions: [],
      isAdmin: true,
    },
  },
  {
    id: 'mock-manager',
    label: '部门负责人',
    description: '可访问排班、公告和基础数据',
    user: {
      id: 'mock-manager',
      username: 'manager',
      displayName: '部门负责人',
      accountStatus: 'active',
      roleCodes: ['department_manager'],
      roles: [
        {
          id: 'mock-role-manager',
          roleCode: 'department_manager',
          roleName: '部门负责人',
          roleScope: 'department',
        },
      ],
      permissions: [],
      isAdmin: false,
    },
  },
  {
    id: 'mock-employee',
    label: '普通员工',
    description: '仅查看公告与排班相关页面',
    user: {
      id: 'mock-employee',
      username: 'employee',
      displayName: '普通员工',
      accountStatus: 'active',
      roleCodes: ['employee'],
      roles: [
        {
          id: 'mock-role-employee',
          roleCode: 'employee',
          roleName: '员工',
          roleScope: 'self',
        },
      ],
      permissions: [],
      isAdmin: false,
    },
  },
];

type UserAccountRow = {
  id: string;
  auth_user_id?: string | null;
  username: string | null;
  employee_id: string | null;
  account_status: string;
  is_enabled: boolean;
};

type EmployeeRow = {
  id: string;
  full_name: string;
};

type RoleRow = {
  id: string;
  role_code: string;
  role_name: string;
  role_scope: string;
  is_enabled: boolean;
};

type PermissionRow = {
  id: string;
  permission_code: string;
  permission_name: string;
  platform_code: string;
  module_code: string;
  action_code: string;
  is_enabled: boolean;
};

type UserRoleRow = {
  user_account_id: string;
  role_id: string;
};

type RolePermissionRow = {
  role_id: string;
  permission_id: string;
};

type CurrentUserProfileRpc = {
  id: string;
  auth_user_id?: string | null;
  username: string;
  display_name: string;
  employee_id?: string | null;
  employee_name?: string | null;
  account_status: string;
  role_codes?: string[];
  roles?: Array<{
    id: string;
    role_code: string;
    role_name: string;
    role_scope: string;
  }>;
  permissions?: Array<{
    id: string;
    permission_code: string;
    permission_name: string;
    platform_code: string;
    module_code: string;
    action_code: string;
  }>;
  is_admin?: boolean;
};

function buildPermission(record: PermissionRow): AppPermission {
  return {
    id: record.id,
    permissionCode: record.permission_code,
    permissionName: record.permission_name,
    platformCode: record.platform_code,
    moduleCode: record.module_code,
    actionCode: record.action_code,
  };
}

function buildRole(record: RoleRow): AppRole {
  return {
    id: record.id,
    roleCode: record.role_code,
    roleName: record.role_name,
    roleScope: record.role_scope,
  };
}

function dedupeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function withTimeout<T>(promise: Promise<T>, timeoutMs = MOCK_USER_LOAD_TIMEOUT_MS) {
  return Promise.race<T>([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => reject(new Error(`mock user load timeout after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function buildCurrentUser(
  account: UserAccountRow,
  employees: EmployeeRow[],
  roles: RoleRow[],
  permissions: PermissionRow[],
  userRoles: UserRoleRow[],
  rolePermissions: RolePermissionRow[],
): CurrentUser {
  const employee = employees.find((item) => item.id === account.employee_id);
  const accountRoleRows = userRoles.filter((item) => item.user_account_id === account.id);
  const accountRoles = roles
    .filter((role) => accountRoleRows.some((item) => item.role_id === role.id))
    .map(buildRole);

  const permissionIds = new Set(
    rolePermissions
      .filter((item) => accountRoles.some((role) => role.id === item.role_id))
      .map((item) => item.permission_id),
  );

  const accountPermissions = permissions
    .filter((permission) => permissionIds.has(permission.id))
    .map(buildPermission);

  const displayName = employee?.full_name ?? account.username ?? '未命名账号';
  const username = account.username ?? account.id;
  const roleCodes = accountRoles.map((role) => role.roleCode);

  return {
    id: account.id,
    username,
    displayName,
    employeeId: account.employee_id ?? undefined,
    employeeName: employee?.full_name,
    accountStatus: account.account_status,
    roleCodes,
    roles: accountRoles,
    permissions: dedupeById(accountPermissions),
    isAdmin: roleCodes.includes('admin'),
  };
}

function buildFallbackPermissions(user: CurrentUser) {
  const moduleMap: Record<string, string[]> = {
    admin: [
      'dashboard',
      'dict',
      'scene',
      'device',
      'skill',
      'labor_rule',
      'project',
      'task',
      'department',
      'channel',
      'employee',
      'schedule_version',
      'schedule',
      'shift_change',
      'report',
      'announcement',
    ],
    department_manager: [
      'dashboard',
      'dict',
      'scene',
      'device',
      'skill',
      'labor_rule',
      'project',
      'task',
      'department',
      'channel',
      'employee',
      'schedule_version',
      'schedule',
      'shift_change',
      'report',
      'announcement',
    ],
    employee: ['dashboard', 'schedule', 'shift_change', 'report', 'announcement'],
  };

  const modules = new Set(user.roleCodes.flatMap((code) => moduleMap[code] ?? []));
  user.permissions = Array.from(modules).map((moduleCode) => ({
    id: `${user.id}-${moduleCode}`,
    permissionCode: `${moduleCode}.read`,
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

function mapCurrentUserProfileRpc(row: CurrentUserProfileRpc): CurrentUser {
  const user: CurrentUser = {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    employeeId: row.employee_id ?? undefined,
    employeeName: row.employee_name ?? undefined,
    accountStatus: row.account_status,
    roleCodes: row.role_codes ?? [],
    roles: (row.roles ?? []).map((role) => ({
      id: role.id,
      roleCode: role.role_code,
      roleName: role.role_name,
      roleScope: role.role_scope,
    })),
    permissions: (row.permissions ?? []).map((permission) => ({
      id: permission.id,
      permissionCode: permission.permission_code,
      permissionName: permission.permission_name,
      platformCode: permission.platform_code,
      moduleCode: permission.module_code,
      actionCode: permission.action_code,
    })),
    isAdmin: Boolean(row.is_admin),
  };

  if (user.permissions.length === 0) {
    buildFallbackPermissions(user);
  }

  return user;
}

async function loadAuthReferenceData() {
  const [accountsRes, employeesRes, rolesRes, permissionsRes, userRolesRes, rolePermissionsRes] =
    await withTimeout(
      Promise.all([
        supabase.from('user_account').select('id, auth_user_id, username, employee_id, account_status, is_enabled'),
        supabase.from('employee').select('id, full_name'),
        supabase.from('role').select('id, role_code, role_name, role_scope, is_enabled'),
        supabase
          .from('permission')
          .select('id, permission_code, permission_name, platform_code, module_code, action_code, is_enabled'),
        supabase.from('user_role').select('user_account_id, role_id'),
        supabase.from('role_permission').select('role_id, permission_id'),
      ]),
    );

  const firstError =
    accountsRes.error ??
    employeesRes.error ??
    rolesRes.error ??
    permissionsRes.error ??
    userRolesRes.error ??
    rolePermissionsRes.error;

  if (firstError) {
    throw firstError;
  }

  return {
    accounts: (accountsRes.data ?? []).filter((account) => account.is_enabled && account.account_status !== 'locked'),
    employees: employeesRes.data ?? [],
    roles: (rolesRes.data ?? []).filter((role) => role.is_enabled),
    permissions: (permissionsRes.data ?? []).filter((permission) => permission.is_enabled),
    userRoles: userRolesRes.data ?? [],
    rolePermissions: rolePermissionsRes.data ?? [],
  };
}

export async function getMockUsers() {
  try {
    const { accounts, employees, roles, permissions, userRoles, rolePermissions } = await loadAuthReferenceData();

    if (accounts.length === 0) {
      return cloneFallbackUsers();
    }

    return accounts.map((account) => {
      const user = buildCurrentUser(account, employees, roles, permissions, userRoles, rolePermissions);
      if (user.permissions.length === 0) {
        buildFallbackPermissions(user);
      }

      return {
        id: user.id,
        label: user.displayName,
        description: `${user.roles.map((role) => role.roleName).join(' / ') || '未分配角色'} · ${user.username}`,
        user,
      };
    });
  } catch (error) {
    console.warn('加载 mock 用户失败，回退到内置账号:', error);
    return cloneFallbackUsers();
  }
}

export function saveMockSessionUserId(userId: string) {
  localStorage.setItem(STORAGE_KEY, userId);
}

export function readMockSessionUserId() {
  return localStorage.getItem(STORAGE_KEY);
}

export function clearMockSessionUserId() {
  localStorage.removeItem(STORAGE_KEY);
}

export async function loginWithMockUser(userId: string) {
  const users = await getMockUsers();
  const matchedUser = users.find((item) => item.id === userId);

  if (!matchedUser) {
    throw toAppError(new Error('未找到可用的模拟账号'), '登录失败');
  }

  saveMockSessionUserId(userId);
  return matchedUser.user;
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

    const { accounts, employees, roles, permissions, userRoles, rolePermissions } = await loadAuthReferenceData();
    const matchedAccount = accounts.find((account) => account.auth_user_id === authUserId);

    if (!matchedAccount) {
      throw new Error('未找到与当前 Supabase 会话绑定的账号');
    }

    const user = buildCurrentUser(matchedAccount, employees, roles, permissions, userRoles, rolePermissions);
    if (user.permissions.length === 0) {
      buildFallbackPermissions(user);
    }

    return user;
  } catch (error) {
    throw toAppError(error, '加载当前登录用户失败');
  }
}

export async function loginWithSupabasePassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    throw toAppError(error || new Error('登录失败'), '登录失败');
  }

  return getCurrentUserByAuthUserId(data.user.id);
}

export async function logoutFromSupabase() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw toAppError(error, '退出登录失败');
  }
}
