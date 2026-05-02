import React from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth';
import { isSupabaseConfigured } from '../../lib/supabase';

type Props = { children: React.ReactNode };

/** Supabase가 켜져 있을 때만: 이미 로그인된 사용자는 대시보드로 보냄 */
export function GuestRoute({ children }: Props) {
  const { isAuthenticated, loading } = useAuth();

  if (!isSupabaseConfigured) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 text-sm">
        세션 확인 중…
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
