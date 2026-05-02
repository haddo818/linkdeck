import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  User,
  Users as UsersIcon,
  ArrowLeft,
  Plus,
  X,
  Copy,
  Link2,
  Trash2,
  LogOut,
} from 'lucide-react';
import { toast } from 'sonner';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { formatAuthError } from '../../lib/auth-errors';
import { useAuth } from '../../hooks/useAuth';
import { displayNameFromAuthUser } from '../../lib/display-name';
import {
  DEFAULT_PROFILE_NICKNAME,
  getStoredNickname,
  setStoredNickname,
  getStoredAvatarDataUrl,
  setStoredAvatarDataUrl,
  getStoredTeams,
  setStoredTeams,
  clearUserProfileSettings,
  buildTeamInviteLink,
  createStoredTeam,
  subscribeTeamsUpdated,
  type StoredTeam,
} from '../../settings-storage';

const neumorphismStyle = {
  light: 'shadow-[8px_8px_16px_rgba(0,0,0,0.1),-8px_-8px_16px_rgba(255,255,255,0.7)] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.4),-8px_-8px_16px_rgba(255,255,255,0.02)]',
};

type SettingsTab = 'account' | 'teams';

type ModalKind = 'nickname' | 'newTeam' | 'withdraw' | null;

type DeleteTeamsModal = null | { kind: 'bulk'; ids: string[] } | { kind: 'single'; team: StoredTeam };

function initialTabFromHash(): SettingsTab {
  if (typeof window === 'undefined') return 'account';
  const h = window.location.hash.replace(/^#/, '');
  if (h === 'teams') return 'teams';
  return 'account';
}

const AVATAR_MAX_STORAGE_CHARS = 480_000;

function resizeImageFileToJpegDataUrl(file: File, maxDimension: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    img.src = url;
  });
}

async function copyToClipboard(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(successMessage);
  } catch {
    toast.error('복사에 실패했습니다. 브라우저에서 클립보드 권한을 확인해 주세요.');
  }
}

