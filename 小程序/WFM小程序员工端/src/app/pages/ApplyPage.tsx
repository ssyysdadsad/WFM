import { useState, useEffect } from 'react';
import { Clock, CheckCircle2, XCircle, Loader2, ChevronLeft, ChevronRight, ArrowUpDown, CalendarDays, Zap, MapPin, Users, Timer, Tag } from 'lucide-react';
import { getShiftChanges, createShiftChange, getShiftTypesConfig, getSchedule, getEmployeeList, getUrgentShifts, signupUrgentShift, cancelUrgentSignup } from '../services/api';
import { useAuth } from '../services/AuthContext';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function ApplyPage() {
  const { employee } = useAuth();
  const [activeTab, setActiveTab] = useState<'shift_change' | 'urgent_shift'>('shift_change');
  const [requests, setRequests] = useState<any[]>([]);
  const [shiftTypes, setShiftTypes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<Record<string, any>>({});

  const [formType, setFormType] = useState<'direct_change' | 'swap'>('swap');
  const [formOrigDate, setFormOrigDate] = useState('');
  const [formOrigShift, setFormOrigShift] = useState('');
  const [formSwapDate, setFormSwapDate] = useState('');
  const [formSwapShift, setFormSwapShift] = useState('');
  const [formTargetEmployee, setFormTargetEmployee] = useState('');
  const [formReason, setFormReason] = useState('');
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  const [showOrigCal, setShowOrigCal] = useState(false);
  const [showSwapCal, setShowSwapCal] = useState(false);
  const [calYear, setCalYear] = useState(2026);
  const [calMonth, setCalMonth] = useState(4);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [reqRes, configRes, empRes, schedRes] = await Promise.all([
        getShiftChanges('all'),
        getShiftTypesConfig(),
        getEmployeeList(),
        getSchedule(currentMonth),
      ]);
      if (reqRes.success) setRequests(reqRes.data || []);
      if (configRes.success) setShiftTypes(configRes.data || {});
      if (empRes.success) setEmployees(empRes.data || []);
      if (schedRes.success) setSchedule(schedRes.data.schedule || {});
    } catch (err) {
      console.error('Apply load error:', err);
    } finally {
      setLoading(false);
    }
  }

  const getShiftStyle = (code: string) => shiftTypes[code] || { bg: '#F5F5F5', text: '#9E9E9E', label: code, hours: 0, time: '' };

  const getMyShift = (dateStr: string) => {
    const day = dateStr.split('-').pop();
    if (!day) return null;
    return schedule[String(parseInt(day))];
  };

  const myOrigShift = formOrigDate ? getMyShift(formOrigDate) : null;
  useEffect(() => {
    if (myOrigShift?.code) setFormOrigShift(myOrigShift.code);
  }, [formOrigDate]);

  const selectedEmployee = employees.find(e => e.id === formTargetEmployee);

  const getSwapTargetShift = () => {
    if (!formSwapDate || !formTargetEmployee) return null;
    const day = formSwapDate.split('-').pop();
    if (!day) return null;
    return schedule[String(parseInt(day))];
  };
  const swapTargetShift = getSwapTargetShift();
  useEffect(() => {
    if (swapTargetShift?.code) setFormSwapShift(swapTargetShift.code);
  }, [formSwapDate]);

  async function handleSubmit() {
    if (!formOrigDate) { setFormError('请选择原排班日期'); return; }
    if (formType === 'swap' && !formTargetEmployee) { setFormError('请选择互换对象'); return; }
    if (formType === 'swap' && !formSwapDate) { setFormError('请选择换回排班日期'); return; }
    if (!formReason.trim()) { setFormError('请填写调班事由'); return; }
    setSubmitting(true);
    setFormError('');
    setFormSuccess('');
    try {
      const res = await createShiftChange({
        type: formType,
        originalDate: formOrigDate,
        originalShift: formOrigShift || myOrigShift?.code || '未知',
        targetDate: formType === 'swap' ? formSwapDate : formOrigDate,
        targetShift: formType === 'swap' ? (formSwapShift || swapTargetShift?.code || '未知') : undefined,
        targetEmployeeId: formType === 'swap' ? formTargetEmployee : undefined,
        reason: formReason,
      });
      if (res.success) {
        setFormSuccess('调班申请已提交！');
        setFormOrigDate(''); setFormOrigShift(''); setFormSwapDate(''); setFormSwapShift(''); setFormTargetEmployee(''); setFormReason('');
        await loadData();
      } else {
        setFormError(res.message || '提交失败');
      }
    } catch (err: any) {
      setFormError(err.message || '提交异常');
    } finally {
      setSubmitting(false);
    }
  }

  const statusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock size={14} className="text-[#5DADE2]" />;
      case 'approved': return <CheckCircle2 size={14} className="text-[#4682B4]" />;
      case 'rejected': return <XCircle size={14} className="text-[#C47A6B]" />;
    }
  };
  const statusBg = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-[#E0FFFF] text-[#5DADE2]';
      case 'approved': return 'bg-[#E8F1F8] text-[#4682B4]';
      case 'rejected': return 'bg-[#FFF0F0] text-[#C47A6B]';
      default: return '';
    }
  };

  function MiniCalendar({ onSelect, selected, onClose }: { onSelect: (date: string) => void; selected: string; onClose: () => void }) {
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const firstDow = new Date(calYear, calMonth - 1, 1).getDay();
    const weeks: (number | null)[][] = [];
    let week: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      week.push(d);
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length > 0) { while (week.length < 7) week.push(null); weeks.push(week); }

    const selectedDay = selected ? parseInt(selected.split('-').pop() || '0') : -1;
    const selectedMonth = selected ? parseInt(selected.split('-')[1] || '0') : -1;

    return (
      <div className="bg-white border border-[#E0EAF2] rounded-xl p-3 shadow-lg mt-1 mb-2">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => { if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); } else setCalMonth(m => m - 1); }}>
            <ChevronLeft size={16} className="text-[#A3B5C8]" />
          </button>
          <span className="text-[13px] font-medium text-[#2C3E5A]">{calYear}年{calMonth}月</span>
          <button onClick={() => { if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); } else setCalMonth(m => m + 1); }}>
            <ChevronRight size={16} className="text-[#A3B5C8]" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAYS.map(w => <div key={w} className="text-center text-[10px] text-[#A3B5C8] py-0.5">{w}</div>)}
        </div>
        {weeks.map((wk, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0.5">
            {wk.map((d, di) => {
              if (!d) return <div key={di} className="h-8" />;
              const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const isSelected = d === selectedDay && calMonth === selectedMonth;
              const daySchedule = calMonth === 4 ? schedule[String(d)] : null;
              const shiftCode = daySchedule?.code;
              const s = shiftCode ? getShiftStyle(shiftCode) : null;
              return (
                <button key={di} onClick={() => { onSelect(dateStr); onClose(); }}
                  className={`h-8 rounded-lg flex flex-col items-center justify-center text-[12px] transition-all ${
                    isSelected ? 'bg-gradient-to-r from-[#4682B4] to-[#5DADE2] text-white' : 'hover:bg-[#F0F5FA] text-[#4A5E75]'
                  }`}>
                  <span className="leading-tight">{d}</span>
                  {s && !isSelected && (
                    <span className="text-[8px] font-medium leading-tight" style={{ color: s.text }}>{shiftCode}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // === Urgent shift state ===
  const [urgentShifts, setUrgentShifts] = useState<any[]>([]);
  const [urgentLoading, setUrgentLoading] = useState(false);
  const [urgentFilter, setUrgentFilter] = useState('全部');
  const [signingUp, setSigningUp] = useState<string | null>(null);

  async function loadUrgentShifts() {
    setUrgentLoading(true);
    try {
      const res = await getUrgentShifts();
      if (res.success) setUrgentShifts(res.data || []);
    } catch (err) { console.error(err); }
    finally { setUrgentLoading(false); }
  }

  useEffect(() => { if (activeTab === 'urgent_shift') loadUrgentShifts(); }, [activeTab]);

  const WEEKDAYS_FULL = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const filteredUrgentShifts = urgentShifts.filter(s => {
    if (urgentFilter === '全部') return true;
    if (urgentFilter === '可报名') return s.status === 'open' && !s.mySignupStatus && new Date(s.signupDeadline) > new Date();
    if (urgentFilter === '已报名') return s.mySignupStatus && s.mySignupStatus !== 'cancelled';
    if (urgentFilter === '已结束') return s.status !== 'open';
    return true;
  });

  async function handleSignup(shiftId: string) {
    setSigningUp(shiftId);
    try {
      const res = await signupUrgentShift(shiftId);
      if (res.success) { await loadUrgentShifts(); }
      else { alert(res.message); }
    } catch (err: any) { alert(err.message || '报名失败'); }
    finally { setSigningUp(null); }
  }

  async function handleCancelSignup(shiftId: string) {
    try {
      const res = await cancelUrgentSignup(shiftId);
      if (res.success) { await loadUrgentShifts(); }
      else { alert(res.message); }
    } catch (err: any) { alert(err.message || '取消失败'); }
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
      {/* Header */}
      <div className="bg-white px-5 pt-3 pb-3 shrink-0 border-b border-[#DDE9FF]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#FFF2E8' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F08235" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 7h12M8 12h12M8 17h12M3 7h.01M3 12h.01M3 17h.01"/></svg>
          </div>
          <h2 className="text-[16px] font-semibold text-[#1A2E4A]">申请中心</h2>
        </div>
        {/* Employee info */}
        <p className="text-[12px] text-[#A3B5C8] mt-1">当前申请人：{employee?.name} / {employee?.department}</p>
        {/* Top Tab */}
        <div className="flex gap-2 mt-3">
          <button onClick={() => setActiveTab('shift_change')}
            className={`flex-1 py-2 rounded-xl text-[13px] font-medium border transition-all ${
              activeTab === 'shift_change'
                ? 'bg-white text-[#1A2E4A] border-[#2895FF] shadow-sm'
                : 'bg-transparent text-[#A3B5C8] border-[#DDE9FF]'
            }`}>
            📋 调班申请
          </button>
          <button onClick={() => setActiveTab('urgent_shift')}
            className={`flex-1 py-2 rounded-xl text-[13px] font-medium border transition-all ${
              activeTab === 'urgent_shift'
                ? 'text-white border-transparent shadow-sm'
                : 'bg-transparent text-[#A3B5C8] border-[#DDE9FF]'
            }`}
            style={activeTab === 'urgent_shift' ? { background: 'linear-gradient(90deg, #fa8c16, #ffa940)' } : {}}>
            ⚡ 临时班次申请
          </button>
        </div>
      </div>

      {/* ===== Shift Change Tab ===== */}
      {activeTab === 'shift_change' && (
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        {/* Employee info card */}
        <div className="bg-white rounded-xl px-4 py-3 mb-4 border border-[#DDE9FF] shadow-[0_1px_6px_rgba(40,149,255,0.07)]">
          <p className="text-[13px] text-[#4A5E75]">当前申请人：<span className="font-medium text-[#1A2E4A]">{employee?.name}</span> / {employee?.department} / {employee?.position}</p>
          <p className="text-[11px] text-[#A3B5C8] mt-0.5">审批人配置：排班主管，结果会同步员工端</p>
        </div>

        {/* Type toggle */}
        <div className="flex gap-2 mb-4">
          <button onClick={() => setFormType('direct_change')}
            className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition-all ${formType === 'direct_change' ? 'text-white shadow-sm' : 'bg-white text-[#A3B5C8] border border-[#DDE9FF]'}`}
            style={formType === 'direct_change' ? { background: 'linear-gradient(90deg, #2895FF, #62D9FF)' } : {}}>
            直接变更
          </button>
          <button onClick={() => setFormType('swap')}
            className={`flex-1 py-2 rounded-lg text-[13px] font-medium transition-all ${formType === 'swap' ? 'text-white shadow-sm' : 'bg-white text-[#A3B5C8] border border-[#DDE9FF]'}`}
            style={formType === 'swap' ? { background: 'linear-gradient(90deg, #2895FF, #62D9FF)' } : {}}>
            互换调班
          </button>
        </div>

        {formError && <div className="bg-[#FFF0EE] text-[#D96B5A] text-[12px] px-3 py-2 rounded-lg mb-3">{formError}</div>}
        {formSuccess && <div className="bg-[#E4FAF5] text-[#12B8A0] text-[12px] px-3 py-2 rounded-lg mb-3">{formSuccess}</div>}

        {/* Original date + My shift */}
        <div className="mb-4">
          <div className="flex gap-2 mb-1.5">
            <p className="flex-1 text-[13px] text-[#6B839E]">原排班日期</p>
            <p className="w-[120px] text-[13px] text-[#6B839E]">我的班次</p>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <button onClick={() => { setShowOrigCal(!showOrigCal); setShowSwapCal(false); }}
                className="w-full bg-white border border-[#DDE9FF] rounded-xl px-3 py-2.5 flex items-center justify-between text-[13px]">
                <span className={formOrigDate ? 'text-[#1A2E4A]' : 'text-[#C0CFDD]'}>
                  {formOrigDate || '选择日期'}
                </span>
                <CalendarDays size={16} className="text-[#62D9FF]" />
              </button>
            </div>
            <select value={formOrigShift} onChange={e => setFormOrigShift(e.target.value)}
              className="w-[120px] bg-white border border-[#DDE9FF] rounded-xl px-2 py-2.5 text-[13px] text-[#1A2E4A] outline-none appearance-none text-center">
              <option value="">选择班次</option>
              {Object.keys(shiftTypes).map(code => (
                <option key={code} value={code}>{code} - {shiftTypes[code].label}</option>
              ))}
            </select>
          </div>
          {showOrigCal && (
            <MiniCalendar selected={formOrigDate} onSelect={(d) => { setFormOrigDate(d); setFormOrigShift(''); }} onClose={() => setShowOrigCal(false)} />
          )}
        </div>

        {/* Swap-specific fields */}
        {formType === 'swap' && (
          <>
            <div className="mb-3">
              <p className="text-[13px] text-[#6B839E] mb-1.5">选择调班对象（该日期休息的员工）</p>
              <select value={formTargetEmployee} onChange={e => setFormTargetEmployee(e.target.value)}
                className="w-full bg-white border border-[#DDE9FF] rounded-xl px-3 py-2.5 text-[13px] text-[#1A2E4A] outline-none appearance-none">
                <option value="">请选择被调班者</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}（{emp.department}）</option>
                ))}
              </select>
            </div>

            <div className="flex justify-center my-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#EBF4FF' }}>
                <ArrowUpDown size={16} className="text-[#2895FF]" />
              </div>
            </div>

            <div className="mb-4">
              <div className="flex gap-2 mb-1.5">
                <p className="flex-1 text-[13px] text-[#6B839E]">换回排班日期</p>
                <p className="w-[120px] text-[13px] text-[#6B839E]">目标班次</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <button onClick={() => { setShowSwapCal(!showSwapCal); setShowOrigCal(false); }}
                    className={`w-full bg-white border border-[#DDE9FF] rounded-xl px-3 py-2.5 flex items-center justify-between text-[13px] ${
                      !formTargetEmployee ? 'opacity-50' : ''
                    }`}
                    disabled={!formTargetEmployee}>
                    <span className={formSwapDate ? 'text-[#1A2E4A]' : 'text-[#C0CFDD]'}>
                      {formSwapDate || '请先选择调班对象'}
                    </span>
                    <CalendarDays size={16} className="text-[#62D9FF]" />
                  </button>
                </div>
                <select value={formSwapShift} onChange={e => setFormSwapShift(e.target.value)}
                  className="w-[120px] bg-white border border-[#DDE9FF] rounded-xl px-2 py-2.5 text-[13px] text-[#1A2E4A] outline-none appearance-none text-center"
                  disabled={!formTargetEmployee}>
                  <option value="">选择班次</option>
                  {Object.keys(shiftTypes).map(code => (
                    <option key={code} value={code}>{code} - {shiftTypes[code].label}</option>
                  ))}
                </select>
              </div>
              {showSwapCal && formTargetEmployee && (
                <MiniCalendar selected={formSwapDate} onSelect={(d) => { setFormSwapDate(d); setFormSwapShift(''); }} onClose={() => setShowSwapCal(false)} />
              )}
            </div>

            {/* Swap preview */}
            {formOrigDate && formSwapDate && formTargetEmployee && (
              <div className="bg-[#EBF4FF] border border-[#2895FF]/15 rounded-xl px-4 py-3 mb-4">
                <p className="text-[13px] font-semibold text-[#2895FF] mb-2">换班预览</p>
                <div className="space-y-1.5 text-[12px] text-[#4A5E75]">
                  <p>→ 你在 <span className="font-medium">{formOrigDate}</span> 的 <span className="font-medium">{formOrigShift || myOrigShift?.code || '—'}</span> → 给 <span className="font-medium">{selectedEmployee?.name || '—'}</span></p>
                  <p className="text-[#2895FF]">← 你在 <span className="font-medium">{formSwapDate}</span> 换回班次 <span className="font-medium">{formSwapShift || swapTargetShift?.code || '—'}</span></p>
                  <p className="text-[11px] text-[#A3B5C8] mt-1">{selectedEmployee?.name || '—'} 在 {formOrigDate} 接替你的 {formOrigShift || myOrigShift?.code || '—'} 班 / 你在 {formSwapDate} 上 {formSwapShift || swapTargetShift?.code || '—'} 班</p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Reason */}
        <div className="mb-4">
          <p className="text-[13px] text-[#6B839E] mb-1.5">调班事由</p>
          <textarea value={formReason} onChange={e => setFormReason(e.target.value)}
            className="w-full bg-white border border-[#DDE9FF] rounded-xl px-3 py-2.5 text-[13px] text-[#1A2E4A] outline-none resize-none h-20 placeholder:text-[#C0CFDD]"
            placeholder="请输入调班原因..." />
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-3 text-white rounded-xl text-[15px] font-medium disabled:opacity-60 flex items-center justify-center gap-2 mb-6"
          style={{ background: 'linear-gradient(90deg, #2895FF, #62D9FF)', boxShadow: '0 4px_14px rgba(40,149,255,0.28)' }}>
          {submitting && <Loader2 size={16} className="animate-spin" />}
          {submitting ? '提交中...' : '提交申请'}
        </button>

        {/* Records */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-4 bg-[#2895FF] rounded-full" />
          <h3 className="text-[15px] font-bold text-[#1A2E4A]">调班记录</h3>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="animate-spin text-[#2895FF]" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#C0CFDD]">
            <Clock size={36} className="mb-2" />
            <p className="text-[13px]">暂无调班申请记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map(req => {
              const origShift = getShiftStyle(req.originalShift);
              const targetShift = getShiftStyle(req.targetShift);
              return (
                <div key={req.id} className="bg-white rounded-xl p-4 shadow-[0_1px_6px_rgba(40,149,255,0.07)] border border-[#DDE9FF]">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {statusIcon(req.status)}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${statusBg(req.status)}`}>{req.statusLabel}</span>
                      <span className="text-[11px] text-[#C0CFDD]">{req.type === 'swap' ? '互换调班' : '直接变更'}</span>
                    </div>
                    <span className="text-[10px] text-[#C0CFDD]">{req.createdAt?.slice(0, 10)}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 rounded-lg px-3 py-2 text-center" style={{ background: origShift.bg }}>
                      <p className="text-[10px] text-[#A3B5C8]">{req.originalDate}</p>
                      <p className="text-[13px] font-medium" style={{ color: origShift.text }}>{req.originalShift}</p>
                    </div>
                    <div className="text-[#C0CFDD] text-[16px]">→</div>
                    <div className="flex-1 rounded-lg px-3 py-2 text-center" style={{ background: targetShift.bg }}>
                      <p className="text-[10px] text-[#A3B5C8]">{req.targetDate}</p>
                      <p className="text-[13px] font-medium" style={{ color: targetShift.text }}>{req.targetShift}</p>
                    </div>
                  </div>
                  {req.targetEmployeeName && <p className="text-[11px] text-[#A3B5C8] mb-1">互换对象：{req.targetEmployeeName}</p>}
                  <p className="text-[11px] text-[#A3B5C8]">原因：{req.reason}</p>
                  {req.approverComment && <p className="text-[11px] text-[#A3B5C8] mt-1">审批意见：{req.approverComment}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* ===== Urgent Shift Tab ===== */}
      {activeTab === 'urgent_shift' && (
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {['全部', '可报名', '已报名', '已结束'].map(tab => (
            <button key={tab} onClick={() => setUrgentFilter(tab)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                urgentFilter === tab
                  ? 'bg-[#2895FF] text-white shadow-sm'
                  : 'bg-white text-[#6B839E] border border-[#DDE9FF]'
              }`}>
              {tab}
            </button>
          ))}
        </div>

        {urgentLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={24} className="animate-spin text-[#fa8c16]" />
          </div>
        ) : filteredUrgentShifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#C0CFDD]">
            <Zap size={36} className="mb-2" />
            <p className="text-[13px]">暂无临时班次</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredUrgentShifts.map(shift => {
              const isExpired = new Date(shift.signupDeadline) < new Date();
              const isFull = shift.approvedCount >= shift.requiredCount;
              const canSignup = shift.status === 'open' && !shift.mySignupStatus && !isExpired && !isFull;
              const dayOfWeek = WEEKDAYS_FULL[new Date(shift.shiftDate).getDay()];
              const remaining = shift.requiredCount - (shift.approvedCount || 0);

              return (
                <div key={shift.id} className="bg-white rounded-2xl p-5 shadow-[0_2px_12px_rgba(40,149,255,0.08)] border border-[#E8F0FA]">
                  {/* Date + Status */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-[18px] font-bold text-[#1A2E4A]">{shift.shiftDate}</span>
                      <span className="text-[13px] text-[#A3B5C8] ml-2">{dayOfWeek}</span>
                      <div className="text-[14px] font-medium text-[#4A5E75] mt-0.5">{shift.title}</div>
                    </div>
                    <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${
                      shift.status === 'open' && !isExpired
                        ? 'bg-[#E4FAF5] text-[#12B8A0]'
                        : 'bg-[#F5F5F5] text-[#999]'
                    }`}>
                      {shift.status === 'open' && !isExpired ? '开放中' : isExpired ? '已截止' : '已关闭'}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="space-y-2 mt-3">
                    <div className="flex items-center gap-2 text-[12px] text-[#6B839E]">
                      <Tag size={13} className="text-[#A3B5C8]" />
                      <span>类型</span>
                      <span className="font-medium text-[#4A5E75] ml-1">{shift.shiftType}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-[#6B839E]">
                      <Timer size={13} className="text-[#fa8c16]" />
                      <span>时间</span>
                      <span className="font-medium text-[#4A5E75] ml-1">{shift.startTime?.slice(0,5)} - {shift.endTime?.slice(0,5)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-[#6B839E]">
                      <Users size={13} className="text-[#2895FF]" />
                      <span>名额</span>
                      <span className="ml-1">
                        需求 <b className="text-[#1A2E4A]">{shift.requiredCount}</b> 人
                        <span className="mx-1 text-[#DDE9FF]">|</span>
                        已报名 <b className="text-[#2895FF]">{shift.signupCount}</b> 人
                        {remaining > 0 && <span className="text-[#fa8c16] ml-1">（剩余{remaining}）</span>}
                      </span>
                    </div>
                    {shift.projectName && (
                      <div className="flex items-center gap-2 text-[12px] text-[#6B839E]">
                        <MapPin size={13} className="text-[#C47A6B]" />
                        <span>项目</span>
                        <span className="font-medium text-[#4A5E75] ml-1">{shift.projectName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[12px] text-[#6B839E]">
                      <Clock size={13} className="text-[#C47A6B]" />
                      <span>截止</span>
                      <span className={`font-medium ml-1 ${isExpired ? 'text-[#C47A6B]' : 'text-[#4A5E75]'}`}>
                        {shift.signupDeadline?.slice(0, 16).replace('T', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="mt-4">
                    {canSignup && (
                      <button
                        onClick={() => handleSignup(shift.id)}
                        disabled={signingUp === shift.id}
                        className="w-full py-3 text-white rounded-xl text-[14px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 transition-all"
                        style={{ background: 'linear-gradient(90deg, #7C3AED, #A78BFA)', boxShadow: '0 4px 14px rgba(124,58,237,0.25)' }}>
                        {signingUp === shift.id ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                        {signingUp === shift.id ? '报名中...' : '立即报名'}
                      </button>
                    )}
                    {shift.mySignupStatus === 'pending' && (
                      <div className="flex gap-2">
                        <div className="flex-1 py-2.5 bg-[#EBF4FF] text-[#2895FF] rounded-xl text-[13px] font-medium text-center">
                          ⏳ 已报名，审批中
                        </div>
                        <button onClick={() => handleCancelSignup(shift.id)}
                          className="px-4 py-2.5 bg-[#FFF0EE] text-[#D96B5A] rounded-xl text-[13px] font-medium">
                          取消
                        </button>
                      </div>
                    )}
                    {shift.mySignupStatus === 'approved' && (
                      <div className="py-2.5 bg-[#E4FAF5] text-[#12B8A0] rounded-xl text-[13px] font-medium text-center">
                        ✅ 报名已通过，请按时出勤
                      </div>
                    )}
                    {shift.mySignupStatus === 'rejected' && (
                      <div className="py-2.5 bg-[#FFF0EE] text-[#D96B5A] rounded-xl text-[13px] font-medium text-center">
                        ❌ 报名未通过
                      </div>
                    )}
                    {!canSignup && !shift.mySignupStatus && (isExpired || isFull) && (
                      <div className="py-2.5 bg-[#F5F5F5] text-[#999] rounded-xl text-[13px] font-medium text-center">
                        {isFull ? '名额已满' : '已过截止时间'}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}