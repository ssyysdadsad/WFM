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

      try {
        if (authMode === 'supabase') {
          console.log('[Auth] 走真实的 supabase getSession...');
          setMockUsers([]);
          
          let data, error;
          try {
            const result = await Promise.race([
              supabase.auth.getSession(),
              new Promise<{ data: any; error: any }>((resolve) =>
                setTimeout(() => resolve({ data: { session: null }, error: new Error('getSession Timeout 3000ms') }), 3000)
              )
            ]);
            data = result.data;
            error = result.error;
          } catch (e) {
            error = e;
          }

          if (error) {
            console.error('[Auth] 获取 supabase 会话出现问题或超时:', error);
          }

          console.log('[Auth] 同步会话 user_id:', data?.session?.user?.id ?? null);
          const syncPromise = syncSupabaseSessionUser(data?.session?.user?.id ?? null);
          await Promise.race([
            syncPromise,
            new Promise((resolve) => setTimeout(() => {
              console.error('[Auth] syncSupabaseSessionUser 超时!');
              resolve(null);
            }, 3000))
          ]);
          
          console.log('[Auth] supabase init 完成');
          return;
        }

        const users = await refreshMockUsers();
        const storedUserId = readMockSessionUserId();

        if (active && storedUserId) {
          const matchedUser = users.find((item) => item.id === storedUserId);
          setCurrentUser(matchedUser?.user ?? null);
        }
      } catch (error) {
        console.error('Auth context bootstrap error:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
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
    console.log('[Auth] 表单发起 loginWithPassword 请求，开始 10秒 计时赛...', email);
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('系统鉴权或本地网络通讯响应超过 10 秒，已强制切断死锁。请检查网络状态或按 F12 查看报错日志。')), 10000);
    });

    try {
      const user = await Promise.race([
        loginWithSupabasePassword(email, password),
        timeoutPromise
      ]);
      console.log('[Auth] 登录校验成功，正在绑定用户信息:', user);
      setCurrentUser(user);
    } catch (error) {
      console.error('[Auth] 登录校验过程中发生异常截断:', error);
      throw error;
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
