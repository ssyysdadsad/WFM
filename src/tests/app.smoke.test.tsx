import { render, screen } from '@testing-library/react';
import { AuthProvider } from '@/app/hooks/useCurrentUser';
import { LoginPage } from '@/app/components/auth/LoginPage';
import { vi } from 'vitest';

vi.mock('@/app/services/auth.service', () => ({
  getMockUsers: vi.fn(async () => [
    {
      id: 'mock-admin',
      label: '系统管理员',
      description: '管理员 · admin',
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
  ]),
  loginWithMockUser: vi.fn(),
  readMockSessionUserId: vi.fn(() => null),
  saveMockSessionUserId: vi.fn(),
  clearMockSessionUserId: vi.fn(),
}));

describe('App smoke test', () => {
  it('renders login page when no session exists', async () => {
    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>,
    );

    expect(await screen.findByText('WFM 后台登录')).toBeInTheDocument();
    expect(screen.getByText('系统管理员')).toBeInTheDocument();
  });
});
