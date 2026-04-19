import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { AuthContextValue, CurrentUser, MockLoginOption } from '@/app/types/auth';
import { authMode, supabase } from '@/app/lib/supabase/client';
import {
  clearMockSessionUserId,
  getCurrentUserByAuthUserId,
  getMockUsers,
  loginWithSupabasePassword,
  loginWithMockUser,
  logoutFromSupabase,
  readMockSessionUserId,
  saveMockSessionUserId,
} from '@/app/services/auth.service';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [mockUsers, setMockUsers] = useState<MockLoginOption[]>([]);

  const refreshMockUsers = useCallback(async () => {
    if (authMode !== 'mock') {
      setMockUsers([]);
      return [];
    }

    const users = await getMockUsers();
    setMockUsers(users);
    return users;
  }, []);

  useEffect(() => {
    let active = true;

    async function syncSupabaseSessionUser(authUserId: string | null) {
      if (!active) return;

      if (!authUserId) {
        setCurrentUser(null);
        return;
      }

      try {
        const user = await getCurrentUserByAuthUserId(authUserId);
        if (active) {
          setCurrentUser(user);
        }
      } catch (error) {
        console.warn('同步 Supabase 会话用户失败:', error);
        if (active) {
          setCurrentUser(null);
        }
      }
    }

    async function bootstrap() {
      setLoading(true);

      if (authMode === 'supabase') {
        setMockUsers([]);
        const { data } = await supabase.auth.getSession();
        await syncSupabaseSessionUser(data.session?.user?.id ?? null);
        if (active) {
          setLoading(false);
        }
        return;
      }

      const users = await refreshMockUsers();
      const storedUserId = readMockSessionUserId();

      if (active && storedUserId) {
        const matchedUser = users.find((item) => item.id === storedUserId);
        setCurrentUser(matchedUser?.user ?? null);
      }

      if (active) {
        setLoading(false);
      }
    }

    bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (authMode !== 'supabase') {
        return;
      }

      await syncSupabaseSessionUser(session?.user?.id ?? null);
      if (active) {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [refreshMockUsers]);

  const loginAsUser = useCallback(async (userId: string) => {
    if (authMode !== 'mock') {
      throw new Error('当前认证模式不支持模拟登录');
    }

    setLoading(true);
    try {
      const cachedUser = mockUsers.find((item) => item.id === userId)?.user;
      const user = cachedUser ?? await loginWithMockUser(userId);
      if (cachedUser) {
        saveMockSessionUserId(userId);
      }
      setCurrentUser(user);
    } finally {
      setLoading(false);
    }
  }, [mockUsers]);

  const loginWithPassword = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const user = await loginWithSupabasePassword(email, password);
      setCurrentUser(user);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    if (authMode === 'supabase') {
      void logoutFromSupabase().finally(() => setCurrentUser(null));
      return;
    }

    clearMockSessionUserId();
    setCurrentUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      authMode,
      loading,
      currentUser,
      mockUsers,
      loginAsUser,
      loginWithPassword,
      logout,
      refreshMockUsers,
    }),
    [loading, currentUser, mockUsers, loginAsUser, loginWithPassword, logout, refreshMockUsers],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useCurrentUser() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useCurrentUser 必须在 AuthProvider 内使用');
  }

  return context;
}
