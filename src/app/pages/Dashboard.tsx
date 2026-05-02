import React, { useState, useEffect, useCallback, useMemo, useReducer } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { getInitialDarkMode, persistDarkMode } from '../../theme-storage';
import { getStoredAvatarDataUrl, getStoredTeams, subscribeProfileUpdated, subscribeTeamsUpdated } from '../../settings-storage';
import { resolveDashboardDisplayName } from '../../lib/display-name';
import type { StoredTeam } from '../../settings-storage';
import { formatAuthError } from '../../lib/auth-errors';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  deleteBoardById,
  deleteLinkRow,
  fetchBoardsForUser,
  fetchMyTeams,
  fetchProfileName,
  formatSupabaseError,
  insertBoard,
  insertLinkRow,
  moveLinkToBoard,
  syncPublicUserFromAuth,
  updateBoardLayout,
  updateBoardMeta,
  updateLinkRow,
} from '../../lib/supabase-data';
import { useAuth } from '../../hooks/useAuth';
import { fetchLinkPreviewImage } from '../../lib/link-preview';
import { User, Search, Plus, Moon, Sun, X, MoreVertical, Trash2, Archive, ExternalLink, LayoutGrid, Table as TableIcon, Settings, Users as UsersIcon, ArrowUpDown, Edit2, Palette, XCircle, ChevronDown, Maximize2, Minimize2, RotateCcw, Loader2 } from 'lucide-react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

interface Link {
  id: string;
  title: string;
  url: string;
  memo?: string;
  boardId: string;
  status: 'active' | 'archived';
  createdAt: Date;
  createdBy: string;
  displayType?: 'preview' | 'url';
}

interface Board {
  id: string;
  name: string;
  color: string;
  links: Link[];
  height: number;
  width: number;
  ownerId?: string; // 개인 보드
  teamId?: string; // 팀 보드
}

type ViewMode = 'grid' | 'table';

/** main 영역 max-w-7xl(1280px) · gap-6 · 한 줄에 3개 보드 기준 너비 */
const BOARD_GRID_MAX_CONTAINER_PX = 1280;
const BOARD_GRID_GAP_PX = 24;
const DEFAULT_BOARDS_PER_ROW = 3;

function getDefaultBoardDimensions(): { width: number; height: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : BOARD_GRID_MAX_CONTAINER_PX;
  const padX = vw >= 1024 ? 64 : vw >= 640 ? 48 : 32;
  const containerOuter = Math.min(vw, BOARD_GRID_MAX_CONTAINER_PX);
  const inner = Math.max(280, containerOuter - padX);
  const gapTotal = (DEFAULT_BOARDS_PER_ROW - 1) * BOARD_GRID_GAP_PX;
  const width = Math.floor((inner - gapTotal) / DEFAULT_BOARDS_PER_ROW);
  const clampedW = Math.max(200, Math.min(width, 1500));
  const height = Math.round(Math.min(600, Math.max(320, clampedW * (500 / 300))));
  return { width: clampedW, height };
}

function createMockBoards(currentUserId: string): Board[] {
  const { width: bw, height: bh } = getDefaultBoardDimensions();
  return [
    {
      id: '1',
      name: '디자인 레퍼런스',
      color: '#FF6B6B',
      height: bh,
      width: bw,
      ownerId: currentUserId,
      links: [
        { id: 'l1', title: 'Dribbble', url: 'https://dribbble.com', memo: 'UI/UX 디자인', boardId: '1', status: 'active', createdAt: new Date('2024-01-15'), createdBy: '김사용자' },
        { id: 'l2', title: 'Behance', url: 'https://behance.net', memo: '포트폴리오 참고', boardId: '1', status: 'active', createdAt: new Date('2024-01-20'), createdBy: '김사용자' },
        { id: 'l3', title: 'Awwwards', url: 'https://awwwards.com', boardId: '1', status: 'active', createdAt: new Date('2024-02-01'), createdBy: '김사용자' },
        { id: 'l4', title: 'Pinterest', url: 'https://pinterest.com', boardId: '1', status: 'active', createdAt: new Date('2024-02-05'), createdBy: '김사용자' },
      ],
    },
    {
      id: '2',
      name: '개발 자료',
      color: '#4ECDC4',
      height: bh,
      width: bw,
      teamId: 't1',
      links: [
        { id: 'l5', title: 'React 공식 문서', url: 'https://react.dev', memo: 'React 최신 문서', boardId: '2', status: 'active', createdAt: new Date('2024-02-10'), createdBy: '김사용자' },
        { id: 'l6', title: 'Tailwind CSS', url: 'https://tailwindcss.com', boardId: '2', status: 'active', createdAt: new Date('2024-02-15'), createdBy: '김사용자' },
        { id: 'l7', title: 'TypeScript', url: 'https://typescriptlang.org', boardId: '2', status: 'active', createdAt: new Date('2024-02-20'), createdBy: '김사용자' },
      ],
    },
    {
      id: '3',
      name: '마케팅 자료',
      color: '#95E1D3',
      height: bh,
      width: bw,
      ownerId: currentUserId,
      links: [
        { id: 'l8', title: 'Google Analytics', url: 'https://analytics.google.com', memo: 'GA4 대시보드', boardId: '3', status: 'active', createdAt: new Date('2024-02-25'), createdBy: '김사용자' },
        { id: 'l9', title: 'HubSpot', url: 'https://hubspot.com', boardId: '3', status: 'active', createdAt: new Date('2024-03-01'), createdBy: '김사용자' },
      ],
    },
  ];
}

// 뉴모피즘 스타일
const neumorphismStyle = {
  light: 'shadow-[8px_8px_16px_rgba(0,0,0,0.1),-8px_-8px_16px_rgba(255,255,255,0.7)] dark:shadow-[8px_8px_16px_rgba(0,0,0,0.4),-8px_-8px_16px_rgba(255,255,255,0.02)]',
  lightHover: 'hover:shadow-[12px_12px_24px_rgba(0,0,0,0.15),-12px_-12px_24px_rgba(255,255,255,0.8)] dark:hover:shadow-[12px_12px_24px_rgba(0,0,0,0.5),-12px_-12px_24px_rgba(255,255,255,0.03)]',
  inset: 'shadow-[inset_4px_4px_8px_rgba(0,0,0,0.1),inset_-4px_-4px_8px_rgba(255,255,255,0.7)] dark:shadow-[inset_4px_4px_8px_rgba(0,0,0,0.4),inset_-4px_-4px_8px_rgba(255,255,255,0.02)]',
};

/** 링크 카드 HTML5 드래그 시 뷰포트·보드 내부 스크롤 영역 가장자리에서 위·아래 자동 스크롤 */
function DragEdgeAutoScroll() {
  React.useEffect(() => {
    const EDGE_PX = 80;
    const MAX_STEP = 18;

    const onDragOver = (e: DragEvent) => {
      const y = e.clientY;
      const x = e.clientX;
      const vh = window.innerHeight;
      const root = document.scrollingElement ?? document.documentElement;

      let node: Element | null = e.target as Element | null;
      while (node && node !== document.documentElement) {
        if (node instanceof HTMLElement) {
          const st = getComputedStyle(node);
          const canY =
            (st.overflowY === 'auto' || st.overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight + 1;
          if (canY) {
            const rect = node.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
              const relTop = y - rect.top;
              const relBottom = rect.bottom - y;
              if (relTop < EDGE_PX && node.scrollTop > 0) {
                const t = (EDGE_PX - relTop) / EDGE_PX;
                node.scrollTop -= Math.max(1, Math.ceil(t * MAX_STEP));
                break;
              }
              if (relBottom < EDGE_PX && node.scrollTop < node.scrollHeight - node.clientHeight - 1) {
                const t = (EDGE_PX - relBottom) / EDGE_PX;
                node.scrollTop += Math.max(1, Math.ceil(t * MAX_STEP));
                break;
              }
            }
          }
        }
        node = node.parentElement;
      }

      if (y >= 0 && y < EDGE_PX) {
        const t = (EDGE_PX - y) / EDGE_PX;
        root.scrollBy(0, -Math.max(1, Math.ceil(t * MAX_STEP)));
      } else if (y > vh - EDGE_PX && y <= vh) {
        const t = (y - (vh - EDGE_PX)) / EDGE_PX;
        root.scrollBy(0, Math.max(1, Math.ceil(t * MAX_STEP)));
      }
    };

    document.addEventListener('dragover', onDragOver);
    return () => document.removeEventListener('dragover', onDragOver);
  }, []);

  return null;
}

