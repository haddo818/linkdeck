import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { ArrowLeft, Archive, Search, ExternalLink } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import { deleteLinkRow, fetchArchivedLinksForUser, updateLinkRow } from '../../lib/supabase-data';
import { useAuth } from '../../hooks/useAuth';

const neumorphismStyle = {
  light: 'shadow-[8px_8px_16px_rgba(0,0,0,0.1),-8px_-8px_16px_rgba(255,255,255,0.7)] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.4),-8px_-8px_16px_rgba(255,255,255,0.02)]',
  lightHover: 'hover:shadow-[12px_12px_24px_rgba(0,0,0,0.15),-12px_-12px_24px_rgba(255,255,255,0.8)] dark:hover:shadow-[12px_12px_24px_rgba(0,0,0,0.5),-12px_-12px_24px_rgba(255,255,255,0.03)]',
  inset: 'shadow-[inset_4px_4px_8px_rgba(0,0,0,0.1),inset_-4px_-4px_8px_rgba(255,255,255,0.7)] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.4),inset_-4px_-4px_8px_rgba(255,255,255,0.02)]',
};

interface ArchivedLink {
  id: string;
  title: string;
  url: string;
  memo?: string;
  boardName: string;
  boardColor: string;
  archivedAt: Date;
}

const ITEMS_PER_PAGE = 10;

function buildMockArchivedLinks(): ArchivedLink[] {
  const base: ArchivedLink[] = [
    {
      id: 'a1',
      title: 'React 공식 문서',
      url: 'https://react.dev',
      memo: 'React 최신 문서',
      boardName: '개발 자료',
      boardColor: '#4ECDC4',
      archivedAt: new Date('2024-01-15'),
    },
    {
      id: 'a2',
      title: 'Tailwind CSS',
      url: 'https://tailwindcss.com',
      boardName: '개발 자료',
      boardColor: '#4ECDC4',
      archivedAt: new Date('2024-01-20'),
    },
    {
      id: 'a3',
      title: 'Dribbble',
      url: 'https://dribbble.com',
      memo: 'UI/UX 디자인 레퍼런스',
      boardName: '디자인 레퍼런스',
      boardColor: '#FF6B6B',
      archivedAt: new Date('2024-02-01'),
    },
  ];
  for (let n = 4; n <= 23; n++) {
    const dev = n % 2 === 0;
    base.push({
      id: `a${n}`,
      title: `보관 링크 예시 ${n}`,
      url: `https://example.com/archived/${n}`,
      memo: n % 3 === 0 ? `메모 텍스트 ${n}` : undefined,
      boardName: dev ? '개발 자료' : '디자인 레퍼런스',
      boardColor: dev ? '#4ECDC4' : '#FF6B6B',
      archivedAt: new Date(2024, ((n - 1) % 12), ((n * 3) % 28) + 1),
    });
  }
  return base;
}

/** 페이지 번호 버튼 목록 (넓은 경우 … 생략 구간은 gap) */
function getPageList(current: number, total: number): (number | 'gap')[] {
  if (total <= 1) return [1];
  const delta = 2;
  const range: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) {
      range.push(i);
    }
  }
  const out: (number | 'gap')[] = [];
  let prev: number | undefined;
  for (const i of range) {
    if (prev !== undefined) {
      if (i - prev === 2) out.push(prev + 1);
      else if (i - prev > 2) out.push('gap');
    }
    out.push(i);
    prev = i;
  }
  return out;
}

