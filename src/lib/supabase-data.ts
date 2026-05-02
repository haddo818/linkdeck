import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database, Json } from './database.types';

const BOARD_LINKS_SELECT = `
      id,
      name,
      color,
      layout_config,
      owner_id,
      team_id,
      links (
        id,
        board_id,
        created_by,
        url,
        title,
        memo,
        display_type,
        status,
        sort_order,
        created_at
      )
    `;

/** Supabase/PostgREST 오류를 사용자에게 보여줄 짧은 문자열로 */
export function formatSupabaseError(e: unknown): string {
  if (e == null) return '알 수 없는 오류';
  if (typeof e === 'object' && 'message' in e) {
    const o = e as { message?: string; details?: string; hint?: string; code?: string };
    const parts = [o.message, o.details, o.hint].filter((x) => x && String(x).trim());
    return parts.length ? parts.join(' · ') : JSON.stringify(e);
  }
  return String(e);
}

/**
 * public.users 와 로그인 세션 동기화.
 * 서버 RPC `sync_auth_user_profile`가 있으면 SECURITY DEFINER로 동기화(RLS INSERT 없이 신규 행 생성 가능).
 * 없으면 클라이언트 UPDATE/INSERT(패치 정책 users_insert_own 필요할 수 있음).
 */
export async function syncPublicUserFromAuth(
  client: SupabaseClient<Database>,
  user: User
): Promise<void> {
  const { error: rpcErr } = await client.rpc('sync_auth_user_profile');

  if (!rpcErr) return;

  const msg = rpcErr.message ?? '';
  const rpcMissing =
    rpcErr.code === 'PGRST202' ||
    msg.includes('Could not find the function') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache');

  if (!rpcMissing) throw rpcErr;

  await syncPublicUserFromAuthLegacy(client, user);
}

async function syncPublicUserFromAuthLegacy(
  client: SupabaseClient<Database>,
  user: User
): Promise<void> {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    user.email?.split('@')[0]?.trim() ||
    'User';
  const avatar =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    (typeof meta.picture === 'string' && meta.picture.trim()) ||
    null;

  const appMeta = user.app_metadata ?? {};
  const provRaw =
    (typeof appMeta.provider === 'string' && appMeta.provider) ||
    (Array.isArray(appMeta.providers) && typeof appMeta.providers[0] === 'string' && appMeta.providers[0]) ||
    'email';
  const provLower = provRaw.toLowerCase();
  const authProv = ['email', 'google', 'github', 'apple', 'phone'].includes(provLower) ? provLower : 'email';

  const patch = {
    name,
    email: user.email ?? '',
    profile_image_url: avatar,
    auth_provider: authProv,
  };

  const { data: existing, error: selErr } = await client
    .from('users')
    .select('id')
    .eq('id', user.id)
    .maybeSingle();

  if (selErr) throw selErr;

  if (existing) {
    const { error } = await client.from('users').update(patch).eq('id', user.id);
    if (error) throw error;
    return;
  }

  const { error } = await client.from('users').insert({
    id: user.id,
    ...patch,
    theme_preference: 'light',
  });

  if (error) throw error;
}

/** Dashboard.tsx 의 Board / Link 와 호환 */
export interface UILink {
  id: string;
  title: string;
  url: string;
  memo?: string;
  boardId: string;
  status: 'active' | 'archived';
  createdAt: Date;
  createdBy: string;
  /** 링크 카드 썸네일 — preview 만 OG 조회 */
  displayType?: 'preview' | 'url';
}

export interface UIBoard {
  id: string;
  name: string;
  color: string;
  links: UILink[];
  height: number;
  width: number;
  ownerId?: string;
  teamId?: string;
}

export interface UITeamRow {
  id: string;
  name: string;
  inviteCode: string;
  role: 'admin' | 'member';
  memberCount: number;
}

function layoutDims(
  layout: unknown,
  fallback: { width: number; height: number }
): { width: number; height: number } {
  if (!layout || typeof layout !== 'object') return fallback;
  const o = layout as Record<string, unknown>;
  const w = typeof o.width === 'number' ? o.width : fallback.width;
  const h = typeof o.height === 'number' ? o.height : fallback.height;
  return { width: w, height: h };
}

export async function fetchProfileName(client: SupabaseClient<Database>, userId: string): Promise<string> {
  const { data } = await client.from('users').select('name').eq('id', userId).maybeSingle();
  return data?.name?.trim() || '사용자';
}

