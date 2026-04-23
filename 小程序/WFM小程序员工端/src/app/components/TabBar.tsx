import { Home, CalendarDays, FileText, Bell, User } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router';

const tabs = [
  { path: '/', label: '首页', icon: Home },
  { path: '/schedule', label: '排班', icon: CalendarDays },
  { path: '/apply', label: '申请', icon: FileText },
  { path: '/announcement', label: '公告', icon: Bell },
  { path: '/profile', label: '我的', icon: User },
];

export function TabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="h-[50px] bg-white border-t border-[#E8EFF5] flex items-center shrink-0">
      {tabs.map((tab) => {
        const active = location.pathname === tab.path;
        const Icon = tab.icon;
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 h-full"
          >
            <Icon size={20} className={active ? 'text-[#4682B4]' : 'text-[#C0CFDD]'} strokeWidth={active ? 2.2 : 1.8} />
            <span className={`text-[10px] ${active ? 'text-[#4682B4] font-medium' : 'text-[#C0CFDD]'}`}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}