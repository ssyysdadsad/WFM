import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import { clearSession, getEmployee, getMe } from './api';

interface AuthState {
  isLoggedIn: boolean;
  employee: any | null;
  mustChangePassword: boolean;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  setLoggedIn: (emp: any, mustChange?: boolean) => void;
}

const AuthContext = createContext<AuthState>({
  isLoggedIn: false, employee: null, mustChangePassword: false, loading: true,
  refreshProfile: async () => {}, logout: async () => {}, setLoggedIn: () => {},
});

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [employee, setEmployee] = useState<any>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing Supabase session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const emp = getEmployee();
        if (emp) {
          setEmployee(emp);
          setIsLoggedIn(true);
          setMustChangePassword(emp.mustChangePassword || false);
        }
        // Refresh profile in background
        getMe().then(res => {
          if (res.success && res.data?.employee) {
            setEmployee(res.data.employee);
            setIsLoggedIn(true);
            setMustChangePassword(res.data.employee.mustChangePassword || false);
          } else if (!emp) {
            clearSession();
          }
        }).catch(() => {
          clearSession();
          setIsLoggedIn(false);
          setEmployee(null);
        }).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        clearSession();
        setIsLoggedIn(false);
        setEmployee(null);
        setMustChangePassword(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const res = await getMe();
      if (res.success && res.data?.employee) {
        setEmployee(res.data.employee);
        setMustChangePassword(res.data.employee.mustChangePassword || false);
      }
    } catch (e) { console.error('Refresh profile failed', e); }
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    clearSession();
    setIsLoggedIn(false);
    setEmployee(null);
    setMustChangePassword(false);
  }, []);

  const setLoggedIn = useCallback((emp: any, mustChange?: boolean) => {
    setEmployee(emp);
    setIsLoggedIn(true);
    setMustChangePassword(mustChange || false);
  }, []);

  return (
    <AuthContext.Provider value={{ isLoggedIn, employee, mustChangePassword, loading, refreshProfile, logout, setLoggedIn }}>
      {children}
    </AuthContext.Provider>
  );
}