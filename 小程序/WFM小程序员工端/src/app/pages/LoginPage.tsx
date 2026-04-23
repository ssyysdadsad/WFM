import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Lock, Phone, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';
import { login } from '../services/api';
import { useAuth } from '../services/AuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setLoggedIn, isLoggedIn, mustChangePassword } = useAuth();
  const [showPwd, setShowPwd] = useState(false);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Show success message after password change
  useEffect(() => {
    const msg = searchParams.get('msg');
    if (msg === 'password_changed') {
      setSuccessMsg('密码修改成功，请使用新密码重新登录');
    }
  }, [searchParams]);

  useEffect(() => {
    if (isLoggedIn && !mustChangePassword) {
      navigate('/', { replace: true });
    }
  }, [isLoggedIn, mustChangePassword, navigate]);

  const handleLogin = async () => {
    if (!phone || !password) { setError('请输入手机号和密码'); return; }
    if (!/^1\d{10}$/.test(phone)) { setError('请输入有效的11位手机号'); return; }
    setLoading(true);
    setError('');
    setSuccessMsg('');
    try {
      const res = await login(phone, password);
      if (res.success && res.data?.employee) {
        if (res.data.mustChangePassword) {
          // Must change password first
          setLoggedIn(res.data.employee, true);
          navigate('/change-password?first=true', { replace: true });
        } else {
          setLoggedIn(res.data.employee, false);
          navigate('/', { replace: true });
        }
      } else {
        setError(res.message || '登录失败');
      }
    } catch (err: any) {
      setError(err.message || '网络异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
      {/* Top hero gradient area */}
      <div className="relative px-8 pt-14 pb-12 overflow-hidden" style={{ background: 'linear-gradient(135deg, #2895FF 0%, #3EAAFF 50%, #62D9FF 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-white/8" />
        <div className="absolute top-4 right-8 w-20 h-20 rounded-full bg-white/6" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-white/5" />

        <div className="relative z-10">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mb-5 backdrop-blur-sm border border-white/20 shadow-lg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <h1 className="text-[24px] font-bold text-white mb-1 tracking-wide">WFM 排班系统</h1>
          <p className="text-[14px] text-white/70">员工端</p>
        </div>
      </div>

      {/* Login card */}
      <div className="flex-1 bg-white rounded-t-[28px] -mt-4 px-6 pt-7 pb-6 overflow-y-auto shadow-[0_-4px_24px_rgba(40,149,255,0.10)]">
        <h2 className="text-[18px] font-bold text-[#1A2E4A] mb-1">欢迎登录</h2>
        <p className="text-[13px] text-[#A3B5C8] mb-6">请输入您的手机号和密码</p>

        {successMsg && (
          <div className="bg-[#F0FFF4] text-[#2E7D32] text-[12px] px-3 py-2 rounded-xl mb-4 border border-[#C8E6C9] flex items-center gap-2">
            <CheckCircle size={14} />
            {successMsg}
          </div>
        )}

        {error && (
          <div className="bg-[#FFF0EE] text-[#D96B5A] text-[12px] px-3 py-2 rounded-xl mb-4 border border-[#FFD9D4]">{error}</div>
        )}

        <div className="space-y-3">
          <div className="flex items-center bg-[#F6F8FA] rounded-xl px-4 h-12 border border-[#DDE9FF] focus-within:border-[#62D9FF] transition-colors">
            <Phone size={18} className="text-[#62D9FF] mr-3 shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm text-[#1A2E4A] outline-none placeholder:text-[#C0CFDD]"
              placeholder="手机号"
              type="tel"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          <div className="flex items-center bg-[#F6F8FA] rounded-xl px-4 h-12 border border-[#DDE9FF] focus-within:border-[#62D9FF] transition-colors">
            <Lock size={18} className="text-[#62D9FF] mr-3 shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm text-[#1A2E4A] outline-none placeholder:text-[#C0CFDD]"
              type={showPwd ? 'text' : 'password'}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
            <button onClick={() => setShowPwd(!showPwd)} className="ml-2">
              {showPwd ? <Eye size={18} className="text-[#A3B5C8]" /> : <EyeOff size={18} className="text-[#A3B5C8]" />}
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-12 text-white rounded-xl text-[15px] font-semibold active:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            style={{
              background: 'linear-gradient(90deg, #2895FF 0%, #62D9FF 100%)',
              boxShadow: '0 6px 18px rgba(40,149,255,0.30)'
            }}
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? '登录中...' : '登 录'}
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-[11px] text-[#C0CFDD]">首次登录请使用管理员分配的初始密码</p>
        </div>
      </div>
    </div>
  );
}