import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { UserPlus, Mail, Lock, User } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatAuthError } from '../../lib/auth-errors';
import { setStoredNickname } from '../../settings-storage';

const neumorphismStyle = {
  light: 'shadow-[8px_8px_16px_rgba(0,0,0,0.1),-8px_-8px_16px_rgba(255,255,255,0.7)] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.4),-8px_-8px_16px_rgba(255,255,255,0.02)]',
  inset: 'shadow-[inset_4px_4px_8px_rgba(0,0,0,0.1),inset_-4px_-4px_8px_rgba(255,255,255,0.7)] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.4),inset_-4px_-4px_8px_rgba(255,255,255,0.02)]',
};

export default function Signup() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      toast.error(
        'Supabase 연결이 필요합니다. 프로젝트 루트에 .env 파일을 만들고 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY를 설정해 주세요.'
      );
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: name,
          name,
        },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(formatAuthError(error));
      return;
    }

    const trimmedName = name.trim();
    const uid = data.user?.id;
    if (trimmedName && uid) setStoredNickname(trimmedName, uid);

    if (data.session) {
      toast.success('가입이 완료되었습니다.');
      navigate('/dashboard');
    } else {
      toast.success('인증 메일을 발송했습니다. 확인 후 로그인해 주세요.');
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className={`w-full max-w-md bg-white dark:bg-gray-800 rounded-3xl p-8 ${neumorphismStyle.light}`}>
        {/* 로고 */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#169392] to-[#0d6766] flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
              <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-center text-gray-900 dark:text-gray-100 mb-2">
          계정 만들기
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 mb-8">
          LinkDeck과 함께 시작하세요
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              이름
            </label>
            <div className={`flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl ${neumorphismStyle.inset}`}>
              <User size={20} className="text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                required
                className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              이메일
            </label>
            <div className={`flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl ${neumorphismStyle.inset}`}>
              <Mail size={20} className="text-gray-400 dark:text-gray-500" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              비밀번호
            </label>
            <div className={`flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl ${neumorphismStyle.inset}`}>
              <Lock size={20} className="text-gray-400 dark:text-gray-500" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8자 이상"
                required
                minLength={8}
                className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              비밀번호 확인
            </label>
            <div className={`flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl ${neumorphismStyle.inset}`}>
              <Lock size={20} className="text-gray-400 dark:text-gray-500" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="비밀번호 재입력"
                required
                minLength={8}
                className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              required
              className="mt-1 w-4 h-4 rounded border-gray-300 text-[#169392] focus:ring-[#169392]"
            />
            <label className="text-sm text-gray-600 dark:text-gray-400">
              <a href="#" className="text-[#169392] hover:underline">이용약관</a> 및{' '}
              <a href="#" className="text-[#169392] hover:underline">개인정보처리방침</a>에 동의합니다.
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[#169392] hover:bg-[#0d6766] disabled:opacity-60 disabled:pointer-events-none text-white rounded-xl transition-colors"
          >
            <UserPlus size={20} />
            {loading ? '처리 중…' : '회원가입'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            이미 계정이 있으신가요?{' '}
            <Link to="/login" className="text-[#169392] hover:underline font-medium">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