async function fetchUserNames(
  client: SupabaseClient<Database>,
  ids: string[]
): Promise<Record<string, string>> {
  const uniq = [...new Set(ids)].filter(Boolean);
  if (uniq.length === 0) return {};
  const { data, error } = await client.from('users').select('id, name').in('id', uniq);
  if (error || !data) return {};
  const map: Record<string, string> = {};
  for (const row of data) {
    map[row.id] = row.name?.trim() || '사용자';
  }
  return map;
}

/** 접근 가능한 팀 id 목록 */
export async function fetchMyTeamIds(client: SupabaseClient<Database>, userId: string): Promise<string[]> {
  const { data, error } = await client.from('team_members').select('team_id').eq('user_id', userId);
  if (error || !data) return [];
  return data.map((r) => r.team_id);
}

export async function fetchMyTeams(
  client: SupabaseClient<Database>,
  userId: string
): Promise<UITeamRow[]> {
  const { data: memberships, error } = await client
    .from('team_members')
    .select('team_id, role, teams ( id, name, invite_code )')
    .eq('user_id', userId);

  if (error || !memberships?.length) return [];

  const rows: UITeamRow[] = [];
  for (const m of memberships) {
    const t = m.teams as { id: string; name: string; invite_code: string } | null;
    if (!t?.id) continue;
    const { count } = await client
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', t.id);

    rows.push({
      id: t.id,
      name: t.name,
      inviteCode: t.invite_code,
      role: m.role === 'admin' ? 'admin' : 'member',
      memberCount: count ?? 1,
    });
  }
  return rows;
}

export async function fetchBoardsForUser(
  client: SupabaseClient<Database>,
  userId: string,
  fallbackLayout: { width: number; height: number }
): Promise<UIBoard[]> {
  const teamIds = await fetchMyTeamIds(client, userId);

  /** PostgREST `.or()` 문자열에 UUID 하이픈이 들어가면 필터가 깨져 빈 결과가 나올 수 있음 → 쿼리 분리 */
  const { data: ownedRows, error: ownedErr } = await client
    .from('boards')
    .select(BOARD_LINKS_SELECT)
    .eq('owner_id', userId);

  if (ownedErr) {
    console.error('[fetchBoardsForUser] owned', ownedErr);
    throw ownedErr;
  }

  let teamRows: typeof ownedRows = [];
  if (teamIds.length > 0) {
    const { data: tb, error: teamErr } = await client
      .from('boards')
      .select(BOARD_LINKS_SELECT)
      .in('team_id', teamIds);
    if (teamErr) {
      console.error('[fetchBoardsForUser] team', teamErr);
      throw teamErr;
    }
    teamRows = tb ?? [];
  }

  const merged = new Map<string, NonNullable<typeof ownedRows>[number]>();
  for (const b of [...(ownedRows ?? []), ...teamRows]) {
    merged.set(b.id, b);
  }
  const boards = [...merged.values()];
  const creatorIds = boards.flatMap((b) =>
    (b.links as Database['public']['Tables']['links']['Row'][] | null)?.map((l) => l.created_by) ?? []
  );
  const nameMap = await fetchUserNames(client, creatorIds);

  return boards.map((b) => {
    const dims = layoutDims(b.layout_config, fallbackLayout);
    const rawLinks = (b.links ?? []) as Database['public']['Tables']['links']['Row'][];
    rawLinks.sort((a, b) => (a.sort_order !== b.sort_order ? a.sort_order - b.sort_order : a.created_at.localeCompare(b.created_at)));

    const links: UILink[] = rawLinks.map((l) => ({
      id: l.id,
      title: l.title?.trim() || l.url,
      url: l.url,
      memo: l.memo ?? undefined,
      boardId: l.board_id,
      status: l.status === 'archived' ? 'archived' : 'active',
      createdAt: new Date(l.created_at),
      createdBy: nameMap[l.created_by] ?? '사용자',
      displayType: l.display_type === 'url' ? 'url' : 'preview',
    }));

    const row: UIBoard = {
      id: b.id,
      name: b.name,
      color: b.color,
      width: dims.width,
      height: dims.height,
      links,
      ...(b.team_id ? { teamId: b.team_id } : {}),
      ...(b.owner_id ? { ownerId: b.owner_id } : {}),
    };
    return row;
  });
}