export default function Settings() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTabFromHash);
  const [modal, setModal] = useState<ModalKind>(null);
  const [deleteTeamsModal, setDeleteTeamsModal] = useState<DeleteTeamsModal>(null);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [withdrawConfirmText, setWithdrawConfirmText] = useState('');
  const [teams, setTeams] = useState<StoredTeam[]>(() => getStoredTeams());
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(() => new Set());

  const [displayNickname, setDisplayNickname] = useState(() => getStoredNickname());
  const [avatarPreview, setAvatarPreview] = useState<string | null>(() => getStoredAvatarDataUrl());

  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncHash = () => {
      const h = window.location.hash.replace(/^#/, '');
      if (h === 'teams') setActiveTab('teams');
      else setActiveTab('account');
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  useEffect(() => {
    setDisplayNickname(getStoredNickname());
    setAvatarPreview(getStoredAvatarDataUrl());
    setTeams(getStoredTeams());
  }, []);

  useEffect(() => {
    const stored = getStoredNickname();
    if (stored !== DEFAULT_PROFILE_NICKNAME) return;
    const fromAuth = displayNameFromAuthUser(authUser);
    if (fromAuth) setDisplayNickname(fromAuth);
  }, [authUser]);

  useEffect(() => {
    return subscribeTeamsUpdated(() => setTeams(getStoredTeams()));
  }, []);

  const allSelected = useMemo(
    () => teams.length > 0 && teams.every((t) => selectedTeamIds.has(t.id)),
    [teams, selectedTeamIds]
  );

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedTeamIds(new Set());
    } else {
      setSelectedTeamIds(new Set(teams.map((t) => t.id)));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persistTeams = (next: StoredTeam[]) => {
    setStoredTeams(next);
    setTeams(next);
    setSelectedTeamIds(new Set());
  };

  const openNicknameModal = () => {
    setNicknameDraft(getStoredNickname());
    setModal('nickname');
  };

  const saveNickname = () => {
    const next = nicknameDraft.trim();
    if (!next) {
      toast.error('닉네임을 입력해 주세요.');
      return;
    }
    if (next.length > 40) {
      toast.error('닉네임은 40자 이내로 입력해 주세요.');
      return;
    }
    setStoredNickname(next);
    setDisplayNickname(next);
    toast.success('닉네임이 저장되었습니다.');
    setModal(null);
  };

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) {
      toast.error('이미지 파일만 선택할 수 있습니다.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('파일 크기는 8MB 이하여야 합니다.');
      return;
    }
    try {
      const dataUrl = await resizeImageFileToJpegDataUrl(file, 320);
      if (dataUrl.length > AVATAR_MAX_STORAGE_CHARS) {
        toast.error('이미지 처리 후에도 용량이 커서 저장할 수 없습니다. 다른 이미지를 선택해 주세요.');
        return;
      }
      setStoredAvatarDataUrl(dataUrl);
      setAvatarPreview(dataUrl);
      toast.success('프로필 사진이 저장되었습니다.');
    } catch {
      toast.error('이미지를 불러오지 못했습니다.');
    }
  };

  const removeAvatar = () => {
    setStoredAvatarDataUrl(null);
    setAvatarPreview(null);
    toast.success('프로필 사진이 제거되었습니다.');
  };

  const saveNewTeam = () => {
    const name = newTeamName.trim();
    if (!name) {
      toast.error('팀 이름을 입력해 주세요.');
      return;
    }
    const created = createStoredTeam(name, getStoredNickname());
    const next = [...teams, created];
    persistTeams(next);
    setNewTeamName('');
    toast.success(`「${name}」 팀이 만들어졌습니다. 초대 코드와 링크로 팀원을 초대할 수 있습니다.`);
    setModal(null);
  };

  const confirmDeleteTeams = () => {
    if (!deleteTeamsModal) return;
    const ids =
      deleteTeamsModal.kind === 'bulk'
        ? deleteTeamsModal.ids
        : [deleteTeamsModal.team.id];
    const next = teams.filter((t) => !ids.includes(t.id));
    persistTeams(next);
    toast.success(ids.length > 1 ? `${ids.length}개 팀을 삭제했습니다.` : '팀을 삭제했습니다.');
    setDeleteTeamsModal(null);
  };

  const handleLogout = async () => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(formatAuthError(error));
        return;
      }
    }
    toast.success('로그아웃되었습니다.');
    navigate('/login', { replace: true });
  };

  const handleWithdraw = () => {
    if (withdrawConfirmText.trim() !== '탈퇴합니다') {
      toast.error('확인 문구를 정확히 입력해 주세요: 탈퇴합니다');
      return;
    }
    clearUserProfileSettings();
    setDisplayNickname(getStoredNickname());
    setAvatarPreview(null);
    setTeams(getStoredTeams());
    setWithdrawConfirmText('');
    setModal(null);
    toast.success('회원 탈퇴가 완료되었습니다. 모든 계정 데이터가 삭제되었습니다.');
    window.setTimeout(() => navigate('/login', { replace: true }), 500);
  };

  const closeModal = () => setModal(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200"
            >
              <ArrowLeft size={24} />
            </Link>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">환경설정</h1>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className={`bg-white dark:bg-gray-800 rounded-3xl overflow-hidden relative ${neumorphismStyle.light}`}>
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="flex overflow-x-auto">
              {(
                [
                  { id: 'account' as const, label: '계정관리', icon: User },
                  { id: 'teams' as const, label: '팀관리', icon: UsersIcon },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab.id);
                    window.history.replaceState(null, '', tab.id === 'account' ? '/settings' : `/settings#${tab.id}`);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 text-sm border-b-2 transition-colors min-w-[120px] ${
                    activeTab === tab.id
                      ? 'border-[#169392] text-[#169392]'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <tab.icon size={18} />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-8">
            {activeTab === 'account' && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">프로필</h2>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden bg-gradient-to-br from-[#169392] to-[#0d6766] flex items-center justify-center text-white shrink-0 border border-gray-200 dark:border-gray-600">
                      {avatarPreview ? (
                        <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User size={36} />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{displayNickname}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {authUser?.email ?? (isSupabaseConfigured ? '—' : 'user@example.com')}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={onPickAvatar}
                    />
                    <button
                      type="button"
                      onClick={() => avatarInputRef.current?.click()}
                      className="w-full text-left px-6 py-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-700 transition-colors text-gray-900 dark:text-gray-100"
                    >
                      프로필 사진 변경
                    </button>
                    {avatarPreview && (
                      <button
                        type="button"
                        onClick={removeAvatar}
                        className="w-full text-left px-6 py-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-700 transition-colors text-gray-600 dark:text-gray-300 text-sm"
                      >
                        프로필 사진 제거
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openNicknameModal}
                      className="w-full text-left px-6 py-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-700 transition-colors text-gray-900 dark:text-gray-100"
                    >
                      닉네임 변경
                    </button>
                  </div>
                </div>

                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">계정 관리</h2>
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full text-left px-6 py-4 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 border border-gray-200 dark:border-gray-700 transition-colors flex items-center gap-3 text-gray-900 dark:text-gray-100"
                    >
                      <LogOut size={20} className="text-gray-500 dark:text-gray-400" />
                      로그아웃
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWithdrawConfirmText('');
                        setModal('withdraw');
                      }}
                      className="w-full text-left px-6 py-4 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-600 transition-colors"
                    >
                      회원탈퇴
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'teams' && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">내 팀</h2>
                  {selectedTeamIds.size > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDeleteTeamsModal({ kind: 'bulk', ids: [...selectedTeamIds] })
                      }
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 text-sm font-medium transition-colors"
                    >
                      <Trash2 size={18} />
                      선택 삭제 ({selectedTeamIds.size})
                    </button>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                  <table className="w-full text-sm text-left min-w-[640px]">
                    <thead className="bg-gray-50 dark:bg-gray-900/80 text-gray-700 dark:text-gray-300">
                      <tr>
                        <th className="px-4 py-3 w-12">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                            className="rounded border-gray-300 text-[#169392] focus:ring-[#169392]"
                            aria-label="전체 선택"
                          />
                        </th>
                        <th className="px-4 py-3 font-medium">팀 이름</th>
                        <th className="px-4 py-3 font-medium">팀 관리자</th>
                        <th className="px-4 py-3 font-medium text-right">초대·관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {teams.map((team) => (
                        <tr key={team.id} className="bg-white dark:bg-gray-800/50 hover:bg-gray-50/80 dark:hover:bg-gray-900/40">
                          <td className="px-4 py-3 align-middle">
                            <input
                              type="checkbox"
                              checked={selectedTeamIds.has(team.id)}
                              onChange={() => toggleRow(team.id)}
                              className="rounded border-gray-300 text-[#169392] focus:ring-[#169392]"
                              aria-label={`${team.name} 선택`}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{team.name}</td>
                          <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{team.adminName}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => copyToClipboard(team.inviteCode, '초대 코드가 복사되었습니다.')}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-100"
                              >
                                <Copy size={14} />
                                코드
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(buildTeamInviteLink(team), '초대 링크가 복사되었습니다.')
                                }
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-[#169392]/15 text-[#169392] hover:bg-[#169392]/25"
                              >
                                <Link2 size={14} />
                                링크
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteTeamsModal({ kind: 'single', team })}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 size={14} />
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  팀원 초대: <strong className="text-gray-700 dark:text-gray-300">초대 코드</strong>를 알려주거나{' '}
                  <strong className="text-gray-700 dark:text-gray-300">초대 링크</strong>를 공유하세요. 링크는 회원가입
                  화면으로 연결됩니다.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    setNewTeamName('');
                    setModal('newTeam');
                  }}
                  className="w-full px-6 py-4 rounded-xl bg-[#169392] text-white hover:bg-[#0d6766] flex items-center justify-center gap-2 transition-colors"
                >
                  <Plus size={20} />
                  새 팀 만들기
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* 닉네임 */}
      {modal === 'nickname' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={closeModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 ${neumorphismStyle.light}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 pr-10">닉네임 변경</h3>
            <input
              type="text"
              value={nicknameDraft}
              onChange={(e) => setNicknameDraft(e.target.value)}
              className="w-full px-4 py-3 mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
              placeholder="새 닉네임"
              maxLength={40}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveNickname}
                className="flex-1 py-3 rounded-xl bg-[#169392] text-white hover:bg-[#0d6766]"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 새 팀 */}
      {modal === 'newTeam' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={closeModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 ${neumorphismStyle.light}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 pr-10">새 팀 만들기</h3>
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              className="w-full px-4 py-3 mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
              placeholder="팀 이름"
              maxLength={60}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={saveNewTeam}
                className="flex-1 py-3 rounded-xl bg-[#169392] text-white hover:bg-[#0d6766]"
              >
                만들기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 회원 탈퇴 — 완전 삭제 경고 */}
      {modal === 'withdraw' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={closeModal}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full p-6 ${neumorphismStyle.light}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300"
              aria-label="닫기"
            >
              <X size={20} />
            </button>
            <h3 className="text-lg font-semibold text-red-600 mb-2 pr-10">회원 탈퇴 · 데이터 완전 삭제</h3>
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-4 space-y-2">
              <p>
                계정과 연동된 <strong className="text-gray-900 dark:text-gray-100">프로필·팀 설정이 영구 삭제</strong>
                되며 복구할 수 없습니다.
              </p>
              <p>
                진행하려면 아래 입력란에 <strong className="text-gray-900 dark:text-gray-100">탈퇴합니다</strong>를
                정확히 입력하세요.
              </p>
            </div>
            <input
              type="text"
              value={withdrawConfirmText}
              onChange={(e) => setWithdrawConfirmText(e.target.value)}
              placeholder="탈퇴합니다"
              className="w-full px-4 py-3 mb-4 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-red-400 text-gray-900 dark:text-gray-100"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white hover:bg-red-700"
              >
                탈퇴하고 삭제
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 팀 삭제 확인 */}
      {deleteTeamsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setDeleteTeamsModal(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className={`relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 ${neumorphismStyle.light}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">팀 삭제</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {deleteTeamsModal.kind === 'single' ? (
                <>
                  <strong className="text-gray-900 dark:text-gray-100">{deleteTeamsModal.team.name}</strong> 팀을
                  삭제합니다. 초대 코드·링크는 더 이상 사용할 수 없습니다. 이 작업은 되돌릴 수 없습니다.
                </>
              ) : (
                <>
                  선택한 <strong className="text-gray-900 dark:text-gray-100">{deleteTeamsModal.ids.length}개</strong>{' '}
                  팀을 삭제합니다. 이 작업은 되돌릴 수 없습니다.
                </>
              )}
            </p>
            {deleteTeamsModal.kind === 'bulk' && deleteTeamsModal.ids.length > 0 && (
              <ul className="text-sm text-gray-700 dark:text-gray-300 mb-4 max-h-32 overflow-y-auto list-disc pl-5 space-y-1">
                {deleteTeamsModal.ids.map((id) => (
                  <li key={id}>{teams.find((t) => t.id === id)?.name ?? id}</li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteTeamsModal(null)}
                className="flex-1 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmDeleteTeams}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white hover:bg-red-700"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
