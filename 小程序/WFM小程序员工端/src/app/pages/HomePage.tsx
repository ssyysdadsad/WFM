import { useNavigate } from 'react-router';
import { Loader2, Clock, MapPin, Building2, CalendarDays, Megaphone, ArrowRightLeft, UserCircle } from 'lucide-react';
import { useAuth } from '../services/AuthContext';
import { useEffect, useState } from 'react';
import { getSchedule, getWorkMetrics, getShiftTypesConfig } from '../services/api';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function HomePage() {
  const navigate = useNavigate();
  const { employee } = useAuth();
  const [schedule, setSchedule] = useState<Record<string, any>>({});
  const [shiftTypes, setShiftTypes] = useState<Record<string, any>>({});
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const todayDay = today.getDate();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDow = new Date(currentYear, currentMonth - 1, 1).getDay();

  useEffect(() => {
    async function load() {
      try {
        const [schedRes, metricsRes, configRes] = await Promise.all([
          getSchedule(yearMonth),
          getWorkMetrics(),
          getShiftTypesConfig(),
        ]);
        if (schedRes.success) setSchedule(schedRes.data.schedule || {});
        if (metricsRes.success) setMetrics(metricsRes.data);
        if (configRes.success) setShiftTypes(configRes.data || {});
      } catch (err) {
        console.error('Home load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [yearMonth]);

  const getShiftStyle = (code: string) => {
    return shiftTypes[code] || { bg: '#F5F5F5', text: '#9E9E9E', label: code, hours: 0, time: '' };
  };

  const todaySchedule = schedule[String(todayDay)];
  const todayCode = todaySchedule?.code || '休';
  const todayStyle = getShiftStyle(todayCode);

  const totalPlannedHours = Object.values(schedule).reduce((sum: number, s: any) => {
    const st = getShiftStyle(s.code);
    return sum + (st.hours || 0);
  }, 0);
  const workDays = Object.values(schedule).filter((s: any) => s.category === 'work').length;

  const futureDays: { day: number; weekday: string; shift: string; schedule: any }[] = [];
  for (let i = 1; i <= 5 && futureDays.length < 5; i++) {
    const d = todayDay + i;
    if (d <= daysInMonth) {
      const date = new Date(currentYear, currentMonth - 1, d);
      const daySchedule = schedule[String(d)];
      futureDays.push({ day: d, weekday: WEEKDAYS[date.getDay()], shift: daySchedule?.code || '休', schedule: daySchedule });
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
        <Loader2 size={24} className="animate-spin text-[#2895FF]" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
      {/* Header - vivid blue-cyan gradient */}
      <div className="px-5 pt-3 pb-5" style={{ background: 'linear-gradient(135deg, #2895FF 0%, #3EAAFF 50%, #62D9FF 100%)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center text-white text-[12px] font-bold backdrop-blur-sm border border-white/15">W</div>
            <span className="text-white font-bold text-[15px]">WFM排班</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/90 text-[13px]">{employee?.name || '用户'}</span>
            <div className="w-8 h-8 bg-white/25 rounded-full flex items-center justify-center border border-white/20">
              <span className="text-white text-[12px] font-bold">{(employee?.name || '用')[0]}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3">
          <div className="text-white">
            <span className="text-[17px] font-bold">{currentYear}年{currentMonth}月{todayDay}日</span>
            <span className="text-[17px] font-bold ml-1">周{WEEKDAYS[today.getDay()]}</span>
          </div>
          <div className="bg-white/18 rounded-lg px-2.5 py-1 text-white text-[12px] font-medium backdrop-blur-sm border border-white/15">
            {todayCode} {todayStyle.time || ''}
          </div>
        </div>

        {/* Mini calendar */}
        <div className="bg-white/14 backdrop-blur-sm rounded-2xl p-3 border border-white/12">
          <div className="grid grid-cols-7 gap-0 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-white/55 text-[10px] py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0">
            {Array.from({ length: firstDow }).map((_, i) => (
              <div key={`e-${i}`} className="h-7" />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = i + 1;
              const isToday = d === todayDay;
              const daySchedule = schedule[String(d)];
              const isWork = daySchedule?.category === 'work';
              return (
                <div key={d} className="flex items-center justify-center h-7">
                  <div className={`w-6 h-6 flex items-center justify-center rounded-full text-[12px] ${
                    isToday ? 'bg-white text-[#2895FF] font-bold shadow' : isWork ? 'text-white/90' : 'text-white/45'
                  }`}>
                    {d}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2.5 pt-2 border-t border-white/12">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white/65 text-[11px]">
                本月工时: {metrics?.monthCompleted || 0}h / {totalPlannedHours}h ({workDays}天)
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/18 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/75 rounded-full transition-all"
                style={{ width: `${totalPlannedHours ? Math.min(100, ((metrics?.monthCompleted || 0) / totalPlannedHours) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        {/* Today shift card */}
        <div className="bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(40,149,255,0.08)] mb-4 border border-[#DDE9FF]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-bold text-[#1A2E4A]">今日班次</h3>
            <span className="text-[#2895FF] text-[12px] font-semibold bg-[#EBF4FF] px-2.5 py-1 rounded-lg">{todayCode} {todayStyle.time || ''}</span>
          </div>
          <div className="space-y-2 text-[13px] text-[#4A5E75]">
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-[#62D9FF] shrink-0" />
              <span className="text-[#A3B5C8] w-10">地点</span>
              <span>{todaySchedule?.project || '未分配'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 size={14} className="text-[#62D9FF] shrink-0" />
              <span className="text-[#A3B5C8] w-10">部门</span>
              <span>{employee?.department || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-[#62D9FF] shrink-0" />
              <span className="text-[#A3B5C8] w-10">进度</span>
              <div className="flex-1 h-1.5 bg-[#EBF4FF] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: '60%', background: 'linear-gradient(90deg, #2895FF, #62D9FF)' }} />
              </div>
            </div>
          </div>
          <button
            onClick={() => navigate('/schedule')}
            className="w-full mt-3.5 py-2 border border-[#C8DFFF] rounded-xl text-[13px] text-[#2895FF] font-medium active:bg-[#EBF4FF]"
          >
            查看详情
          </button>
        </div>

        {/* Future days */}
        {futureDays.length > 0 && (
          <div className="mb-4">
            <h3 className="text-[15px] font-bold text-[#1A2E4A] mb-3">未来排班</h3>
            <div className="grid grid-cols-2 gap-2.5">
              {futureDays.map((d) => {
                const s = getShiftStyle(d.shift);
                const isRest = d.shift === '休' || d.shift === '休息';
                return (
                  <div key={d.day} className="bg-white rounded-xl p-3 shadow-[0_1px_6px_rgba(40,149,255,0.07)] border border-[#DDE9FF]">
                    <div className="flex items-baseline gap-1 mb-1.5">
                      <span className="text-[14px] font-bold text-[#1A2E4A]">{d.day}日</span>
                      <span className="text-[12px] text-[#A3B5C8]">周{d.weekday}</span>
                    </div>
                    <div
                      className="inline-block px-2 py-0.5 rounded text-[11px] font-medium mb-1.5"
                      style={{ background: isRest ? '#E4FAF5' : s.bg, color: isRest ? '#12B8A0' : s.text }}
                    >
                      {isRest ? '休息' : `${d.shift} ${s.time || ''}`}
                    </div>
                    <p className="text-[10px] text-[#A3B5C8]">{d.schedule?.project || '—'}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick actions - 4 distinct theme colors */}
        <div className="grid grid-cols-4 gap-2.5 mb-6">
          {[
            {
              label: '申请中心', icon: ArrowRightLeft, path: '/apply',
              bg: '#EBF4FF', color: '#2895FF',
              shadow: 'rgba(40,149,255,0.14)'
            },
            {
              label: '查看公告', icon: Megaphone, path: '/announcement',
              bg: '#E4FAF5', color: '#12B8A0',
              shadow: 'rgba(18,184,160,0.14)'
            },
            {
              label: '排班视图', icon: CalendarDays, path: '/schedule',
              bg: '#EEEAFF', color: '#7B6FE2',
              shadow: 'rgba(123,111,226,0.14)'
            },
            {
              label: '我的信息', icon: UserCircle, path: '/profile',
              bg: '#FFF2E8', color: '#F08235',
              shadow: 'rgba(240,130,53,0.14)'
            },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              className="rounded-xl py-3.5 flex flex-col items-center gap-1.5 active:opacity-75 transition-opacity"
              style={{
                background: a.bg,
                boxShadow: `0 2px 8px ${a.shadow}`,
                border: `1px solid ${a.bg}`
              }}
            >
              <a.icon size={21} style={{ color: a.color }} />
              <span className="text-[10px] font-semibold" style={{ color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}