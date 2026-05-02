import type { User } from '@supabase/supabase-js';
import { DEFAULT_PROFILE_NICKNAME, getStoredNickname } from '../settings-storage';

export function displayNameFromAuthUser(user: User | null | undefined): string | null {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const n =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (typeof meta.user_name === 'string' && meta.user_name.trim()) ||
    '';
  return n || null;
}

/**
 * 대시보드·사이드바 표시명. 로컬에서 닉네임을 바꾼 경우(settings)에는 그 값을 우선합니다.
 * 그렇지 않으면 가입 시 입력한 이름(auth 메타데이터 → DB) 순입니다.
 */
export function resolveDashboardDisplayName(
  authUser: User | null | undefined,
  profileNameFromDb: string | null | undefined
): string {
  const stored = getStoredNickname();
  if (stored !== DEFAULT_PROFILE_NICKNAME && stored.trim()) {
    return stored;
  }

  const fromAuth = displayNameFromAuthUser(authUser);
  if (fromAuth) return fromAuth;

  const db = profileNameFromDb?.trim();
  if (db && db !== '사용자' && db !== 'User') return db;

  const emailLocal = authUser?.email?.split('@')[0]?.trim();
  if (emailLocal) return emailLocal;

  return stored;
}