/** OG/로고 미리보기 → 실패 시 기존 실드 아이콘 */
function LinkCardThumbnail({
  url,
  boardColor,
  displayType = 'preview',
}: {
  url: string;
  boardColor: string;
  displayType?: 'preview' | 'url';
}) {
  const [phase, setPhase] = useState<'loading' | 'image' | 'fallback'>(() =>
    displayType === 'url' ? 'fallback' : 'loading'
  );
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (displayType === 'url') {
      setPhase('fallback');
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    setPhase('loading');
    setImageUrl(null);
    void fetchLinkPreviewImage(url).then((src) => {
      if (cancelled) return;
      if (src) {
        setImageUrl(src);
        setPhase('image');
      } else {
        setPhase('fallback');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [url, displayType]);

  const fallbackSvg = (
    <svg width="60" height="60" viewBox="0 0 24 24" fill="white" opacity="0.2" aria-hidden>
      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
    </svg>
  );

  return (
    <div
      className="w-full h-32 relative overflow-hidden shrink-0 flex items-center justify-center"
      style={{ backgroundColor: boardColor }}
    >
      {phase === 'loading' && <Loader2 className="w-9 h-9 text-white/45 animate-spin" aria-hidden />}
      {phase === 'image' && imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setPhase('fallback')}
        />
      )}
      {phase === 'fallback' && fallbackSvg}
    </div>
  );
}

function LinkCard({ link, boardColor, onDelete, onArchive, onEdit, onScrap, searchQuery, showScrap }: {
  link: Link;
  boardColor: string;
  onDelete: () => void;
  onArchive: () => void;
  onEdit?: () => void;
  onScrap?: () => void;
  searchQuery?: string;
  showScrap?: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);

  React.useEffect(() => {
    if (showMenu) {
      const handleClickOutside = () => setShowMenu(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMenu]);

  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'LINK',
    item: { id: link.id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const handleMouseDown = (e: React.MouseEvent) => {
    setMouseDownPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!mouseDownPos) return;

    const deltaX = Math.abs(e.clientX - mouseDownPos.x);
    const deltaY = Math.abs(e.clientY - mouseDownPos.y);

    // 마우스가 5px 이상 움직였으면 드래그로 판단
    if (deltaX < 5 && deltaY < 5) {
      // 클릭으로 판단 - 링크 열기
      window.open(link.url, '_blank', 'noopener,noreferrer');
    }

    setMouseDownPos(null);
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-[#169392]/30 text-gray-900 dark:text-gray-100 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div
      ref={drag}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      className={`relative bg-white dark:bg-gray-800 rounded-2xl overflow-hidden cursor-pointer transition-all ${neumorphismStyle.light} ${neumorphismStyle.lightHover}`}
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <LinkCardThumbnail url={link.url} boardColor={boardColor} displayType={link.displayType} />

      <div className="absolute top-2 right-2 z-[1]">
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setShowMenu(!showMenu);
          }}
          className="bg-white/90 dark:bg-gray-900/90 p-2 rounded-lg backdrop-blur-sm shadow-lg hover:bg-white dark:hover:bg-gray-900 hover:scale-110 transition-transform"
        >
          <MoreVertical size={16} className="text-gray-700 dark:text-gray-300" />
        </button>

        {showMenu && (
          <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden z-[5] min-w-[140px]">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(false);
              }}
              className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
            >
              <ExternalLink size={14} />
              링크 열기
            </a>
            {onEdit && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onEdit();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
              >
                <Edit2 size={14} />
                수정
              </button>
            )}
            {showScrap && onScrap && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onScrap();
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
              >
                <Plus size={14} />
                가져오기
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onArchive();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
            >
              <Archive size={14} />
              보관
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete();
                setShowMenu(false);
              }}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 text-sm"
            >
              <Trash2 size={14} />
              삭제
            </button>
          </div>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
          {searchQuery ? highlightText(link.title, searchQuery) : link.title}
        </h3>
        {link.memo && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
            {searchQuery ? highlightText(link.memo, searchQuery) : link.memo}
          </p>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
          {searchQuery ? highlightText(link.url, searchQuery) : link.url}
        </p>
      </div>
    </div>
  );
}

function BoardComponent({ board, onAddLink, onDropLink, onDeleteLink, onArchiveLink, onEditLink, onScrapLink, onEditBoard, onDeleteBoard, height, width, onSizeChange, searchQuery, isFullscreen, onToggleFullscreen, showScrap }: {
  board: Board;
  onAddLink: () => void;
  onDropLink: (linkId: string) => void;
  onDeleteLink: (linkId: string) => void;
  onArchiveLink: (linkId: string) => void;
  onEditLink?: (linkId: string) => void;
  onScrapLink?: (linkId: string) => void;
  onEditBoard: () => void;
  onDeleteBoard: () => void;
  height: number;
  width: number;
  onSizeChange: (width: number, height: number) => void;
  searchQuery?: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  showScrap?: boolean;
}) {
  const [showOptions, setShowOptions] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'LINK',
    drop: (item: { id: string }) => {
      onDropLink(item.id);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  const activeLinks = board.links.filter(l => l.status === 'active');

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const newWidth = Math.max(200, Math.min(1500, startWidth + deltaX));
      const newHeight = Math.max(300, Math.min(1200, startHeight + deltaY));
      onSizeChange(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={drop}
      className={`bg-white dark:bg-gray-800 rounded-3xl p-6 transition-all relative ${
        isFullscreen ? 'w-full' : 'flex-shrink-0'
      } ${neumorphismStyle.light}`}
      style={{
        boxShadow: isOver ? `0 0 0 3px ${board.color}40, 12px 12px 24px rgba(0,0,0,0.15), -12px -12px 24px rgba(255,255,255,0.8)` : undefined,
        height: isFullscreen ? 'calc(100vh - 200px)' : `${height}px`,
        width: isFullscreen ? '100%' : `${width}px`,
      }}
    >
      <div className="relative z-30 flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: board.color }} />
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{board.name}</h2>
          <span className="text-sm text-gray-500 dark:text-gray-400">{activeLinks.length}</span>
        </div>

        <div className="flex items-center gap-2">
          {onToggleFullscreen && (
            <button
              onClick={onToggleFullscreen}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
              title={isFullscreen ? '전체 화면 종료' : '전체 화면'}
            >
              {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
            >
              <MoreVertical size={20} />
            </button>

            {showOptions && (
              <div className="absolute right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-xl overflow-hidden z-40 min-w-[160px]">
                <button
                  onClick={() => {
                    onEditBoard();
                    setShowOptions(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
                >
                  <Edit2 size={14} />
                  보드 이름 변경
                </button>
                <button
                  onClick={() => {
                    onEditBoard();
                    setShowOptions(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm text-gray-900 dark:text-gray-100"
                >
                  <Palette size={14} />
                  색상 변경
                </button>
                <button
                  onClick={() => {
                    onDeleteBoard();
                    setShowOptions(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 text-sm"
                >
                  <Trash2 size={14} />
                  보드 삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-0 overflow-y-auto pb-4" style={{
        maxHeight: isFullscreen ? 'calc(100vh - 380px)' : `${height - 180}px`
      }}>
        <div className="grid gap-4 mb-4" style={{
          gridTemplateColumns: isFullscreen
            ? 'repeat(auto-fill, minmax(200px, 1fr))'
            : `repeat(auto-fill, minmax(${Math.min(180, width - 60)}px, 1fr))`,
        }}>
          {activeLinks.map((link) => (
            <LinkCard
              key={link.id}
              link={link}
              boardColor={board.color}
              onDelete={() => onDeleteLink(link.id)}
              onArchive={() => onArchiveLink(link.id)}
              onEdit={onEditLink ? () => onEditLink(link.id) : undefined}
              onScrap={onScrapLink ? () => onScrapLink(link.id) : undefined}
              searchQuery={searchQuery}
              showScrap={showScrap}
            />
          ))}
        </div>

        <button
          onClick={onAddLink}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500 transition-colors flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400"
          style={{ background: `linear-gradient(135deg, ${board.color}05, ${board.color}10)` }}
        >
          <Plus size={20} />
          <span>링크 추가</span>
        </button>
      </div>

      {/* Resize Handle - 우측 하단 코너 (전체화면이 아닐 때만 표시) */}
      {!isFullscreen && (
        <div
          onMouseDown={handleMouseDown}
          className={`absolute bottom-0 right-0 w-10 h-10 cursor-nwse-resize flex items-center justify-center group ${
            isResizing ? 'bg-[#169392]/20' : ''
          } rounded-br-3xl`}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" className="text-gray-400 group-hover:text-[#169392] transition-colors">
            <path d="M24 24L24 16M24 24L16 24M24 24L14 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

function TableView({ links, boards, onDeleteLink, onArchiveLink, searchQuery }: {
  links: Link[];
  boards: Board[];
  onDeleteLink: (linkId: string) => void;
  onArchiveLink: (linkId: string) => void;
  searchQuery?: string;
}) {
  const [sortField, setSortField] = useState<'title' | 'memo' | 'board' | 'boardType' | 'author' | 'status' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [boardFilter, setBoardFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [authorFilter, setAuthorFilter] = useState<string>('all');
  const itemsPerPage = 20;

  // 검색어나 필터 변경 시 페이지를 1로 리셋
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, boardFilter, statusFilter, authorFilter]);

  const getBoardName = (boardId: string) => boards.find(b => b.id === boardId)?.name || '알 수 없음';
  const getBoardColor = (boardId: string) => boards.find(b => b.id === boardId)?.color || '#999';
  const getBoardType = (boardId: string) => {
    const board = boards.find(b => b.id === boardId);
    if (!board) return '알 수 없음';
    return board.ownerId ? '개인' : board.teamId ? '팀' : '알 수 없음';
  };

  // 모든 작성자 목록
  const allAuthors = Array.from(new Set(links.map(l => l.createdBy)));

  const highlightText = (text: string, query?: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return (
      <>
        {parts.map((part, i) =>
          part.toLowerCase() === query.toLowerCase() ? (
            <mark key={i} className="bg-[#169392]/30 text-gray-900 dark:text-gray-100 px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // 필터링
  const filteredLinks = links.filter(link => {
    if (boardFilter !== 'all' && link.boardId !== boardFilter) return false;
    if (statusFilter !== 'all' && link.status !== statusFilter) return false;
    if (authorFilter !== 'all' && link.createdBy !== authorFilter) return false;
    return true;
  });

  // 정렬
  const sortedLinks = [...filteredLinks].sort((a, b) => {
    let aValue: any, bValue: any;
    if (sortField === 'title') {
      aValue = a.title.toLowerCase();
      bValue = b.title.toLowerCase();
    } else if (sortField === 'memo') {
      aValue = (a.memo || '').toLowerCase();
      bValue = (b.memo || '').toLowerCase();
    } else if (sortField === 'board') {
      aValue = getBoardName(a.boardId).toLowerCase();
      bValue = getBoardName(b.boardId).toLowerCase();
    } else if (sortField === 'boardType') {
      aValue = getBoardType(a.boardId);
      bValue = getBoardType(b.boardId);
    } else if (sortField === 'author') {
      aValue = a.createdBy.toLowerCase();
      bValue = b.createdBy.toLowerCase();
    } else if (sortField === 'status') {
      aValue = a.status;
      bValue = b.status;
    } else {
      aValue = a.createdAt.getTime();
      bValue = b.createdAt.getTime();
    }
    return sortOrder === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
  });

  const totalPages = Math.ceil(sortedLinks.length / itemsPerPage);
  const paginatedLinks = sortedLinks.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-3xl overflow-hidden ${neumorphismStyle.light}`}>
      {/* 필터 섹션 */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">보드 필터</label>
            <select
              value={boardFilter}
              onChange={(e) => setBoardFilter(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="all">전체 보드</option>
              {boards.map(board => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">상태 필터</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'archived')}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="all">전체 상태</option>
              <option value="active">활성</option>
              <option value="archived">보관</option>
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">작성자 필터</label>
            <select
              value={authorFilter}
              onChange={(e) => setAuthorFilter(e.target.value)}
              className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100 text-sm"
            >
              <option value="all">전체 작성자</option>
              {allAuthors.map(author => (
                <option key={author} value={author}>{author}</option>
              ))}
            </select>
          </div>

          {(boardFilter !== 'all' || statusFilter !== 'all' || authorFilter !== 'all') && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setBoardFilter('all');
                  setStatusFilter('all');
                  setAuthorFilter('all');
                }}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-[#169392] dark:hover:text-[#169392] underline"
              >
                필터 초기화
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
          총 <span className="font-medium text-[#169392]">{sortedLinks.length}</span>개의 링크
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              <th className="px-6 py-4 text-left">
                <button
                  onClick={() => handleSort('title')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-[#169392]"
                >
                  제목 <ArrowUpDown size={14} />
                </button>
              </th>
              <th className="px-6 py-4 text-left">
                <button
                  onClick={() => handleSort('memo')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-[#169392]"
                >
                  메모 <ArrowUpDown size={14} />
                </button>
              </th>
              <th className="px-6 py-4 text-left">
                <button
                  onClick={() => handleSort('board')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-[#169392]"
                >
                  주제 <ArrowUpDown size={14} />
                </button>
              </th>
              <th className="px-6 py-4 text-left">
                <button
                  onClick={() => handleSort('boardType')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-[#169392]"
                >
                  보드 타입 <ArrowUpDown size={14} />
                </button>
              </th>
              <th className="px-6 py-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">링크</th>
              <th className="px-6 py-4 text-left">
                <button
                  onClick={() => handleSort('author')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-[#169392]"
                >
                  작성자 <ArrowUpDown size={14} />
                </button>
              </th>
              <th className="px-6 py-4 text-left">
                <button
                  onClick={() => handleSort('status')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-[#169392]"
                >
                  상태 <ArrowUpDown size={14} />
                </button>
              </th>
              <th className="px-6 py-4 text-left">
                <button
                  onClick={() => handleSort('createdAt')}
                  className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-[#169392]"
                >
                  저장일 <ArrowUpDown size={14} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {paginatedLinks.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Search size={48} className="text-gray-300 dark:text-gray-600" />
                    <p className="text-gray-600 dark:text-gray-400">
                      {boardFilter !== 'all' || statusFilter !== 'all' || authorFilter !== 'all'
                        ? '필터 조건에 맞는 링크가 없습니다.'
                        : '저장된 링크가 없습니다.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedLinks.map((link) => {
                const boardType = getBoardType(link.boardId);
                return (
                  <tr key={link.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/30 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {highlightText(link.title, searchQuery)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                      {link.memo ? highlightText(link.memo, searchQuery) : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getBoardColor(link.boardId) }} />
                        <span className="text-sm text-gray-900 dark:text-gray-100">{getBoardName(link.boardId)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs ${
                        boardType === '팀'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                      }`}>
                        {boardType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-[#169392] hover:underline max-w-xs truncate">
                        {highlightText(link.url, searchQuery)} <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{link.createdBy}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs ${
                        link.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                      }`}>
                        {link.status === 'active' ? '활성' : '보관'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">{link.createdAt.toLocaleDateString('ko-KR')}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 text-sm"
          >
            이전
          </button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={`px-3 py-1 rounded-lg text-sm ${currentPage === page ? 'bg-[#169392] text-white' : 'bg-gray-100 dark:bg-gray-700'}`}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded-lg bg-gray-100 dark:bg-gray-700 disabled:opacity-50 text-sm"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

const BOARD_SWATCH_COLORS = [
  '#FF6B6B', '#4ECDC4', '#95E1D3', '#FFD93D', '#6BCF7F',
  '#A8E6CF', '#FF8B94', '#C7CEEA', '#FFDAC1', '#B4A7D6',
];

function EditBoardModal({
  isOpen,
  onClose,
  board,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  board: Board | null;
  onSubmit: (data: { name: string; color: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#FF6B6B');

  useEffect(() => {
    if (isOpen && board) {
      setName(board.name);
      setColor(board.color);
    }
  }, [isOpen, board]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await Promise.resolve(onSubmit({ name: name.trim(), color }));
      onClose();
    } catch {
      /* 유지 */
    }
  };

  if (!isOpen || !board) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-md ${neumorphismStyle.light}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">보드 수정</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
              보드 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="보드 이름"
              required
              autoFocus
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">보드 색상</label>
            <div className="grid grid-cols-5 gap-3">
              {BOARD_SWATCH_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-full aspect-square rounded-xl transition-all ${
                    color === c ? 'ring-4 ring-[#169392]/50 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100">
              취소
            </button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-[#169392] hover:bg-[#0d6766] text-white">
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddBoardModal({ isOpen, onClose, onSubmit }: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; color: string }) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#FF6B6B');

  const predefinedColors = BOARD_SWATCH_COLORS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await Promise.resolve(onSubmit({ name: name.trim(), color }));
      setName('');
      setColor('#FF6B6B');
      onClose();
    } catch {
      /* 실패 시 유지 */
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-md ${neumorphismStyle.light}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">새 보드 만들기</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
              보드 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 개발 자료, 디자인 레퍼런스..."
              required
              autoFocus
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
              보드 색상
            </label>
            <div className="grid grid-cols-5 gap-3">
              {predefinedColors.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-full aspect-square rounded-xl transition-all ${
                    color === c ? 'ring-4 ring-[#169392]/50 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100">
              취소
            </button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-[#169392] hover:bg-[#0d6766] text-white">
              만들기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddLinkModal({ isOpen, onClose, onSubmit, boardName }: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; url: string; memo?: string }) => void | Promise<void>;
  boardName: string;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [memo, setMemo] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      await Promise.resolve(
        onSubmit({ title: title.trim() || new URL(url).hostname, url: url.trim(), memo: memo.trim() || undefined })
      );
      setTitle('');
      setUrl('');
      setMemo('');
      onClose();
    } catch {
      /* 원격 저장 실패 시 모달 유지 */
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-md ${neumorphismStyle.light}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">링크 추가 - {boardName}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
              URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">제목 (선택)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="링크 제목"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">메모 (선택)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모를 입력하세요"
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] resize-none text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100">
              취소
            </button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-[#169392] hover:bg-[#0d6766] text-white">
              추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditLinkModal({ isOpen, onClose, onSubmit, link, boardName }: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; url: string; memo?: string }) => void | Promise<void>;
  link: Link | null;
  boardName: string;
}) {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [memo, setMemo] = useState('');

  React.useEffect(() => {
    if (link) {
      setTitle(link.title);
      setUrl(link.url);
      setMemo(link.memo || '');
    }
  }, [link]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    try {
      await Promise.resolve(
        onSubmit({ title: title.trim() || new URL(url).hostname, url: url.trim(), memo: memo.trim() || undefined })
      );
      onClose();
    } catch {
      /* 실패 시 열린 상태 유지 */
    }
  };

  if (!isOpen || !link) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-md ${neumorphismStyle.light}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">링크 수정 - {boardName}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
              URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">제목 (선택)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="링크 제목"
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] text-gray-900 dark:text-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">메모 (선택)</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모를 입력하세요"
              rows={3}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:border-[#169392] resize-none text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100">
              취소
            </button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-[#169392] hover:bg-[#0d6766] text-white">
              수정
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScrapLinkModal({ isOpen, onClose, onSubmit, link, boards }: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (boardId: string) => void | Promise<void>;
  link: Link | null;
  boards: Board[];
}) {
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');

  React.useEffect(() => {
    if (boards.length > 0 && !selectedBoardId) {
      setSelectedBoardId(boards[0].id);
    }
  }, [boards, selectedBoardId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBoardId) return;
    try {
      await Promise.resolve(onSubmit(selectedBoardId));
      onClose();
    } catch {
      /* 실패 시 유지 */
    }
  };

  if (!isOpen || !link) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-md ${neumorphismStyle.light}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">링크 가져오기</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">{link.title}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{link.url}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-2 text-gray-700 dark:text-gray-300">
              저장할 보드 선택 <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {boards.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  onClick={() => setSelectedBoardId(board.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    selectedBoardId === board.id
                      ? 'border-[#169392] bg-[#169392]/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: board.color }} />
                    <span className="font-medium text-gray-900 dark:text-gray-100">{board.name}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                      {board.links.filter(l => l.status === 'active').length}개
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-gray-100">
              취소
            </button>
            <button type="submit" className="flex-1 px-4 py-3 rounded-xl bg-[#169392] hover:bg-[#0d6766] text-white">
              가져오기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileSidebar({
  isOpen,
  onClose,
  isDarkMode,
  onToggleDarkMode,
  displayName,
  accountEmail,
  avatarDataUrl,
  onLogout,
}: {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  /** 가입 시 이름·DB·로컬 설정 반영 */
  displayName: string;
  accountEmail: string;
  avatarDataUrl: string | null;
  onLogout: () => void | Promise<void>;
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* 투명: 기존 화면 딤/블러 없이 밖 클릭 시 닫기만 처리 */}
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="fixed right-0 top-0 h-full w-full sm:w-80 bg-white dark:bg-gray-900 shadow-2xl z-50 overflow-y-auto">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">메뉴</h2>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-gradient-to-br from-[#169392] to-[#0d6766] flex items-center justify-center text-white shrink-0">
              {avatarDataUrl ? (
                <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={24} />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-gray-100 truncate">{displayName}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{accountEmail || '—'}</p>
            </div>
          </div>
        </div>

        {/* Menu Items */}
        <div className="p-4 space-y-2">
          <a
            href="/settings"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors"
          >
            <User size={20} />
            <span>계정관리</span>
          </a>

          <a
            href="/settings#teams"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors"
          >
            <UsersIcon size={20} />
            <span>팀관리</span>
          </a>

          <a
            href="/archived"
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors"
          >
            <Archive size={20} />
            <span>보관된 링크</span>
          </a>

          <button
            onClick={onToggleDarkMode}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100 transition-colors"
          >
            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            <span>화면설정</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {isDarkMode ? '다크' : '라이트'}
              </span>
              <div className={`w-10 h-5 rounded-full transition-colors ${isDarkMode ? 'bg-[#169392]' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mt-0.5 ${isDarkMode ? 'ml-5' : 'ml-0.5'}`} />
              </div>
            </div>
          </button>

          <div className="border-t border-gray-200 dark:border-gray-700 my-2" />

          <button
            type="button"
            onClick={() => {
              onClose();
              void onLogout();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 text-red-600 transition-colors text-left"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>로그아웃</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { teamId: routeTeamId } = useParams<{ teamId?: string }>();
  const [searchParams] = useSearchParams();
  const homeScope = searchParams.get('scope') === 'personal' ? 'personal' : 'all';

  const [localTeams, setLocalTeams] = useState(getStoredTeams);
  useEffect(() => {
    return subscribeTeamsUpdated(() => setLocalTeams(getStoredTeams()));
  }, []);

  const { userId, user: authUser, loading: authLoading } = useAuth();
  const useRemote = Boolean(isSupabaseConfigured && supabase && userId);
  const [remoteProfileName, setRemoteProfileName] = useState<string | null>(null);
  const [profileEpoch, bumpProfileDisplay] = useReducer((n: number) => n + 1, 0);

  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(() => getStoredAvatarDataUrl());

  useEffect(() => {
    return subscribeProfileUpdated(() => {
      bumpProfileDisplay();
      setAvatarDataUrl(getStoredAvatarDataUrl());
    });
  }, []);

  const [dbTeams, setDbTeams] = useState<StoredTeam[] | null>(null);

  useEffect(() => {
    if (!useRemote || !supabase || !userId) {
      setDbTeams(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchMyTeams(supabase, userId);
        const adminLabel = await fetchProfileName(supabase, userId);
        if (cancelled) return;
        setRemoteProfileName(adminLabel);
        setDbTeams(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            memberCount: r.memberCount,
            role: r.role,
            adminName: adminLabel,
            inviteCode: r.inviteCode,
          }))
        );
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error('팀 목록을 불러오지 못했습니다.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useRemote, userId]);

  /** Supabase 연결 시 로컬 저장소의 가짜 팀 id(t1 등)를 쓰면 INSERT가 FK로 실패함 → DB 팀만 사용 */
  const storedTeams = useRemote ? (dbTeams ?? []) : localTeams;

  const [isDarkMode, setIsDarkMode] = useState(getInitialDarkMode);

  useEffect(() => {
    persistDarkMode(isDarkMode);
  }, [isDarkMode]);

  const currentTeam = routeTeamId ? storedTeams.find((t) => t.id === routeTeamId) : undefined;
  const pageTitle =
    routeTeamId && currentTeam ? `「${currentTeam.name}」 대시보드` : 'LinkDeck';

  const sidebarDisplayName = useMemo(
    () => resolveDashboardDisplayName(authUser, remoteProfileName),
    [authUser, remoteProfileName, profileEpoch]
  );
  const sidebarEmail = authUser?.email ?? '';

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

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (sidebarOpen) setAvatarDataUrl(getStoredAvatarDataUrl());
  }, [sidebarOpen]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState<string>('all'); // 'all' or board id
  const [showScopeDropdown, setShowScopeDropdown] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [addBoardModalOpen, setAddBoardModalOpen] = useState(false);
  const [editBoardModalOpen, setEditBoardModalOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [editLinkModalOpen, setEditLinkModalOpen] = useState(false);
  const [scrapLinkModalOpen, setScrapLinkModalOpen] = useState(false);
  const [newBoardType, setNewBoardType] = useState<'personal' | 'team'>('personal');
  const [currentBoardId, setCurrentBoardId] = useState<string | null>(null);
  const [editingLink, setEditingLink] = useState<Link | null>(null);
  const [scrapingLink, setScrapingLink] = useState<Link | null>(null);
  const [fullscreenBoardId, setFullscreenBoardId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  /** 팀 섹션에서 ‘새 보드’로 열 때 보드에 넣을 teamId (팀 전용 라우트면 URL 우선) */
  const [prefillTeamIdForNewBoard, setPrefillTeamIdForNewBoard] = useState<string | null>(null);

  /** 로컬 데모용 ID · Supabase 연결 시 세션 UUID */
  const effectiveUserId = userId ?? 'user1';

  const [boards, setBoards] = useState<Board[]>([]);
  const [remoteBoardsLoading, setRemoteBoardsLoading] = useState(false);

  const reloadBoardsFromRemote = useCallback(async () => {
    if (!useRemote || !supabase || !userId) return;
    const dims = getDefaultBoardDimensions();
    const data = await fetchBoardsForUser(supabase, userId, dims);
    setBoards(data as Board[]);
  }, [useRemote, userId]);

  useEffect(() => {
    if (useRemote) return;
    if (!isSupabaseConfigured) {
      setBoards(createMockBoards('user1'));
    } else {
      setBoards([]);
    }
  }, [useRemote, isSupabaseConfigured]);

  useEffect(() => {
    if (!useRemote || !supabase || !userId || !authUser) return;
    let cancelled = false;
    setRemoteBoardsLoading(true);
    const dims = getDefaultBoardDimensions();

    void (async () => {
      try {
        await syncPublicUserFromAuth(supabase, authUser);
        const nm = await fetchProfileName(supabase, userId);
        if (!cancelled) setRemoteProfileName(nm);
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          toast.error(
            '프로필 동기화에 실패했습니다. Supabase SQL Editor에서 SQL_EDITOR_COPY_PASTE.sql의 패치 블록 전체(sync_auth_user_profile 함수 + 정책)를 실행한 뒤 새로고침 하세요.',
            { duration: 9000 }
          );
        }
      }
      try {
        const data = await fetchBoardsForUser(supabase, userId, dims);
        if (!cancelled) setBoards(data as Board[]);
      } catch (e) {
        console.error(e);
        if (!cancelled) toast.error('보드 데이터를 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setRemoteBoardsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useRemote, userId, authUser]);

  const handleAddLink = (boardId: string) => {
    setCurrentBoardId(boardId);
    setModalOpen(true);
  };

  const handleSubmitLink = async (data: { title: string; url: string; memo?: string }) => {
    if (!currentBoardId) return;
    if (useRemote && supabase) {
      if (!userId) return;
      try {
        const board = boards.find((b) => b.id === currentBoardId);
        const activeLinks = board?.links.filter((l) => l.status === 'active') ?? [];
        const sortOrder = activeLinks.length;
        await insertLinkRow(supabase, {
          userId,
          boardId: currentBoardId,
          title: data.title,
          url: data.url,
          memo: data.memo,
          sortOrder,
        });
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error('링크를 저장하지 못했습니다.');
        throw e;
      }
      return;
    }
    const newLink: Link = {
      id: `l${Date.now()}`,
      boardId: currentBoardId,
      status: 'active',
      createdAt: new Date(),
      createdBy: sidebarDisplayName,
      ...data,
    };
    setBoards((prev) =>
      prev.map((board) =>
        board.id === currentBoardId ? { ...board, links: [...board.links, newLink] } : board
      )
    );
  };

  const handleDeleteLink = async (boardId: string, linkId: string) => {
    if (useRemote && supabase) {
      try {
        await deleteLinkRow(supabase, linkId);
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error('링크를 삭제하지 못했습니다.');
      }
      return;
    }
    setBoards((prev) =>
      prev.map((board) =>
        board.id === boardId ? { ...board, links: board.links.filter((link) => link.id !== linkId) } : board
      )
    );
  };

  const handleArchiveLink = async (linkId: string) => {
    if (useRemote && supabase) {
      try {
        await updateLinkRow(supabase, linkId, { status: 'archived' });
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error('보관 처리하지 못했습니다.');
      }
      return;
    }
    setBoards((prev) =>
      prev.map((board) => ({
        ...board,
        links: board.links.map((link) =>
          link.id === linkId ? { ...link, status: 'archived' as const } : link
        ),
      }))
    );
  };

  const handleRestoreLink = (linkId: string) => {
    if (useRemote && supabase && userId) {
      void (async () => {
        try {
          await updateLinkRow(supabase, linkId, { status: 'active' });
          await reloadBoardsFromRemote();
        } catch (e) {
          console.error(e);
          toast.error('복구하지 못했습니다.');
        }
      })();
      return;
    }
    setBoards((prev) =>
      prev.map((board) => ({
        ...board,
        links: board.links.map((link) =>
          link.id === linkId ? { ...link, status: 'active' as const } : link
        ),
      }))
    );
  };

  const handleDropLink = async (targetBoardId: string, linkId: string) => {
    if (useRemote && supabase) {
      try {
        const target = boards.find((b) => b.id === targetBoardId);
        const sortOrder = target?.links.filter((l) => l.status === 'active').length ?? 0;
        await moveLinkToBoard(supabase, linkId, targetBoardId, sortOrder);
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error('링크 이동에 실패했습니다.');
      }
      return;
    }
    setBoards((prev) => {
      const sourceBoardIndex = prev.findIndex((board) => board.links.some((link) => link.id === linkId));
      if (sourceBoardIndex === -1) return prev;
      const sourceBoard = prev[sourceBoardIndex];
      const link = sourceBoard.links.find((l) => l.id === linkId);
      if (!link || sourceBoard.id === targetBoardId) return prev;
      const updatedLink = { ...link, boardId: targetBoardId };
      return prev.map((board) => {
        if (board.id === sourceBoard.id) {
          return { ...board, links: board.links.filter((l) => l.id !== linkId) };
        }
        if (board.id === targetBoardId) {
          return { ...board, links: [...board.links, updatedLink] };
        }
        return board;
      });
    });
  };

  const handleBoardSizeChange = async (boardId: string, width: number, height: number) => {
    if (useRemote && supabase) {
      try {
        await updateBoardLayout(supabase, boardId, width, height);
      } catch (e) {
        console.error(e);
        toast.error('보드 크기를 저장하지 못했습니다.');
        return;
      }
    }
    setBoards((prev) =>
      prev.map((board) =>
        board.id === boardId ? { ...board, width, height } : board
      )
    );
  };

  const handleResetBoardSizes = async () => {
    const { width, height } = getDefaultBoardDimensions();
    if (useRemote && supabase) {
      try {
        await Promise.all(boards.map((b) => updateBoardLayout(supabase!, b.id, width, height)));
      } catch (e) {
        console.error(e);
        toast.error('보드 크기 초기화에 실패했습니다.');
        return;
      }
      await reloadBoardsFromRemote();
      return;
    }
    setBoards((prev) => prev.map((board) => ({ ...board, width, height })));
  };

  const handleAddBoard = async (data: { name: string; color: string }) => {
    const dims = getDefaultBoardDimensions();
    const teamIdForBoard =
      newBoardType === 'team'
        ? prefillTeamIdForNewBoard ?? routeTeamId ?? storedTeams[0]?.id ?? null
        : null;

    if (useRemote && supabase && userId) {
      if (newBoardType === 'team' && !teamIdForBoard) {
        toast.error('팀을 선택할 수 없습니다. 팀을 만든 뒤 다시 시도하세요.');
        setPrefillTeamIdForNewBoard(null);
        throw new Error('no_team');
      }
      try {
        if (authUser) {
          await syncPublicUserFromAuth(supabase, authUser);
        }
        await insertBoard(supabase, {
          userId,
          name: data.name,
          color: data.color,
          layout: dims,
          ...(newBoardType === 'team' && teamIdForBoard
            ? { teamId: teamIdForBoard }
            : { ownerId: userId }),
        });
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error(`보드를 만들지 못했습니다: ${formatSupabaseError(e)}`);
        throw e;
      }
      setPrefillTeamIdForNewBoard(null);
      return;
    }

    const newBoard: Board = {
      id: `b${Date.now()}`,
      name: data.name,
      color: data.color,
      height: dims.height,
      width: dims.width,
      links: [],
      ...(newBoardType === 'team'
        ? {
            teamId: teamIdForBoard ?? 't1',
          }
        : { ownerId: effectiveUserId }),
    };
    setBoards((prev) => [...prev, newBoard]);
    setPrefillTeamIdForNewBoard(null);
  };

  const closeEditBoardModal = () => {
    setEditBoardModalOpen(false);
    setEditingBoard(null);
  };

  const openEditBoardModal = (boardId: string) => {
    const b = boards.find((x) => x.id === boardId);
    if (!b) return;
    setEditingBoard(b);
    setEditBoardModalOpen(true);
  };

  const handleSubmitEditBoard = async (data: { name: string; color: string }) => {
    if (!editingBoard) return;
    const targetId = editingBoard.id;
    if (useRemote && supabase) {
      try {
        await updateBoardMeta(supabase, targetId, {
          name: data.name,
          color: data.color,
        });
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error(`보드를 수정하지 못했습니다: ${formatSupabaseError(e)}`);
        throw e;
      }
      return;
    }
    setBoards((prev) =>
      prev.map((b) =>
        b.id === targetId ? { ...b, name: data.name.trim(), color: data.color } : b
      )
    );
  };

  const handleDeleteBoard = async (boardId: string) => {
    if (!window.confirm('이 보드와 포함된 모든 링크가 삭제됩니다. 계속할까요?')) return;
    if (useRemote && supabase) {
      try {
        await deleteBoardById(supabase, boardId);
        if (fullscreenBoardId === boardId) setFullscreenBoardId(null);
        if (editingBoard?.id === boardId) closeEditBoardModal();
        await reloadBoardsFromRemote();
        toast.success('보드를 삭제했습니다.');
      } catch (e) {
        console.error(e);
        toast.error(`보드를 삭제하지 못했습니다: ${formatSupabaseError(e)}`);
      }
      return;
    }
    setBoards((prev) => prev.filter((b) => b.id !== boardId));
    if (fullscreenBoardId === boardId) setFullscreenBoardId(null);
    if (editingBoard?.id === boardId) closeEditBoardModal();
    toast.success('보드를 삭제했습니다.');
  };

  const handleEditLink = (linkId: string) => {
    const link = allLinks.find(l => l.id === linkId);
    if (link) {
      setEditingLink(link);
      setEditLinkModalOpen(true);
    }
  };

  const handleSubmitEditLink = async (data: { title: string; url: string; memo?: string }) => {
    if (!editingLink) return;
    if (useRemote && supabase) {
      try {
        await updateLinkRow(supabase, editingLink.id, {
          title: data.title,
          url: data.url,
          memo: data.memo ?? null,
        });
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error('링크를 수정하지 못했습니다.');
        throw e;
      }
      return;
    }
    setBoards((prev) =>
      prev.map((board) => ({
        ...board,
        links: board.links.map((link) =>
          link.id === editingLink.id ? { ...link, ...data } : link
        ),
      }))
    );
  };

  const handleScrapLink = (linkId: string) => {
    const link = allLinks.find(l => l.id === linkId);
    if (link) {
      setScrapingLink(link);
      setScrapLinkModalOpen(true);
    }
  };

  const handleSubmitScrapLink = async (targetBoardId: string) => {
    if (!scrapingLink || !userId) return;
    if (useRemote && supabase) {
      try {
        const target = boards.find((b) => b.id === targetBoardId);
        const sortOrder = target?.links.filter((l) => l.status === 'active').length ?? 0;
        await insertLinkRow(supabase, {
          userId,
          boardId: targetBoardId,
          title: scrapingLink.title,
          url: scrapingLink.url,
          memo: scrapingLink.memo,
          sortOrder,
        });
        await reloadBoardsFromRemote();
      } catch (e) {
        console.error(e);
        toast.error('링크를 가져오지 못했습니다.');
        throw e;
      }
      return;
    }
    const newLink: Link = {
      ...scrapingLink,
      id: `l${Date.now()}`,
      boardId: targetBoardId,
      createdAt: new Date(),
      createdBy: sidebarDisplayName,
    };
    setBoards((prev) =>
      prev.map((board) =>
        board.id === targetBoardId ? { ...board, links: [...board.links, newLink] } : board
      )
    );
  };

  // 개인 보드와 팀 보드 분리
  const personalBoards = boards.filter((board) => board.ownerId === effectiveUserId);
  const teamBoards = boards.filter((board) => board.teamId);
  const knownTeamIds = new Set(storedTeams.map((t) => t.id));
  const orphanTeamBoards = teamBoards.filter((b) => b.teamId && !knownTeamIds.has(b.teamId));

  const scopedPersonalBoards = routeTeamId ? [] : personalBoards;
  const scopedTeamBoards = routeTeamId
    ? teamBoards.filter((b) => b.teamId === routeTeamId)
    : homeScope === 'personal'
      ? []
      : teamBoards;

  const allLinks = boards.flatMap((board) => board.links);
  const archivedLinks = allLinks.filter((link) => link.status === 'archived');
  const activeLinks = allLinks.filter((link) => link.status === 'active');

  const filterBoardsBySearch = (boardList: Board[]) => {
    return boardList.map((board) => {
      // 검색어가 없으면 모든 active 링크 표시
      if (!searchQuery) {
        return {
          ...board,
          links: board.links.filter((link) => link.status === 'active'),
        };
      }

      // 검색 범위가 특정 보드로 지정되었고, 현재 보드가 아닌 경우 빈 결과 반환
      if (searchScope !== 'all' && board.id !== searchScope) {
        return { ...board, links: [] };
      }

      return {
        ...board,
        links: board.links.filter(
          (link) =>
            link.status === 'active' &&
            (link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              link.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
              link.memo?.toLowerCase().includes(searchQuery.toLowerCase()))
        ),
      };
    });
  };

  const filteredPersonalBoards = filterBoardsBySearch(scopedPersonalBoards);
  const filteredTeamBoards = filterBoardsBySearch(scopedTeamBoards);

  const filteredLinks = allLinks.filter((link) => {
    const linkBoard = boards.find((b) => b.id === link.boardId);
    if (!linkBoard) return false;

    if (routeTeamId) {
      if (linkBoard.teamId !== routeTeamId) return false;
    } else if (homeScope === 'personal') {
      if (!linkBoard.ownerId) return false;
    }

    // 검색어가 없으면 대시보드 필터만 적용
    if (!searchQuery) {
      return true;
    }

    // 검색 범위 체크
    if (searchScope !== 'all' && link.boardId !== searchScope) {
      return false;
    }

    // 검색어 체크
    return (
      link.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      link.memo?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const scrapTargetBoards = routeTeamId
    ? teamBoards.filter((b) => b.teamId === routeTeamId)
    : personalBoards;

  if (routeTeamId && !currentTeam) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <DragEdgeAutoScroll />
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors">
          {/* Header */}
          <header className="sticky top-0 z-30 isolate bg-white/95 dark:bg-gray-900/95 backdrop-blur-lg border-b border-gray-200 dark:border-gray-700 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#169392] to-[#0d6766] flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                      <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z" />
                    </svg>
                  </div>
                  <div className="hidden sm:flex flex-col gap-0.5 min-w-0">
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate">
                      {pageTitle}
                    </h1>
                    <p className="text-[11px] sm:text-xs text-neutral-500/85 dark:text-neutral-400/75 leading-snug tracking-wide">
                      링크 보드 서비스
                    </p>
                  </div>
                </div>

                <div className="flex-1 max-w-2xl flex gap-2">
                  {/* 검색 범위 선택 드롭다운 */}
                  <div className="relative">
                    <button
                      onClick={() => setShowScopeDropdown(!showScopeDropdown)}
                      className={`flex items-center gap-2 px-4 py-3 bg-white dark:bg-gray-800 rounded-2xl ${neumorphismStyle.inset} hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors whitespace-nowrap`}
                    >
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {searchScope === 'all' ? '전체' : boards.find(b => b.id === searchScope)?.name || '전체'}
                      </span>
                      <ChevronDown size={16} className="text-gray-500 dark:text-gray-400" />
                    </button>

                    {showScopeDropdown && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setShowScopeDropdown(false)}
                        />
                        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden z-20 min-w-[180px]">
                          <button
                            onClick={() => {
                              setSearchScope('all');
                              setShowScopeDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm ${
                              searchScope === 'all' ? 'bg-[#169392]/10 text-[#169392] font-medium' : 'text-gray-900 dark:text-gray-100'
                            }`}
                          >
                            전체 보드
                          </button>
                          {boards.map((board) => (
                            <button
                              key={board.id}
                              onClick={() => {
                                setSearchScope(board.id);
                                setShowScopeDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm flex items-center gap-2 ${
                                searchScope === board.id ? 'bg-[#169392]/10 text-[#169392] font-medium' : 'text-gray-900 dark:text-gray-100'
                              }`}
                            >
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: board.color }}
                              />
                              {board.name}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* 검색창 */}
                  <div className={`flex-1 flex items-center gap-3 px-4 sm:px-6 py-3 bg-white dark:bg-gray-800 rounded-2xl ${neumorphismStyle.inset} ${searchQuery ? 'ring-2 ring-[#169392]/50' : ''}`}>
                    <Search size={20} className={searchQuery ? 'text-[#169392]' : 'text-gray-400 dark:text-gray-500'} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="제목, 메모, URL로 링크 검색..."
                      className="flex-1 bg-transparent outline-none text-gray-900 dark:text-gray-100 text-sm sm:text-base placeholder:text-gray-400"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setSearchScope('all');
                        }}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                      >
                        <XCircle size={18} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
                    className="p-3 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                    title={viewMode === 'grid' ? '테이블 뷰' : '그리드 뷰'}
                  >
                    {viewMode === 'grid' ? <TableIcon size={20} /> : <LayoutGrid size={20} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    title="메뉴"
                    aria-label="메뉴 열기"
                    className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-gradient-to-br from-[#169392] to-[#0d6766] flex items-center justify-center text-white ring-2 ring-white/30 dark:ring-gray-700"
                  >
                    {avatarDataUrl ? (
                      <img src={avatarDataUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User size={20} />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </header>

          {/* Main */}
          <main className="relative z-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Dashboard Type Selector */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="inline-flex flex-wrap gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
                <Link
                  to="/dashboard"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !routeTeamId && homeScope === 'all'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  전체
                </Link>
                <Link
                  to="/dashboard?scope=personal"
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !routeTeamId && homeScope === 'personal'
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  개인 ({personalBoards.length})
                </Link>
                {storedTeams.map((team) => {
                  const n = teamBoards.filter((b) => b.teamId === team.id).length;
                  return (
                    <Link
                      key={team.id}
                      to={`/dashboard/team/${team.id}`}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        routeTeamId === team.id
                          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      {team.name} ({n})
                    </Link>
                  );
                })}
              </div>
              {viewMode === 'grid' && !fullscreenBoardId && (
                <button
                  type="button"
                  onClick={handleResetBoardSizes}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors shrink-0 self-start sm:self-auto"
                  title="데스크톱 기준 한 줄에 3개 보드가 들어가는 크기로 맞춥니다"
                >
                  <RotateCcw size={18} />
                  보드 크기 초기화
                </button>
              )}
            </div>

            {remoteBoardsLoading && (
              <p className="mb-4 text-sm text-[#169392] dark:text-[#169392]/90">Supabase에서 데이터를 불러오는 중…</p>
            )}
            {isSupabaseConfigured && !authLoading && !userId && (
              <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">
                로그인하면 저장된 보드가 표시됩니다.{' '}
                <Link to="/login" className="underline font-medium">
                  로그인
                </Link>
              </p>
            )}

            {/* Search Results Info */}
            {searchQuery && (
              <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 px-4 py-2 bg-[#169392]/10 dark:bg-[#169392]/20 rounded-xl">
                    <Search size={18} className="text-[#169392]" />
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      "<span className="text-[#169392]">{searchQuery}</span>" 검색 결과
                    </span>
                  </div>
                  {searchScope !== 'all' && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: boards.find(b => b.id === searchScope)?.color }}
                      />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {boards.find(b => b.id === searchScope)?.name}
                      </span>
                    </div>
                  )}
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {viewMode === 'grid'
                      ? `${[...filteredPersonalBoards, ...filteredTeamBoards].reduce((sum, board) => sum + board.links.length, 0)}개의 링크 발견`
                      : `${filteredLinks.length}개의 링크 발견`
                    }
                  </span>
                </div>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSearchScope('all');
                  }}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-[#169392] dark:hover:text-[#169392] underline"
                >
                  검색 취소
                </button>
              </div>
            )}

            {/* Content */}
            {fullscreenBoardId ? (
              /* Fullscreen Mode */
              (() => {
                const fullscreenBoard = boards.find(b => b.id === fullscreenBoardId);
                if (!fullscreenBoard) return null;
                return (
                  <BoardComponent
                    key={fullscreenBoard.id}
                    board={fullscreenBoard}
                    onAddLink={() => handleAddLink(fullscreenBoard.id)}
                    onDropLink={(linkId) => handleDropLink(fullscreenBoard.id, linkId)}
                    onDeleteLink={(linkId) => handleDeleteLink(fullscreenBoard.id, linkId)}
                    onArchiveLink={handleArchiveLink}
                    onEditLink={handleEditLink}
                    onScrapLink={handleScrapLink}
                    onEditBoard={() => openEditBoardModal(fullscreenBoard.id)}
                    onDeleteBoard={() => void handleDeleteBoard(fullscreenBoard.id)}
                    height={fullscreenBoard.height}
                    width={fullscreenBoard.width}
                    onSizeChange={(width, height) => handleBoardSizeChange(fullscreenBoard.id, width, height)}
                    searchQuery={searchQuery}
                    isFullscreen={true}
                    onToggleFullscreen={() => setFullscreenBoardId(null)}
                    showScrap={false}
                  />
                );
              })()
            ) : viewMode === 'grid' ? (
              <div>
                {searchQuery && [...filteredPersonalBoards, ...filteredTeamBoards].every(board => board.links.length === 0) ? (
                  <div className={`bg-white dark:bg-gray-800 rounded-3xl p-12 text-center ${neumorphismStyle.light}`}>
                    <div className="max-w-md mx-auto">
                      <Search size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        검색 결과가 없습니다
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6">
                        {searchScope === 'all' ? (
                          <>
                            "<span className="text-[#169392] font-medium">{searchQuery}</span>"와 일치하는 링크를 찾을 수 없습니다.
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{boards.find(b => b.id === searchScope)?.name}</span> 보드에서 "<span className="text-[#169392] font-medium">{searchQuery}</span>"와 일치하는 링크를 찾을 수 없습니다.
                          </>
                        )}
                      </p>
                      <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400 text-left">
                        <p>• 다른 검색어를 시도해보세요</p>
                        <p>• 철자가 정확한지 확인해보세요</p>
                        {searchScope !== 'all' && <p>• 검색 범위를 "전체"로 확장해보세요</p>}
                        <p>• 더 짧은 키워드를 사용해보세요</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* 개인 대시보드 (팀 전용 라우트에서는 숨김) */}
                    {!routeTeamId && (homeScope === 'all' || homeScope === 'personal') && (
                      <div>
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          <User size={24} className="text-[#169392]" />
                          개인 보드
                        </h2>
                        <div className="flex flex-wrap gap-6">
                          {filteredPersonalBoards.map((board) =>
                            board.links.length > 0 || !searchQuery ? (
                              <BoardComponent
                                key={board.id}
                                board={board}
                                onAddLink={() => handleAddLink(board.id)}
                                onDropLink={(linkId) => handleDropLink(board.id, linkId)}
                                onDeleteLink={(linkId) => handleDeleteLink(board.id, linkId)}
                                onArchiveLink={handleArchiveLink}
                                onEditLink={handleEditLink}
                                onScrapLink={handleScrapLink}
                                onEditBoard={() => openEditBoardModal(board.id)}
                                onDeleteBoard={() => void handleDeleteBoard(board.id)}
                                height={board.height}
                                width={board.width}
                                onSizeChange={(width, height) => handleBoardSizeChange(board.id, width, height)}
                                searchQuery={searchQuery}
                                isFullscreen={false}
                                onToggleFullscreen={() => setFullscreenBoardId(board.id)}
                                showScrap={false}
                              />
                            ) : null
                          )}

                          {!searchQuery && (
                            <button
                              onClick={() => {
                                setNewBoardType('personal');
                                setAddBoardModalOpen(true);
                              }}
                              className="flex-shrink-0 w-64 h-80 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#169392] transition-colors flex flex-col items-center justify-center gap-3 text-gray-600 dark:text-gray-400 hover:text-[#169392]"
                            >
                              <Plus size={24} />
                              <span className="text-lg">새 보드 만들기</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 팀 대시보드: 단일 팀 (URL) */}
                    {routeTeamId && currentTeam && (
                      <div>
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          <UsersIcon size={24} className="text-[#169392]" />
                          {currentTeam.name}
                        </h2>
                        <div className="flex flex-wrap gap-6">
                          {filteredTeamBoards.map((board) =>
                            board.links.length > 0 || !searchQuery ? (
                              <BoardComponent
                                key={board.id}
                                board={board}
                                onAddLink={() => handleAddLink(board.id)}
                                onDropLink={(linkId) => handleDropLink(board.id, linkId)}
                                onDeleteLink={(linkId) => handleDeleteLink(board.id, linkId)}
                                onArchiveLink={handleArchiveLink}
                                onEditLink={handleEditLink}
                                onScrapLink={handleScrapLink}
                                onEditBoard={() => openEditBoardModal(board.id)}
                                onDeleteBoard={() => void handleDeleteBoard(board.id)}
                                height={board.height}
                                width={board.width}
                                onSizeChange={(width, height) => handleBoardSizeChange(board.id, width, height)}
                                searchQuery={searchQuery}
                                isFullscreen={false}
                                onToggleFullscreen={() => setFullscreenBoardId(board.id)}
                                showScrap={false}
                              />
                            ) : null
                          )}

                          {!searchQuery && (
                            <button
                              onClick={() => {
                                setNewBoardType('team');
                                setPrefillTeamIdForNewBoard(null);
                                setAddBoardModalOpen(true);
                              }}
                              className="flex-shrink-0 w-64 h-80 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#169392] transition-colors flex flex-col items-center justify-center gap-3 text-gray-600 dark:text-gray-400 hover:text-[#169392]"
                            >
                              <Plus size={24} />
                              <span className="text-lg">새 보드 만들기</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 홈 · 전체: 팀별 섹션 */}
                    {!routeTeamId && homeScope === 'all' && (
                      <>
                        {storedTeams.map((team) => {
                          const boardsForTeam = filterBoardsBySearch(teamBoards.filter((b) => b.teamId === team.id));
                          return (
                            <div key={team.id}>
                              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                                <UsersIcon size={24} className="text-[#169392]" />
                                {team.name}
                              </h2>
                              <div className="flex flex-wrap gap-6">
                                {boardsForTeam.map((board) =>
                                  board.links.length > 0 || !searchQuery ? (
                                    <BoardComponent
                                      key={board.id}
                                      board={board}
                                      onAddLink={() => handleAddLink(board.id)}
                                      onDropLink={(linkId) => handleDropLink(board.id, linkId)}
                                      onDeleteLink={(linkId) => handleDeleteLink(board.id, linkId)}
                                      onArchiveLink={handleArchiveLink}
                                      onEditLink={handleEditLink}
                                      onScrapLink={handleScrapLink}
                                      onEditBoard={() => openEditBoardModal(board.id)}
                                      onDeleteBoard={() => void handleDeleteBoard(board.id)}
                                      height={board.height}
                                      width={board.width}
                                      onSizeChange={(width, height) => handleBoardSizeChange(board.id, width, height)}
                                      searchQuery={searchQuery}
                                      isFullscreen={false}
                                      onToggleFullscreen={() => setFullscreenBoardId(board.id)}
                                      showScrap={false}
                                    />
                                  ) : null
                                )}

                                {!searchQuery && (
                                  <button
                                    onClick={() => {
                                      setNewBoardType('team');
                                      setPrefillTeamIdForNewBoard(team.id);
                                      setAddBoardModalOpen(true);
                                    }}
                                    className="flex-shrink-0 w-64 h-80 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#169392] transition-colors flex flex-col items-center justify-center gap-3 text-gray-600 dark:text-gray-400 hover:text-[#169392]"
                                  >
                                    <Plus size={24} />
                                    <span className="text-lg">새 보드 만들기</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {orphanTeamBoards.length > 0 && (
                          <div>
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                              <UsersIcon size={24} className="text-[#169392]" />
                              기타 팀 보드
                            </h2>
                            <div className="flex flex-wrap gap-6">
                              {filterBoardsBySearch(orphanTeamBoards).map((board) =>
                                board.links.length > 0 || !searchQuery ? (
                                  <BoardComponent
                                    key={board.id}
                                    board={board}
                                    onAddLink={() => handleAddLink(board.id)}
                                    onDropLink={(linkId) => handleDropLink(board.id, linkId)}
                                    onDeleteLink={(linkId) => handleDeleteLink(board.id, linkId)}
                                    onArchiveLink={handleArchiveLink}
                                    onEditLink={handleEditLink}
                                    onScrapLink={handleScrapLink}
                                    onEditBoard={() => openEditBoardModal(board.id)}
                                    onDeleteBoard={() => void handleDeleteBoard(board.id)}
                                    height={board.height}
                                    width={board.width}
                                    onSizeChange={(width, height) => handleBoardSizeChange(board.id, width, height)}
                                    searchQuery={searchQuery}
                                    isFullscreen={false}
                                    onToggleFullscreen={() => setFullscreenBoardId(board.id)}
                                    showScrap={false}
                                  />
                                ) : null
                              )}
                              {!searchQuery && (
                                <button
                                  onClick={() => {
                                    setNewBoardType('team');
                                    setPrefillTeamIdForNewBoard(orphanTeamBoards[0]?.teamId ?? storedTeams[0]?.id ?? 't1');
                                    setAddBoardModalOpen(true);
                                  }}
                                  className="flex-shrink-0 w-64 h-80 rounded-3xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#169392] transition-colors flex flex-col items-center justify-center gap-3 text-gray-600 dark:text-gray-400 hover:text-[#169392]"
                                >
                                  <Plus size={24} />
                                  <span className="text-lg">새 보드 만들기</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <>
                {searchQuery && filteredLinks.length === 0 ? (
                  <div className={`bg-white dark:bg-gray-800 rounded-3xl p-12 text-center ${neumorphismStyle.light}`}>
                    <div className="max-w-md mx-auto">
                      <Search size={48} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                        검색 결과가 없습니다
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400 mb-6">
                        {searchScope === 'all' ? (
                          <>
                            "<span className="text-[#169392] font-medium">{searchQuery}</span>"와 일치하는 링크를 찾을 수 없습니다.
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{boards.find(b => b.id === searchScope)?.name}</span> 보드에서 "<span className="text-[#169392] font-medium">{searchQuery}</span>"와 일치하는 링크를 찾을 수 없습니다.
                          </>
                        )}
                      </p>
                      <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400 text-left">
                        <p>• 다른 검색어를 시도해보세요</p>
                        <p>• 철자가 정확한지 확인해보세요</p>
                        {searchScope !== 'all' && <p>• 검색 범위를 "전체"로 확장해보세요</p>}
                        <p>• 더 짧은 키워드를 사용해보세요</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <TableView
                    links={filteredLinks}
                    boards={boards}
                    onDeleteLink={(linkId) => {
                      const board = boards.find((b) => b.links.some((l) => l.id === linkId));
                      if (board) handleDeleteLink(board.id, linkId);
                    }}
                    onArchiveLink={handleArchiveLink}
                    searchQuery={searchQuery}
                  />
                )}
              </>
            )}
          </main>

          {/* Modals */}
          <ProfileSidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
            displayName={sidebarDisplayName}
            accountEmail={sidebarEmail}
            avatarDataUrl={avatarDataUrl}
            onLogout={handleLogout}
          />

          <AddLinkModal
            isOpen={modalOpen}
            onClose={() => {
              setModalOpen(false);
              setCurrentBoardId(null);
            }}
            onSubmit={handleSubmitLink}
            boardName={boards.find((b) => b.id === currentBoardId)?.name || ''}
          />

          <AddBoardModal
            isOpen={addBoardModalOpen}
            onClose={() => {
              setAddBoardModalOpen(false);
              setPrefillTeamIdForNewBoard(null);
            }}
            onSubmit={handleAddBoard}
          />

          <EditBoardModal
            isOpen={editBoardModalOpen}
            onClose={closeEditBoardModal}
            board={editingBoard}
            onSubmit={handleSubmitEditBoard}
          />

          <EditLinkModal
            isOpen={editLinkModalOpen}
            onClose={() => {
              setEditLinkModalOpen(false);
              setEditingLink(null);
            }}
            onSubmit={handleSubmitEditLink}
            link={editingLink}
            boardName={boards.find((b) => b.id === editingLink?.boardId)?.name || ''}
          />

          <ScrapLinkModal
            isOpen={scrapLinkModalOpen}
            onClose={() => {
              setScrapLinkModalOpen(false);
              setScrapingLink(null);
            }}
            onSubmit={handleSubmitScrapLink}
            link={scrapingLink}
            boards={scrapTargetBoards}
          />
        </div>
    </DndProvider>
  );
}
