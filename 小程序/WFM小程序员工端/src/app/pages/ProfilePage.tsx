import { useState, useEffect } from 'react';
import { LogOut, Lock, Loader2, User, Building2, Briefcase, Phone, Calendar, Award, Users, Clock } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useAuth } from '../services/AuthContext';

export function ProfilePage() {
  const navigate = useNavigate();
  const { employee, logout, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try { await refreshProfile(); }
      catch (err) { console.error('Profile load error:', err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (loading) {
    return <div className="flex-1 flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}><Loader2 size={24} className="animate-spin text-[#2895FF]" /></div>;
  }

  const emp: any = employee || {};

  return (
    <div className="flex-1 overflow-y-auto flex flex-col" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
      {/* Header - blue to cyan-mint gradient */}
      <div className="px-5 pt-5 pb-8 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #2895FF 0%, #4BBFFF 55%, #62D9FF 100%)' }}>
        {/* Decorative blobs */}
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/8" />
        <div className="absolute bottom-0 -left-6 w-24 h-24 rounded-full bg-white/6" />
        
        <h2 className="text-[17px] font-bold text-white text-center mb-5 relative z-10">个人信息中心</h2>
        <div className="flex items-center gap-4 relative z-10">
          <div className="w-14 h-14 rounded-full bg-white/25 flex items-center justify-center text-[20px] border-2 border-white/30 backdrop-blur-sm shrink-0">
            😊
          </div>
          <div>
            <h3 className="text-white text-[18px] font-bold">{emp.name || '—'}</h3>
            <p className="text-white/75 text-[12px] mt-0.5">工号: {emp.no} | {emp.department} | {emp.position || '—'}</p>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-3 pb-4 space-y-3">
        {/* 个人信息 card - blue accent */}
        <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(40,149,255,0.08)] border border-[#DDE9FF] overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <div className="w-1 h-4 rounded-full bg-[#2895FF]" />
            <h4 className="text-[14px] font-bold text-[#1A2E4A]">个人信息</h4>
          </div>
          {[
            { icon: Briefcase, label: '工号', value: emp.no },
            { icon: User, label: '姓名', value: emp.name },
            { icon: Building2, label: '部门', value: emp.department },
            { icon: Award, label: '岗位', value: emp.position || '—' },
            { icon: Phone, label: '联系方式', value: emp.phone || '—' },
          ].map((item, i) => (
            <div key={i} className="flex items-center px-4 py-3 border-b border-[#F0F5FA] last:border-b-0">
              <item.icon size={15} className="text-[#62D9FF] mr-3 shrink-0" />
              <span className="text-[12px] text-[#A3B5C8] w-[68px] shrink-0">{item.label}</span>
              <span className="text-[13px] text-[#1A2E4A] font-medium flex-1">{item.value || '—'}</span>
            </div>
          ))}
        </div>

        {/* 详细信息 card - purple accent */}
        <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(123,111,226,0.08)] border border-[#E8E5FF] overflow-hidden">
          <div className="flex items-center gap-2 px-4 pt-4 pb-2">
            <div className="w-1 h-4 rounded-full bg-[#7B6FE2]" />
            <h4 className="text-[14px] font-bold text-[#1A2E4A]">详细信息</h4>
          </div>
          {[
            { icon: Users, label: '班组', value: '—' },
            { icon: Award, label: '技能资质', value: emp.position || '—' },
            { icon: Calendar, label: '入职时间', value: emp.onboardDate || '—' },
            { icon: Clock, label: '工龄', value: emp.onboardDate ? (() => {
              const start = new Date(emp.onboardDate);
              const now = new Date();
              const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
              return months < 12 ? `${months}个月` : `${Math.floor(months / 12)}年${months % 12 > 0 ? `${months % 12}个月` : ''}`;
            })() : '—' },
          ].map((item, i) => (
            <div key={i} className="flex items-center px-4 py-3 border-b border-[#F0F5FA] last:border-b-0">
              <item.icon size={15} className="text-[#A89EF0] mr-3 shrink-0" />
              <span className="text-[12px] text-[#A3B5C8] w-[68px] shrink-0">{item.label}</span>
              <span className="text-[13px] text-[#1A2E4A] font-medium flex-1">{item.value || '—'}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <button onClick={() => navigate('/change-password')}
          className="w-full flex items-center justify-center gap-2 text-white py-3 rounded-xl text-[14px] font-medium shadow-[0_3px_10px_rgba(40,149,255,0.22)]"
          style={{ background: 'linear-gradient(90deg, #2895FF, #62D9FF)' }}>
          <Lock size={16} /> 修改密码
        </button>

        {/* Logout */}
        <button onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-[#FFCFC9] text-[#D96B5A] text-[14px] font-medium bg-white">
          <LogOut size={16} /> 退出登录
        </button>

        
      </div>
    </div>
  );
}