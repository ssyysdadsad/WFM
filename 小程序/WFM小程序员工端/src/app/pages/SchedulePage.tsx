import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Download, Loader2, Search } from 'lucide-react';
import { useAuth } from '../services/AuthContext';
import { getSchedule, getShiftTypesConfig, getWorkMetrics } from '../services/api';

export function SchedulePage() {
  const { employee } = useAuth();
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const [schedule, setSchedule] = useState<Record<string, any>>({});
  const [shiftTypes, setShiftTypes] = useState<Record<string, any>>({});
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [filter, setFilter] = useState('全部');
  const [searchText, setSearchText] = useState('');
  const [tooltip, setTooltip] = useState<{ day: number; x: number; y: number } | null>(null);
  const calRef = useRef<HTMLDivElement>(null);

  const yearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const firstDow = new Date(currentYear, currentMonth - 1, 1).getDay();
  const todayDay = new Date().getFullYear() === currentYear && (new Date().getMonth() + 1) === currentMonth ? new Date().getDate() : -1;

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [schedRes, configRes, metricsRes] = await Promise.all([
          getSchedule(yearMonth),
          getShiftTypesConfig(),
          getWorkMetrics(),
        ]);
        if (schedRes.success) setSchedule(schedRes.data.schedule || {});
        if (configRes.success) setShiftTypes(configRes.data || {});
        if (metricsRes.success) setMetrics(metricsRes.data);
      } catch (err) {
        console.error('Schedule load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [yearMonth]);

  const getShiftStyle = (code: string) => shiftTypes[code] || { bg: '#F5F5F5', text: '#9E9E9E', label: code, hours: 0, time: '' };

  const workDays = Object.values(schedule).filter((s: any) => s.category === 'work');
  const totalPlannedHours = Object.values(schedule).reduce((sum: number, s: any) => {
    const st = getShiftStyle(s.code);
    return sum + (st.hours || 0);
  }, 0);
  const completedHours = metrics?.monthCompleted || 0;

  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = Array(firstDow).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) { weeks.push(currentWeek); currentWeek = []; }
  }
  if (currentWeek.length > 0) { while (currentWeek.length < 7) currentWeek.push(null); weeks.push(currentWeek); }

  const prevMonth = () => {
    if (currentMonth === 1) { setCurrentYear(y => y - 1); setCurrentMonth(12); }
    else setCurrentMonth(m => m - 1);
    setSelectedDay(1);
  };
  const nextMonth = () => {
    if (currentMonth === 12) { setCurrentYear(y => y + 1); setCurrentMonth(1); }
    else setCurrentMonth(m => m + 1);
    setSelectedDay(1);
  };

  const selectedDow = new Date(currentYear, currentMonth - 1, selectedDay).getDay();
  const weekStart = selectedDay - selectedDow;
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = weekStart + i; return d >= 1 && d <= daysInMonth ? d : null; });

  const getStartTime = (code: string) => {
    const s = getShiftStyle(code);
    if (s.time) return s.time.split('-')[0]?.trim() || '';
    return '';
  };

  const allCodes = new Set<string>();
  Object.values(schedule).forEach((s: any) => { if (s.code) allCodes.add(s.code); });
  const filterTabs = ['全部', ...Array.from(allCodes)];

  const isDayVisible = (d: number) => {
    const dayData = schedule[String(d)];
    const code = dayData?.code || '休';
    if (filter !== '全部' && code !== filter) return false;
    if (searchText && !String(d).includes(searchText)) return false;
    return true;
  };

  const handleCellHover = (d: number, e: React.MouseEvent) => {
    const rect = calRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({ day: d, x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div className="flex-1 overflow-y-auto flex flex-col" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
      <div className="bg-white px-5 pt-3 pb-3 shrink-0 border-b border-[#DDE9FF]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-semibold text-[#1A2E4A]">排班查看</h2>
          <button className="flex items-center gap-1 text-[12px] text-[#2895FF] bg-[#EBF4FF] px-2.5 py-1 rounded-full border border-[#C8DFFF]/40">
            <Download size={13} /> 导出图片
          </button>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-medium"
            style={{ background: 'linear-gradient(135deg, #2895FF, #62D9FF)' }}>
            {employee?.name?.[0] || '?'}
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-[#1A2E4A]">{employee?.name} · {employee?.no}</p>
            <p className="text-[11px] text-[#A3B5C8]">{employee?.department}</p>
          </div>
        </div>

        {/* Hours cards - blue & teal */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-[#EBF4FF] rounded-xl px-3 py-2 flex items-center gap-2 border border-[#C8DFFF]/50">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#2895FF' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div>
              <p className="text-[10px] text-[#2895FF]">应完成工时</p>
              <p className="text-[16px] font-bold text-[#2895FF] leading-tight">{totalPlannedHours}<span className="text-[11px] font-medium ml-0.5">h</span></p>
            </div>
          </div>
          <div className="bg-[#E4FAF5] rounded-xl px-3 py-2 flex items-center gap-2 border border-[#9EEDE1]/40">
            <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: '#12B8A0' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <div>
              <p className="text-[10px] text-[#12B8A0]">已完成工时</p>
              <p className="text-[16px] font-bold text-[#12B8A0] leading-tight">{completedHours}<span className="text-[11px] font-medium ml-0.5">h</span></p>
            </div>
          </div>
        </div>

        {/* View mode toggle */}
        <div className="flex bg-[#F6F8FA] rounded-lg p-0.5 border border-[#DDE9FF]">
          {(['month', 'week', 'day'] as const).map((m) => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`flex-1 text-[12px] py-1.5 rounded-md transition-all ${viewMode === m ? 'bg-white text-[#2895FF] font-medium shadow-sm' : 'text-[#A3B5C8]'}`}
            >{{ month: '月视图', week: '周视图', day: '日视图' }[m]}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pt-3 pb-4">
        {/* Filter tabs + Search */}
        <div className="flex gap-1.5 overflow-x-auto mb-2 pb-1">
          <button onClick={() => setFilter('全部')}
            className={`px-3 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-all ${
              filter === '全部' ? 'text-white shadow-sm' : 'bg-white text-[#A3B5C8] border border-[#DDE9FF]'
            }`}
            style={filter === '全部' ? { background: 'linear-gradient(90deg, #2895FF, #62D9FF)' } : {}}>全部</button>
          {Object.entries(shiftTypes).map(([code, s]: [string, any]) => (
            <button key={code} onClick={() => setFilter(code)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 transition-all flex items-center gap-1 ${
                filter === code ? 'ring-2 ring-[#62D9FF] ring-offset-1' : ''
              }`}
              style={{
                background: filter === code ? s.bg : 'white',
                color: filter === code ? s.text : '#A3B5C8',
                border: filter === code ? 'none' : '1px solid #DDE9FF',
              }}>
              <span className="w-3.5 h-3.5 rounded-full inline-flex items-center justify-center text-[8px] text-white font-bold shrink-0" style={{ background: s.text }}>{code}</span>
              {code}
            </button>
          ))}
        </div>
        <div className="flex items-center bg-white rounded-lg px-3 h-9 mb-3 border border-[#DDE9FF]">
          <Search size={14} className="text-[#C0CFDD] mr-2" />
          <input className="flex-1 bg-transparent text-[12px] text-[#1A2E4A] outline-none placeholder:text-[#C0CFDD]" placeholder="按日期搜索 (如: 11)..." value={searchText} onChange={e => setSearchText(e.target.value)} />
        </div>

        <div className="flex items-center justify-center gap-4 mb-3">
          <button onClick={prevMonth}><ChevronLeft size={18} className="text-[#A3B5C8]" /></button>
          <span className="text-[14px] font-medium text-[#1A2E4A]">{currentYear}年{currentMonth}月</span>
          <button onClick={nextMonth}><ChevronRight size={18} className="text-[#A3B5C8]" /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[#2895FF]" />
          </div>
        ) : (
          <>
            {viewMode === 'month' && (
              <div className="bg-white rounded-xl p-3 shadow-[0_2px_10px_rgba(40,149,255,0.08)] mb-4 relative border border-[#DDE9FF]" ref={calRef}>
                <div className="grid grid-cols-7 gap-0.5 mb-1">
                  {['日','一','二','三','四','五','六'].map(w => (
                    <div key={w} className="text-center text-[10px] text-[#A3B5C8] py-1">{w}</div>
                  ))}
                </div>
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-0.5">
                    {week.map((d, di) => {
                      if (!d) return <div key={di} className="aspect-square" />;
                      const dayData = schedule[String(d)];
                      const code = dayData?.code || '休';
                      const s = getShiftStyle(code);
                      const isToday = d === todayDay;
                      const isSelected = d === selectedDay;
                      const startTime = getStartTime(code);
                      const visible = isDayVisible(d);
                      return (
                        <button key={di}
                          onClick={() => { setSelectedDay(d); setViewMode('day'); }}
                          onMouseEnter={(e) => handleCellHover(d, e)}
                          onMouseLeave={() => setTooltip(null)}
                          className={`aspect-square rounded-lg flex flex-col items-center justify-center relative transition-all ${isSelected ? 'ring-2 ring-[#62D9FF]' : ''} ${!visible ? 'opacity-20' : ''}`}
                          style={{ background: s.bg }}>
                          <span className={`text-[11px] ${isToday ? 'font-bold text-[#2895FF]' : 'text-[#4A5E75]'}`}>{d}</span>
                          <span className="text-[9px] font-medium" style={{ color: s.text }}>{code}</span>
                          {startTime && <span className="text-[8px] text-[#A3B5C8] leading-tight">{startTime}</span>}
                          {isToday && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-[#2895FF]" />}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {/* Tooltip */}
                {tooltip && (() => {
                  const dayData = schedule[String(tooltip.day)];
                  const code = dayData?.code || '休';
                  const s = getShiftStyle(code);
                  const date = new Date(currentYear, currentMonth - 1, tooltip.day);
                  return (
                    <div className="bg-[#1A2E4A] text-white rounded-xl p-3 shadow-xl min-w-[170px] pointer-events-none"
                      style={{ position: 'absolute', zIndex: 50, left: Math.min(tooltip.x, 200), top: tooltip.y + 20 }}>
                      <p className="text-[13px] font-bold mb-1">{currentMonth}月{tooltip.day}日 · 周{['日','一','二','三','四','五','六'][date.getDay()]}</p>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: s.bg, color: s.text }}>{code}</span>
                        <span className="text-[12px] text-white/70">{s.label || code}</span>
                      </div>
                      {s.time && <p className="text-[11px] text-white/60">⏰ {s.time}</p>}
                      {dayData?.project && <p className="text-[11px] text-white/60">📍 {dayData.project}</p>}
                    </div>
                  );
                })()}
              </div>
            )}

            {viewMode === 'week' && (
              <div className="bg-white rounded-xl p-4 shadow-[0_2px_10px_rgba(40,149,255,0.08)] mb-4 border border-[#DDE9FF]">
                <div className="grid grid-cols-7 gap-2 mb-3">
                  {['日','一','二','三','四','五','六'].map((w, i) => {
                    const d = weekDays[i];
                    const dayData = d ? schedule[String(d)] : null;
                    const code = dayData?.code || (d ? '休' : '');
                    const s = code ? getShiftStyle(code) : null;
                    const startTime = d && code ? getStartTime(code) : '';
                    return (
                      <div key={i} className="flex flex-col items-center">
                        <span className="text-[10px] text-[#A3B5C8] mb-1">周{w}</span>
                        <span className={`text-[12px] mb-1 ${d === todayDay ? 'font-bold text-[#2895FF]' : 'text-[#4A5E75]'}`}>{d || ''}</span>
                        {s && d && (
                          <button onClick={() => { setSelectedDay(d); setViewMode('day'); }}
                            className="w-full rounded-md py-2 flex flex-col items-center" style={{ background: s.bg }}>
                            <span className="text-[12px] font-medium" style={{ color: s.text }}>{code}</span>
                            {startTime && <span className="text-[9px] text-[#A3B5C8] mt-0.5">{startTime}</span>}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-2 mt-3 border-t border-[#F0F5FA] pt-3">
                  {weekDays.filter(Boolean).map(d => {
                    const dayData = schedule[String(d!)];
                    const code = dayData?.code || '休';
                    const s = getShiftStyle(code);
                    return (
                      <div key={d} className="flex items-center gap-3 py-2">
                        <div className="w-8 text-center">
                          <p className="text-[13px] font-semibold text-[#1A2E4A]">{d}</p>
                          <p className="text-[9px] text-[#A3B5C8]">周{['日','一','二','三','四','五','六'][new Date(currentYear,currentMonth-1,d!).getDay()]}</p>
                        </div>
                        <div className="flex-1 rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: s.bg }}>
                          <span className="text-[12px] font-medium" style={{ color: s.text }}>{s.label}</span>
                          <span className="text-[11px]" style={{ color: s.text }}>
                            {s.hours > 0 ? `${s.time} · ${s.hours}h` : '—'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {viewMode === 'day' && (() => {
              const dayData = schedule[String(selectedDay)];
              const code = dayData?.code || '休';
              const s = getShiftStyle(code);
              const isWork = dayData?.category === 'work';
              return (
                <div className="space-y-3">
                  <div className="bg-white rounded-xl p-4 shadow-[0_2px_10px_rgba(40,149,255,0.08)] border border-[#DDE9FF]">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: s.bg }}>
                        <span className="text-[15px] font-bold" style={{ color: s.text }}>{code}</span>
                      </div>
                      <div>
                        <p className="text-[14px] font-medium text-[#1A2E4A]">{s.label}</p>
                        <p className="text-[12px] text-[#A3B5C8]">{currentMonth}月{selectedDay}日 · 周{['日','一','二','三','四','五','六'][new Date(currentYear,currentMonth-1,selectedDay).getDay()]}</p>
                      </div>
                    </div>
                    {isWork && (
                      <div className="space-y-2 pt-3 border-t border-[#F0F5FA]">
                        {[
                          ['时间', s.time],
                          ['计划工时', `${s.hours} 小时`],
                          ['项目', dayData?.project || '—'],
                          ['任务', dayData?.task || '—'],
                          ['设备', dayData?.device || '—'],
                          ['技能要求', dayData?.skillRequired ? `${dayData.skillRequired} · ${dayData.skillLevelRequired}` : '—'],
                        ].map(([label, val]) => (
                          <div key={label} className="flex justify-between text-[12px]">
                            <span className="text-[#A3B5C8]">{label}</span>
                            <span className="text-[#1A2E4A]">{val}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => setViewMode('month')} className="w-full bg-white rounded-xl py-3 text-[13px] text-[#2895FF] shadow-sm text-center border border-[#DDE9FF]">
                    返回月视图
                  </button>
                </div>
              );
            })()}

            {/* Legend */}
            <div className="bg-white rounded-xl p-3 shadow-[0_1px_6px_rgba(40,149,255,0.06)] mt-3 border border-[#DDE9FF]">
              <p className="text-[11px] text-[#A3B5C8] mb-2">班次图例</p>
              <div className="flex flex-wrap gap-3">
                {Object.entries(shiftTypes).map(([code, s]: [string, any]) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] text-white font-bold" style={{ background: s.text }}>{code}</span>
                    <span className="text-[11px] text-[#6B839E]">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}