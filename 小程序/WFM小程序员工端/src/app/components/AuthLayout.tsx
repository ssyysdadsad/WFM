import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { AuthProvider, useAuth } from '../services/AuthContext';

function AuthGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoggedIn, mustChangePassword, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    const isLoginPage = location.pathname === '/login';
    const isChangePasswordPage = location.pathname === '/change-password';

    if (!isLoggedIn && !isLoginPage) {
      navigate('/login', { replace: true });
      return;
    }

    if (isLoggedIn && mustChangePassword && !isChangePasswordPage) {
      navigate('/change-password?first=true', { replace: true });
      return;
    }
  }, [isLoggedIn, mustChangePassword, loading, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#2895FF] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-[13px] text-[#A3B5C8]">加载中...</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export function AuthLayout() {
  return (
    <AuthProvider>
      <div className="h-full flex flex-col">
        <AuthGuard />
      </div>
    </AuthProvider>
  );
}