import type { AuthError } from '@supabase/supabase-js';

export function formatAuthError(error: AuthError | Error | { message?: string } | null | undefined): string {
  if (!error) return '알 수 없는 오류가 발생했습니다.';
  const msg = 'message' in error && error.message ? error.message : String(error);

  if (/Invalid login credentials|invalid login credentials/i.test(msg)) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (/User already registered|already been registered/i.test(msg)) {
    return '이미 가입된 이메일입니다.';
  }
  if (/Password should be at least/i.test(msg)) {
    return '비밀번호는 Supabase 정책에 맞는 길이·복잡도여야 합니다.';
  }
  if (/Email not confirmed|email not confirmed/i.test(msg)) {
    return '이메일 인증이 완료되지 않았습니다. 메일함을 확인하세요.';
  }
  if (/Invalid email/i.test(msg)) {
    return '이메일 형식이 올바르지 않습니다.';
  }

  return msg;
}