export async function insertBoard(
  client: SupabaseClient<Database>,
  args: {
    userId: string;
    name: string;
    color: string;
    layout: { width: number; height: number };
    ownerId?: string;
    teamId?: string;
  }
): Promise<string> {
  const layout: Json = { width: args.layout.width, height: args.layout.height };
  const payload: Database['public']['Tables']['boards']['Insert'] = {
    name: args.name,
    color: args.color,
    layout_config: layout,
    ...(args.teamId
      ? { team_id: args.teamId, owner_id: null }
      : { owner_id: args.userId, team_id: null }),
  };

  const { data, error } = await client.from('boards').insert(payload).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function updateBoardLayout(
  client: SupabaseClient<Database>,
  boardId: string,
  width: number,
  height: number
): Promise<void> {
  const { error } = await client
    .from('boards')
    .update({
      layout_config: { width, height } as Database['public']['Tables']['boards']['Row']['layout_config'],
    })
    .eq('id', boardId);
  if (error) throw error;
}

export async function updateBoardMeta(
  client: SupabaseClient<Database>,
  boardId: string,
  patch: { name?: string; color?: string }
): Promise<void> {
  const row: Database['public']['Tables']['boards']['Update'] = {};
  if (patch.name !== undefined) row.name = patch.name.trim();
  if (patch.color !== undefined) row.color = patch.color;
  if (Object.keys(row).length === 0) return;
  const { error } = await client.from('boards').update(row).eq('id', boardId);
  if (error) throw error;
}

export async function deleteBoardById(client: SupabaseClient<Database>, boardId: string): Promise<void> {
  const { error } = await client.from('boards').delete().eq('id', boardId);
  if (error) throw error;
}

export async function insertLinkRow(
  client: SupabaseClient<Database>,
  args: {
    userId: string;
    boardId: string;
    title: string;
    url: string;
    memo?: string;
    sortOrder: number;
  }
): Promise<string> {
  const { data, error } = await client
    .from('links')
    .insert({
      board_id: args.boardId,
      created_by: args.userId,
      url: args.url,
      title: args.title || null,
      memo: args.memo ?? null,
      status: 'active',
      display_type: 'preview',
      sort_order: args.sortOrder,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateLinkRow(
  client: SupabaseClient<Database>,
  linkId: string,
  patch: { title?: string; url?: string; memo?: string | null; status?: 'active' | 'archived'; board_id?: string }
): Promise<void> {
  const { error } = await client.from('links').update(patch).eq('id', linkId);
  if (error) throw error;
}

export async function deleteLinkRow(client: SupabaseClient<Database>, linkId: string): Promise<void> {
  const { error } = await client.from('links').delete().eq('id', linkId);
  if (error) throw error;
}

export async function moveLinkToBoard(
  client: SupabaseClient<Database>,
  linkId: string,
  newBoardId: string,
  sortOrder: number
): Promise<void> {
  const { error } = await client
    .from('links')
    .update({ board_id: newBoardId, sort_order: sortOrder })
    .eq('id', linkId);
  if (error) throw error;
}

export async function fetchArchivedLinksForUser(
  client: SupabaseClient<Database>,
  userId: string
): Promise<
  {
    id: string;
    title: string;
    url: string;
    memo?: string;
    boardName: string;
    boardColor: string;
    archivedAt: Date;
  }[]
> {
  const teamIds = await fetchMyTeamIds(client, userId);
  const orParts = [`owner_id.eq.${userId}`];
  if (teamIds.length) orParts.push(`team_id.in.(${teamIds.join(',')})`);

  const { data: boards, error: be } = await client.from('boards').select('id, name, color').or(orParts.join(','));
  if (be || !boards?.length) return [];

  const boardIds = boards.map((b) => b.id);
  const metaById = Object.fromEntries(boards.map((b) => [b.id, { name: b.name, color: b.color }]));

  const { data: linkRows, error: le } = await client
    .from('links')
    .select('id, title, url, memo, board_id, created_at')
    .eq('status', 'archived')
    .in('board_id', boardIds);

  if (le || !linkRows) return [];

  return linkRows.map((l) => {
    const m = metaById[l.board_id];
    return {
      id: l.id,
      title: (l.title?.trim() || l.url) ?? '',
      url: l.url,
      memo: l.memo ?? undefined,
      boardName: m?.name ?? '보드',
      boardColor: m?.color ?? '#169392',
      archivedAt: new Date(l.created_at),
    };
  });
}
