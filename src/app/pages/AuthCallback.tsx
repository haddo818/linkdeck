import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatAuthError } from '../../lib/auth-errors';

/**
 * 이메일 확인·비밀번호 재설정 등에서 돌아오는 주소.
 * Supabase Dashboard → Authentication → URL Configuration → Redirect URLs에
 * 예: http://localhost:5173/auth/callback , 배포 도메인/auth/callback 추가
 */
export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      toast.error('.env에 VITE_SUPABASE_URL·VITE_SUPABASE_ANON_KEY를 설정해 주세요.');
      navigate('/login', { replace: true });
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (cancelled) return;
          if (exchangeError) {
            toast.error(formatAuthError(exchangeError));
            navigate('/login', { replace: true });
            return;
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          toast.error(formatAuthError(error));
          navigate('/login', { replace: true });
          return;
        }
        if (data.session) {
          toast.success('로그인되었습니다.');
          navigate('/dashboard', { replace: true });
          return;
        }
        toast.error('인증 세션을 만들 수 없습니다. 링크가 만료되었거나 이미 사용된 경우일 수 있습니다.');
        navigate('/login', { replace: true });
      } catch (e) {
        if (!cancelled) {
          toast.error(formatAuthError(e instanceof Error ? e : undefined));
          navigate('/login', { replace: true });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-sm">
      로그인 처리 중…
    </div>
  );
}
