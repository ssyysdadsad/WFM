export type AuthMode = 'mock' | 'supabase';

export type AppPermission = {
  id: string;
  permissionCode: string;
  permissionName: string;
  platformCode: string;
  moduleCode: string;
  actionCode: string;
};

export type AppRole = {
  id: string;
  roleCode: string;
  roleName: string;
  roleScope: string;
};

export type CurrentUser = {
  id: string;
  username: string;
  displayName: string;
  employeeId?: string;
  employeeName?: string;
  accountStatus: string;
  roleCodes: string[];
  roles: AppRole[];
  permissions: AppPermission[];
  isAdmin: boolean;
};

export type MockLoginOption = {
  id: string;
  label: string;
  description: string;
  user: CurrentUser;
};

export type AuthContextValue = {
  authMode: AuthMode;
  loading: boolean;
  currentUser: CurrentUser | null;
  mockUsers: MockLoginOption[];
  loginAsUser: (userId: string) => Promise<void>;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshMockUsers: () => Promise<MockLoginOption[]>;
};
