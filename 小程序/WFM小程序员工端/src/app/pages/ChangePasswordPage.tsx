import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Lock, Eye, EyeOff, Loader2, ShieldCheck, AlertCircle, Check } from 'lucide-react';
import { changePassword } from '../services/api';
import { supabase } from '../services/supabase';
import { useAuth } from '../services/AuthContext';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { logout } = useAuth();
  const isFirst = searchParams.get('first') === 'true';

  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password strength checks
  const hasMinLength = newPwd.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPwd);
  const hasNumber = /\d/.test(newPwd);
  const passwordsMatch = newPwd === confirmPwd && confirmPwd.length > 0;
  const isValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  const handleSubmit = async () => {
    if (!isValid) {
      setError('请按要求设置密码');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await changePassword(newPwd);
      if (res.success) {
        // Sign out and redirect to login
        await supabase.auth.signOut();
        await logout();
        navigate('/login?msg=password_changed', { replace: true });
      } else {
        setError(res.message || '修改失败');
      }
    } catch (err: any) {
      setError(err.message || '网络异常');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col" style={{ background: 'linear-gradient(160deg, #F6F8FA 0%, #E9F4FF 100%)' }}>
      {/* Header */}
      <div className="relative px-6 pt-12 pb-10 overflow-hidden" style={{ background: 'linear-gradient(135deg, #2895FF 0%, #3EAAFF 50%, #62D9FF 100%)' }}>
        <div className="absolute -top-8 -right-8 w-36 h-36 rounded-full bg-white/8" />
        <div className="absolute bottom-0 left-0 w-28 h-28 rounded-full bg-white/5" />

        <div className="relative z-10 flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-white/20">
            <ShieldCheck size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-white">修改密码</h1>
            {isFirst && (
              <p className="text-[13px] text-white/80 mt-0.5">首次登录，请先修改初始密码</p>
            )}
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="flex-1 bg-white rounded-t-[28px] -mt-4 px-6 pt-7 pb-6 overflow-y-auto shadow-[0_-4px_24px_rgba(40,149,255,0.10)]">
        {isFirst && (
          <div className="bg-[#FFF8E1] text-[#F57F17] text-[13px] px-4 py-3 rounded-xl mb-5 border border-[#FFE082] flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>为确保账号安全，首次登录必须修改初始密码。修改成功后需重新登录。</span>
          </div>
        )}

        {error && (
          <div className="bg-[#FFF0EE] text-[#D96B5A] text-[12px] px-3 py-2 rounded-xl mb-4 border border-[#FFD9D4]">{error}</div>
        )}

        <div className="space-y-4">
          {/* New password */}
          <div>
            <label className="text-[13px] font-medium text-[#1A2E4A] mb-2 block">新密码</label>
            <div className="flex items-center bg-[#F6F8FA] rounded-xl px-4 h-12 border border-[#DDE9FF] focus-within:border-[#62D9FF] transition-colors">
              <Lock size={18} className="text-[#62D9FF] mr-3 shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm text-[#1A2E4A] outline-none placeholder:text-[#C0CFDD]"
                type={showNewPwd ? 'text' : 'password'}
                placeholder="请输入新密码"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
              />
              <button onClick={() => setShowNewPwd(!showNewPwd)} className="ml-2">
                {showNewPwd ? <Eye size={18} className="text-[#A3B5C8]" /> : <EyeOff size={18} className="text-[#A3B5C8]" />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="text-[13px] font-medium text-[#1A2E4A] mb-2 block">确认新密码</label>
            <div className="flex items-center bg-[#F6F8FA] rounded-xl px-4 h-12 border border-[#DDE9FF] focus-within:border-[#62D9FF] transition-colors">
              <Lock size={18} className="text-[#62D9FF] mr-3 shrink-0" />
              <input
                className="flex-1 bg-transparent text-sm text-[#1A2E4A] outline-none placeholder:text-[#C0CFDD]"
                type={showConfirmPwd ? 'text' : 'password'}
                placeholder="再次输入新密码"
                value={confirmPwd}
                onChange={(e) => setConfirmPwd(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              />
              <button onClick={() => setShowConfirmPwd(!showConfirmPwd)} className="ml-2">
                {showConfirmPwd ? <Eye size={18} className="text-[#A3B5C8]" /> : <EyeOff size={18} className="text-[#A3B5C8]" />}
              </button>
            </div>
          </div>

          {/* Password rules */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 space-y-2">
            <p className="text-[12px] font-medium text-[#64748B] mb-1">密码要求：</p>
            <div className="flex items-center gap-2">
              <Check size={14} className={hasMinLength ? 'text-[#2E7D32]' : 'text-[#CBD5E1]'} />
              <span className={`text-[12px] ${hasMinLength ? 'text-[#2E7D32]' : 'text-[#94A3B8]'}`}>至少 8 位字符</span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={14} className={hasLetter ? 'text-[#2E7D32]' : 'text-[#CBD5E1]'} />
              <span className={`text-[12px] ${hasLetter ? 'text-[#2E7D32]' : 'text-[#94A3B8]'}`}>包含字母</span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={14} className={hasNumber ? 'text-[#2E7D32]' : 'text-[#CBD5E1]'} />
              <span className={`text-[12px] ${hasNumber ? 'text-[#2E7D32]' : 'text-[#94A3B8]'}`}>包含数字</span>
            </div>
            <div className="flex items-center gap-2">
              <Check size={14} className={passwordsMatch ? 'text-[#2E7D32]' : 'text-[#CBD5E1]'} />
              <span className={`text-[12px] ${passwordsMatch ? 'text-[#2E7D32]' : 'text-[#94A3B8]'}`}>两次密码一致</span>
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            className="w-full h-12 text-white rounded-xl text-[15px] font-semibold active:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 mt-2"
            style={{
              background: isValid
                ? 'linear-gradient(90deg, #2895FF 0%, #62D9FF 100%)'
                : '#CBD5E1',
              boxShadow: isValid ? '0 6px 18px rgba(40,149,255,0.30)' : 'none'
            }}
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {loading ? '修改中...' : '确认修改'}
          </button>

          <p className="text-center text-[11px] text-[#94A3B8] mt-3">
            修改成功后将自动退出，请使用新密码重新登录
          </p>
        </div>
      </div>
    </div>
  );
}