export default function ArchivedLinks() {
  const { userId } = useAuth();
  const useRemote = Boolean(isSupabaseConfigured && supabase && userId);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [archivedLinks, setArchivedLinks] = useState<ArchivedLink[]>([]);

  useEffect(() => {
    if (useRemote && supabase && userId) {
      fetchArchivedLinksForUser(supabase, userId)
        .then((rows) => {
          setArchivedLinks(
            rows.map((r) => ({
              id: r.id,
              title: r.title,
              url: r.url,
              memo: r.memo,
              boardName: r.boardName,
              boardColor: r.boardColor,
              archivedAt: r.archivedAt,
            }))
          );
        })
        .catch(() => {
          toast.error('보관 링크를 불러오지 못했습니다.');
        });
      return;
    }
    setArchivedLinks(buildMockArchivedLinks());
  }, [useRemote, userId]);

  const handleRestoreLink = (linkId: string) => {
    if (useRemote && supabase && userId) {
      void (async () => {
        const target = archivedLinks.find((l) => l.id === linkId);
        try {
          await updateLinkRow(supabase, linkId, { status: 'active' });
          const rows = await fetchArchivedLinksForUser(supabase, userId);
          setArchivedLinks(
            rows.map((r) => ({
              id: r.id,
              title: r.title,
              url: r.url,
              memo: r.memo,
              boardName: r.boardName,
              boardColor: r.boardColor,
              archivedAt: r.archivedAt,
            }))
          );
          toast.success(`「${target?.title ?? '링크'}」을(를) 보드에 복구했습니다.`, {
            description: '대시보드의 해당 보드에서 링크를 확인할 수 있습니다.',
          });
        } catch {
          toast.error('복구에 실패했습니다.');
        }
      })();
      return;
    }
    setArchivedLinks((prev) => {
      const target = prev.find((l) => l.id === linkId);
      if (!target) return prev;
      toast.success(`「${target.title}」을(를) 보드에 복구했습니다.`, {
        description: '대시보드의 해당 보드에서 링크를 확인할 수 있습니다.',
      });
      return prev.filter((l) => l.id !== linkId);
    });
  };

  const handleDeleteLink = (linkId: string) => {
    if (useRemote && supabase && userId) {
      void (async () => {
        try {
          await deleteLinkRow(supabase, linkId);
          const rows = await fetchArchivedLinksForUser(supabase, userId);
          setArchivedLinks(
            rows.map((r) => ({
              id: r.id,
              title: r.title,
              url: r.url,
              memo: r.memo,
              boardName: r.boardName,
              boardColor: r.boardColor,
              archivedAt: r.archivedAt,
            }))
          );
          toast.success('완전히 삭제되었습니다.');
        } catch {
          toast.error('삭제에 실패했습니다.');
        }
      })();
      return;
    }
    setArchivedLinks((prev) => {
      if (!prev.some((l) => l.id === linkId)) return prev;
      toast.success('완전히 삭제되었습니다.');
      return prev.filter((l) => l.id !== linkId);
    });
  };

  const filteredLinks = useMemo(
    () =>
      archivedLinks.filter(
        (link) =>
          link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          link.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
          link.memo?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          link.boardName.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    [archivedLinks, searchQuery]
  );

  const totalPages = Math.max(1, Math.ceil(filteredLinks.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedLinks = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLinks.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredLinks, currentPage]);

  const rangeStart = filteredLinks.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * ITEMS_PER_PAGE, filteredLinks.length);
  const pageSlots = useMemo(() => getPageList(currentPage, totalPages), [currentPage, totalPages]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link
                to="/dashboard"
                className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200"
              >
                <ArrowLeft size={24} />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center">
                  <Archive size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">보관된 링크</h1>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {searchQuery.trim()
                      ? `검색 결과 ${filteredLinks.length}건 · 전체 ${archivedLinks.length}건`
                      : `총 ${archivedLinks.length}개`}
                  </p>
                </div>
              </div>
            </div>

            {/* 검색 */}
            <div className={`flex-1 max-w-md flex items-center gap-3 px-4 py-2 bg-white dark:bg-gray-800 rounded-xl ${neumorphismStyle.inset}`}>
              <Search size={18} className="text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="보관된 링크 검색..."
                className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {filteredLinks.length === 0 ? (
          <div className={`bg-white dark:bg-gray-800 rounded-3xl p-12 text-center ${neumorphismStyle.light}`}>
            <Archive size={64} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {searchQuery ? '검색 결과가 없습니다' : '보관된 링크가 없습니다'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400">
              {searchQuery
                ? '다른 검색어를 시도해보세요'
                : '링크를 보관하면 여기에 표시됩니다'}
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {paginatedLinks.map((link) => (
              <div
                key={link.id}
                className={`bg-white dark:bg-gray-800 rounded-2xl p-6 ${neumorphismStyle.light} hover:shadow-[12px_12px_24px_rgba(0,0,0,0.15),-12px_-12px_24px_rgba(255,255,255,0.8)] transition-all`}
              >
                <div className="flex items-start gap-4">
                  {/* 보드 색상 표시 */}
                  <div
                    className="w-1 h-20 rounded-full flex-shrink-0"
                    style={{ backgroundColor: link.boardColor }}
                  />

                  {/* 링크 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 truncate">
                          {link.title}
                        </h3>
                        <div className="flex items-center gap-2 mb-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: link.boardColor }}
                          />
                          <span className="text-sm text-gray-600 dark:text-gray-400">
                            {link.boardName}
                          </span>
                          <span className="text-gray-300 dark:text-gray-600">•</span>
                          <span className="text-sm text-gray-500 dark:text-gray-500">
                            {link.archivedAt.toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {link.memo && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                        {link.memo}
                      </p>
                    )}

                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-[#169392] hover:underline"
                    >
                      {link.url} <ExternalLink size={14} />
                    </a>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleRestoreLink(link.id);
                      }}
                      className="px-4 py-2 text-sm rounded-lg bg-[#169392] text-white hover:bg-[#0d6766] transition-colors"
                    >
                      복구
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteLink(link.id);
                      }}
                      className="px-4 py-2 text-sm rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
              ))}
            </div>

            <div
              className={`mt-8 flex flex-col items-stretch gap-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${neumorphismStyle.light}`}
            >
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 sm:text-left">
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {rangeStart}–{rangeEnd}
                </span>
                <span className="mx-1">/</span>
                전체 {filteredLinks.length}건 · 페이지 {currentPage}/{totalPages}
              </p>
              <nav className="flex flex-wrap items-center justify-center gap-2" aria-label="페이지 탐색">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-800 dark:text-gray-100 disabled:opacity-40 disabled:pointer-events-none hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  이전
                </button>
                {pageSlots.map((slot, idx) =>
                  slot === 'gap' ? (
                    <span key={`gap-${idx}`} className="px-1 text-gray-400 select-none" aria-hidden>
                      …
                    </span>
                  ) : (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setCurrentPage(slot)}
                      className={`min-w-[2.25rem] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        currentPage === slot
                          ? 'bg-[#169392] text-white shadow'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                      aria-current={currentPage === slot ? 'page' : undefined}
                    >
                      {slot}
                    </button>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm font-medium text-gray-800 dark:text-gray-100 disabled:opacity-40 disabled:pointer-events-none hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  다음
                </button>
              </nav>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
