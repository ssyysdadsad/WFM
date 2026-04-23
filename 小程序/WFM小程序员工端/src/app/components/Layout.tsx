import { Outlet, useNavigate, useLocation } from 'react-router';
import { useEffect } from 'react';
import { TabBar } from './TabBar';
import { useAuth } from '../services/AuthContext';

export function Layout() {
  const { isLoggedIn, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && !isLoggedIn) {
      navigate('/login', { replace: true });
    }
  }, [loading, isLoggedIn, navigate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#F0F5FA]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-3 border-[#4682B4] border-t-transparent rounded-full animate-spin" />
          <span className="text-[12px] text-[#A3B5C8]">加载中...</span>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return null;
  }

  return (
    <div className="flex flex-col h-full">
      <Outlet />
      <TabBar />
    </div>
  );
}