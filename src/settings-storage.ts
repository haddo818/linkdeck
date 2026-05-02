/** 로컬에 별도 닉네임을 저장하지 않았을 때 쓰는 기본값 (가입 시 이름은 auth/metadata 우선) */
export const DEFAULT_PROFILE_NICKNAME = '김사용자';

export const SETTINGS_STORAGE_KEYS = {
  nickname: 'linkdeck-profile-nickname',
  avatar: 'linkdeck-profile-avatar-dataurl',
  teams: 'linkdeck-settings-teams',
} as const;

/** 예전 구현의 전역 키. 계정 간 프로필 섞임 방지를 위해 읽지 않고 로그아웃 등에서 제거합니다. */
const LEGACY_PROFILE_KEYS = [
  SETTINGS_STORAGE_KEYS.nickname,
  SETTINGS_STORAGE_KEYS.avatar,
  SETTINGS_STORAGE_KEYS.teams,
] as const;

function scopedNicknameKey(userId: string): string {
  return `${SETTINGS_STORAGE_KEYS.nickname}:${userId}`;
}
function scopedAvatarKey(userId: string): string {
  return `${SETTINGS_STORAGE_KEYS.avatar}:${userId}`;
}
function scopedTeamsKey(userId: string): string {
  return `${SETTINGS_STORAGE_KEYS.teams}:${userId}`;
}

/** 로그아웃 시 호출: 예전 전역 프로필 키만 제거 (계정별 스코프 키는 유지). */
export function purgeLegacyProfileStorage(): void {
  try {
    for (const k of LEGACY_PROFILE_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

const PROFILE_UPDATED = 'linkdeck-profile-updated';
const TEAMS_UPDATED = 'linkdeck-teams-updated';

export interface StoredTeam {
  id: string;
  name: string;
  memberCount: number;
  role: 'admin' | 'member';
  /** 팀 관리자 표시 이름 */
  adminName: string;
  /** 팀원 초대용 고유 코드 */
  inviteCode: string;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function normalizeTeam(partial: Partial<StoredTeam>): StoredTeam {
  return {
    id: partial.id ?? `t${Date.now()}`,
    name: partial.name ?? '팀',
    memberCount: typeof partial.memberCount === 'number' ? partial.memberCount : 1,
    role: partial.role === 'member' ? 'member' : 'admin',
    adminName: (partial.adminName && partial.adminName.trim()) || DEFAULT_PROFILE_NICKNAME,
    inviteCode: (partial.inviteCode && partial.inviteCode.trim()) || generateInviteCode(),
  };
}

const DEFAULT_TEAMS: StoredTeam[] = [
  {
    id: 't1',
    name: '디자인팀',
    memberCount: 5,
    role: 'admin',
    adminName: DEFAULT_PROFILE_NICKNAME,
    inviteCode: 'DESIGN2024',
  },
];

/** 새 팀 저장 시 사용 */
export function createStoredTeam(name: string, adminNickname: string): StoredTeam {
  return normalizeTeam({
    id: `t${Date.now()}`,
    name: name.trim(),
    memberCount: 1,
    role: 'admin',
    adminName: adminNickname.trim() || DEFAULT_PROFILE_NICKNAME,
    inviteCode: generateInviteCode(),
  });
}

export function buildTeamInviteLink(team: StoredTeam): string {
  if (typeof window === 'undefined') return '';
  const u = new URL('/signup', window.location.origin);
  u.searchParams.set('team', team.id);
  u.searchParams.set('inviteCode', team.inviteCode);
  return u.toString();
}

export function getStoredNickname(userId: string | null | undefined): string {
  if (!userId) return DEFAULT_PROFILE_NICKNAME;
  try {
    const v = localStorage.getItem(scopedNicknameKey(userId));
    return v?.trim() || DEFAULT_PROFILE_NICKNAME;
  } catch {
    return DEFAULT_PROFILE_NICKNAME;
  }
}

export function setStoredNickname(name: string, userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(scopedNicknameKey(userId), name.trim());
    purgeLegacyProfileStorage();
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED));
  } catch {
    /* quota */
  }
}

export function getStoredAvatarDataUrl(userId: string | null | undefined): string | null {
  if (!userId) return null;
  try {
    const v = localStorage.getItem(scopedAvatarKey(userId));
    return v && v.startsWith('data:') ? v : null;
  } catch {
    return null;
  }
}

export function setStoredAvatarDataUrl(dataUrl: string | null, userId: string | null | undefined): void {
  if (!userId) return;
  try {
    if (dataUrl == null || dataUrl === '') {
      localStorage.removeItem(scopedAvatarKey(userId));
    } else {
      localStorage.setItem(scopedAvatarKey(userId), dataUrl);
    }
    purgeLegacyProfileStorage();
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED));
  } catch {
    /* quota */
  }
}

export function getStoredTeams(userId: string | null | undefined): StoredTeam[] {
  if (!userId) return DEFAULT_TEAMS.map(normalizeTeam);
  try {
    const raw = localStorage.getItem(scopedTeamsKey(userId));
    if (!raw) return DEFAULT_TEAMS.map(normalizeTeam);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TEAMS.map(normalizeTeam);
    return parsed.map((row) => normalizeTeam(row as Partial<StoredTeam>));
  } catch {
    return DEFAULT_TEAMS.map(normalizeTeam);
  }
}

export function setStoredTeams(teams: StoredTeam[], userId: string | null | undefined): void {
  if (!userId) return;
  try {
    localStorage.setItem(scopedTeamsKey(userId), JSON.stringify(teams));
    purgeLegacyProfileStorage();
    window.dispatchEvent(new CustomEvent(TEAMS_UPDATED));
  } catch {
    /* quota */
  }
}

/** 회원 탈퇴 시 해당 계정의 프로필·팀 설정만 제거 (테마 등은 유지) */
export function clearUserProfileSettings(userId: string | null | undefined): void {
  try {
    if (userId) {
      localStorage.removeItem(scopedNicknameKey(userId));
      localStorage.removeItem(scopedAvatarKey(userId));
      localStorage.removeItem(scopedTeamsKey(userId));
    }
    purgeLegacyProfileStorage();
    window.dispatchEvent(new CustomEvent(PROFILE_UPDATED));
    window.dispatchEvent(new CustomEvent(TEAMS_UPDATED));
  } catch {
    /* ignore */
  }
}

export function subscribeProfileUpdated(cb: () => void): () => void {
  window.addEventListener(PROFILE_UPDATED, cb);
  return () => window.removeEventListener(PROFILE_UPDATED, cb);
}

export function subscribeTeamsUpdated(cb: () => void): () => void {
  window.addEventListener(TEAMS_UPDATED, cb);
  return () => window.removeEventListener(TEAMS_UPDATED, cb);
}
