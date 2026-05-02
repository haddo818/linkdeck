/*
================================================================================
  LinkDeck — Supabase SQL Editor 복사·붙여넣기 가이드
================================================================================

  【1단계】처음 DB를 만들 때만: "▼▼▼ 1단계 시작" ~ "▲▲▲ 1단계 끝" 전체 복사 → Run
        (이미 돌린 적 있으면 건너뛰고 위의 [패치만] 블록만 실행)

  【2단계】앱에서 회원가입을 1번 해서 계정을 만든다.
        (그래야 public.users 에 행이 생김)

  【3단계】아래 "▼▼▼ 3단계 시작" 부터 "▲▲▲ 3단계 끝" 까지 전부 선택 → 복사
        → SQL Editor → 붙여넣기 → Run
        (예시 보드·링크·팀 데이터가 들어감)

  ※ ERROR 42P07 relation "users" already exists
    → 테이블이 이미 있는 상태입니다. 아래 [패치만] 블록만 실행하세요.
    → 전체 1단계를 다시 실행하지 마세요.

  ※ 보드 생성 시 infinite recursion detected in policy for relation "team_members"
    → [패치만] 블록 전체를 SQL Editor에서 한 번 더 Run (헬퍼 함수 + 정책 재생성 포함).

  ※ 예전에 1단계를 한 번 돌린 적이 있으면, 새 프로젝트가 아닌 이상 [패치만]이면 충분합니다.

================================================================================
*/


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ▼▼▼ 패치만 — 이미 1단계(테이블 생성)를 실행한 적이 있을 때만 복사·실행   ║
-- ║      프로필 동기화 실패 / team_members 무한 재귀 시 이 블록 전체 Run       ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  au auth.users%ROWTYPE;
  meta jsonb;
  disp_name text;
  avatar text;
  prov text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO au FROM auth.users WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth user not found';
  END IF;

  meta := COALESCE(au.raw_user_meta_data, '{}'::jsonb);

  disp_name := NULLIF(TRIM(COALESCE(
    meta->>'full_name',
    meta->>'name',
    meta->>'user_name',
    split_part(COALESCE(au.email, ''), '@', 1)
  )), '');

  avatar := NULLIF(TRIM(COALESCE(meta->>'avatar_url', meta->>'picture')), '');

  prov := LOWER(COALESCE(
    au.raw_app_meta_data->>'provider',
    (au.raw_app_meta_data->'providers'->>0),
    'email'
  ));

  INSERT INTO public.users (id, name, email, profile_image_url, auth_provider, theme_preference)
  VALUES (
    au.id,
    COALESCE(disp_name, 'User'),
    COALESCE(au.email, ''),
    avatar,
    CASE
      WHEN prov IN ('email', 'google', 'github', 'apple', 'phone') THEN prov
      ELSE 'email'
    END,
    'light'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(TRIM(disp_name), ''), name),
    profile_image_url = COALESCE(EXCLUDED.profile_image_url, profile_image_url),
    auth_provider = EXCLUDED.auth_provider;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_auth_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_auth_user_profile() TO authenticated;

-- team_members 정책이 같은 테이블을 조회하면 무한 재귀 → 헬퍼 + 아래 정책 갱신 필수
CREATE OR REPLACE FUNCTION public.auth_user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_user_is_member_of_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_is_admin_of_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.team_has_any_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id);
$$;

CREATE OR REPLACE FUNCTION public.peer_user_ids_for_auth_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m2.user_id
  FROM public.team_members m1
  INNER JOIN public.team_members m2 ON m2.team_id = m1.team_id
  WHERE m1.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_user_team_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_team_ids() TO authenticated;
REVOKE ALL ON FUNCTION public.auth_user_is_member_of_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_member_of_team(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_user_is_admin_of_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_admin_of_team(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.team_has_any_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_has_any_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.peer_user_ids_for_auth_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peer_user_ids_for_auth_user() TO authenticated;

DROP POLICY IF EXISTS users_insert_own ON public.users;
CREATE POLICY users_insert_own ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS teams_select_visible ON public.teams;
DROP POLICY IF EXISTS teams_update_admin ON public.teams;
DROP POLICY IF EXISTS teams_delete_admin ON public.teams;
DROP POLICY IF EXISTS team_members_select_peer ON public.team_members;
DROP POLICY IF EXISTS team_members_insert_rules ON public.team_members;
DROP POLICY IF EXISTS team_members_delete_self_or_admin ON public.team_members;
DROP POLICY IF EXISTS boards_select_scope ON public.boards;
DROP POLICY IF EXISTS boards_insert_scope ON public.boards;
DROP POLICY IF EXISTS boards_update_scope ON public.boards;
DROP POLICY IF EXISTS boards_delete_scope ON public.boards;
DROP POLICY IF EXISTS links_select_via_board ON public.links;
DROP POLICY IF EXISTS links_insert_own ON public.links;
DROP POLICY IF EXISTS links_update_via_board ON public.links;
DROP POLICY IF EXISTS links_delete_via_board ON public.links;
DROP POLICY IF EXISTS users_select_team_peers ON public.users;

CREATE POLICY teams_select_visible ON public.teams
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.auth_user_is_member_of_team(id)
  );

CREATE POLICY teams_update_admin ON public.teams
  FOR UPDATE TO authenticated
  USING (public.auth_user_is_admin_of_team(id));

CREATE POLICY teams_delete_admin ON public.teams
  FOR DELETE TO authenticated
  USING (public.auth_user_is_admin_of_team(id));

CREATE POLICY team_members_select_peer ON public.team_members
  FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT public.auth_user_team_ids())
    OR team_id IN (
      SELECT t.id FROM public.teams t WHERE t.created_by = auth.uid()
    )
  );

CREATE POLICY team_members_insert_rules ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (
        NOT public.team_has_any_member(team_members.team_id)
        AND EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = team_id AND t.created_by = auth.uid()
        )
      )
      OR public.auth_user_is_admin_of_team(team_members.team_id)
    )
  );

CREATE POLICY team_members_delete_self_or_admin ON public.team_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.auth_user_is_admin_of_team(team_members.team_id)
  );

CREATE POLICY boards_select_scope ON public.boards
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR team_id IN (SELECT public.auth_user_team_ids())
  );

CREATE POLICY boards_insert_scope ON public.boards
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() AND team_id IS NULL)
    OR (
      team_id IS NOT NULL
      AND owner_id IS NULL
      AND team_id IN (SELECT public.auth_user_team_ids())
    )
  );

CREATE POLICY boards_update_scope ON public.boards
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR team_id IN (SELECT public.auth_user_team_ids())
  );

CREATE POLICY boards_delete_scope ON public.boards
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.auth_user_is_admin_of_team(boards.team_id)
  );

CREATE POLICY links_select_via_board ON public.links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = links.board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

CREATE POLICY links_insert_own ON public.links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

CREATE POLICY links_update_via_board ON public.links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = links.board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

CREATE POLICY links_delete_via_board ON public.links
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = links.board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

CREATE POLICY users_select_team_peers ON public.users
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.peer_user_ids_for_auth_user()));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ▲▲▲ 패치만 끝                                                            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ▼▼▼ 1단계 시작 — 새 프로젝트·처음만 (테이블 아직 없을 때만 실행)         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  profile_image_url text,
  auth_provider text NOT NULL DEFAULT 'email',
  theme_preference text NOT NULL DEFAULT 'light',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_theme_check CHECK (theme_preference IN ('dark', 'light')),
  CONSTRAINT users_auth_provider_check CHECK (auth_provider IN ('email', 'google', 'github', 'apple', 'phone'))
);

CREATE INDEX users_email_idx ON public.users (email);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX teams_invite_code_key ON public.teams (invite_code);

CREATE TABLE public.team_members (
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT team_members_role_check CHECK (role IN ('admin', 'member'))
);

CREATE INDEX team_members_user_id_idx ON public.team_members (user_id);

CREATE TABLE public.boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#169392',
  layout_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid REFERENCES public.users (id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boards_owner_xor_team CHECK (
    (owner_id IS NOT NULL AND team_id IS NULL)
    OR (owner_id IS NULL AND team_id IS NOT NULL)
  )
);

CREATE INDEX boards_owner_id_idx ON public.boards (owner_id);
CREATE INDEX boards_team_id_idx ON public.boards (team_id);

CREATE TABLE public.links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.boards (id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  memo text,
  display_type text NOT NULL DEFAULT 'preview',
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT links_display_type_check CHECK (display_type IN ('preview', 'url')),
  CONSTRAINT links_status_check CHECK (status IN ('active', 'archived'))
);

CREATE INDEX links_board_id_idx ON public.links (board_id);
CREATE INDEX links_created_by_idx ON public.links (created_by);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
  prov text;
  disp_name text;
  avatar text;
BEGIN
  prov := LOWER(COALESCE(
    new.raw_app_meta_data->>'provider',
    (new.raw_app_meta_data->'providers'->>0),
    'email'
  ));

  disp_name := NULLIF(TRIM(COALESCE(
    meta->>'full_name',
    meta->>'name',
    meta->>'user_name',
    split_part(COALESCE(new.email, ''), '@', 1)
  )), '');

  avatar := NULLIF(TRIM(COALESCE(meta->>'avatar_url', meta->>'picture')), '');

  INSERT INTO public.users (id, name, email, profile_image_url, auth_provider, theme_preference)
  VALUES (
    new.id,
    COALESCE(disp_name, 'User'),
    COALESCE(new.email, ''),
    avatar,
    CASE
      WHEN prov IN ('email', 'google', 'github', 'apple', 'phone') THEN prov
      ELSE 'email'
    END,
    'light'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = COALESCE(NULLIF(TRIM(disp_name), ''), name),
    profile_image_url = COALESCE(EXCLUDED.profile_image_url, profile_image_url),
    auth_provider = EXCLUDED.auth_provider;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_user_metadata_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta jsonb := COALESCE(new.raw_user_meta_data, '{}'::jsonb);
BEGIN
  UPDATE public.users
  SET
    name = COALESCE(
      NULLIF(TRIM(COALESCE(meta->>'full_name', meta->>'name', meta->>'user_name')), ''),
      name
    ),
    profile_image_url = COALESCE(
      NULLIF(TRIM(COALESCE(meta->>'avatar_url', meta->>'picture')), ''),
      profile_image_url
    ),
    email = COALESCE(new.email, email)
  WHERE id = new.id;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF raw_user_meta_data, email ON auth.users
  FOR EACH ROW
  WHEN (new.raw_user_meta_data IS DISTINCT FROM old.raw_user_meta_data OR new.email IS DISTINCT FROM old.email)
  EXECUTE PROCEDURE public.handle_user_metadata_updated();

CREATE OR REPLACE FUNCTION public.join_team_with_invite(p_invite_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid;
  clean text := upper(trim(p_invite_code));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT id INTO tid FROM public.teams WHERE invite_code = clean;
  IF tid IS NULL THEN
    RAISE EXCEPTION 'invalid invite code';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_members WHERE team_id = tid AND user_id = auth.uid()
  ) THEN
    RETURN tid;
  END IF;

  INSERT INTO public.team_members (team_id, user_id, role)
  VALUES (tid, auth.uid(), 'member');

  RETURN tid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_team_with_invite(text) TO authenticated;

-- RLS에서 team_members 직접 조회 시 무한 재귀 방지
CREATE OR REPLACE FUNCTION public.auth_user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.auth_user_is_member_of_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_is_admin_of_team(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE team_id = p_team_id AND user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.team_has_any_member(p_team_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id);
$$;

CREATE OR REPLACE FUNCTION public.peer_user_ids_for_auth_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT m2.user_id
  FROM public.team_members m1
  INNER JOIN public.team_members m2 ON m2.team_id = m1.team_id
  WHERE m1.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_user_team_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_team_ids() TO authenticated;
REVOKE ALL ON FUNCTION public.auth_user_is_member_of_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_member_of_team(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.auth_user_is_admin_of_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_is_admin_of_team(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.team_has_any_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.team_has_any_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.peer_user_ids_for_auth_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.peer_user_ids_for_auth_user() TO authenticated;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 로그인 직후 앱에서 public.users upsert 가능 (트리거만으로 행이 없을 때 보드 생성 FK 오류 방지)
CREATE POLICY users_insert_own ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY teams_select_visible ON public.teams
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR public.auth_user_is_member_of_team(id)
  );

CREATE POLICY teams_insert_creator ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY teams_update_admin ON public.teams
  FOR UPDATE TO authenticated
  USING (public.auth_user_is_admin_of_team(id));

CREATE POLICY teams_delete_admin ON public.teams
  FOR DELETE TO authenticated
  USING (public.auth_user_is_admin_of_team(id));

CREATE POLICY team_members_select_peer ON public.team_members
  FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT public.auth_user_team_ids())
    OR team_id IN (
      SELECT t.id FROM public.teams t WHERE t.created_by = auth.uid()
    )
  );

CREATE POLICY team_members_insert_rules ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (
      (
        NOT public.team_has_any_member(team_members.team_id)
        AND EXISTS (
          SELECT 1 FROM public.teams t
          WHERE t.id = team_id AND t.created_by = auth.uid()
        )
      )
      OR public.auth_user_is_admin_of_team(team_members.team_id)
    )
  );

CREATE POLICY team_members_delete_self_or_admin ON public.team_members
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.auth_user_is_admin_of_team(team_members.team_id)
  );

CREATE POLICY boards_select_scope ON public.boards
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR team_id IN (SELECT public.auth_user_team_ids())
  );

CREATE POLICY boards_insert_scope ON public.boards
  FOR INSERT TO authenticated
  WITH CHECK (
    (owner_id = auth.uid() AND team_id IS NULL)
    OR (
      team_id IS NOT NULL
      AND owner_id IS NULL
      AND team_id IN (SELECT public.auth_user_team_ids())
    )
  );

CREATE POLICY boards_update_scope ON public.boards
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR team_id IN (SELECT public.auth_user_team_ids())
  );

CREATE POLICY boards_delete_scope ON public.boards
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.auth_user_is_admin_of_team(boards.team_id)
  );

CREATE POLICY links_select_via_board ON public.links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = links.board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

CREATE POLICY links_insert_own ON public.links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

CREATE POLICY links_update_via_board ON public.links
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = links.board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

CREATE POLICY links_delete_via_board ON public.links
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = links.board_id
        AND (
          b.owner_id = auth.uid()
          OR (
            b.team_id IS NOT NULL
            AND b.team_id IN (SELECT public.auth_user_team_ids())
          )
        )
    )
  );

-- 같은 팀원 프로필 이름 조회 (링크 작성자 표시)
CREATE POLICY users_select_team_peers ON public.users
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.peer_user_ids_for_auth_user()));

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ▲▲▲ 1단계 끝 — 새 프로젝트 최초 1회만 실행                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ▼▼▼ 3단계 시작 — 회원가입 1회 한 뒤에만 실행 (예시 데이터)                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DO $$
DECLARE
  uid uuid;
  tid uuid;
  b_design uuid;
  b_dev uuid;
  b_mkt uuid;
  dims jsonb := '{"width":380,"height":560}'::jsonb;
BEGIN
  SELECT u.id INTO uid FROM public.users u ORDER BY u.created_at ASC LIMIT 1;
  IF uid IS NULL THEN
    RAISE NOTICE '먼저 앱에서 회원가입/로그인하여 public.users 가 생성된 뒤 이 스크립트를 실행하세요.';
    RETURN;
  END IF;

  SELECT t.id INTO tid FROM public.teams t WHERE t.invite_code = 'DESIGN2024' LIMIT 1;
  IF tid IS NULL THEN
    INSERT INTO public.teams (name, invite_code, created_by)
    VALUES ('디자인팀', 'DESIGN2024', uid)
    RETURNING id INTO tid;
    INSERT INTO public.team_members (team_id, user_id, role) VALUES (tid, uid, 'admin');
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.team_id = tid AND tm.user_id = uid
  ) THEN
    INSERT INTO public.team_members (team_id, user_id, role) VALUES (tid, uid, 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.boards b WHERE b.owner_id = uid AND b.name = '디자인 레퍼런스') THEN
    INSERT INTO public.boards (name, color, layout_config, owner_id, team_id)
    VALUES ('디자인 레퍼런스', '#FF6B6B', dims, uid, NULL)
    RETURNING id INTO b_design;
  ELSE
    SELECT b.id INTO b_design FROM public.boards b WHERE b.owner_id = uid AND b.name = '디자인 레퍼런스' LIMIT 1;
  END IF;

  IF tid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.boards b WHERE b.team_id = tid AND b.name = '개발 자료') THEN
    INSERT INTO public.boards (name, color, layout_config, owner_id, team_id)
    VALUES ('개발 자료', '#4ECDC4', dims, NULL, tid)
    RETURNING id INTO b_dev;
  ELSIF tid IS NOT NULL THEN
    SELECT b.id INTO b_dev FROM public.boards b WHERE b.team_id = tid AND b.name = '개발 자료' LIMIT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.boards b WHERE b.owner_id = uid AND b.name = '마케팅 자료') THEN
    INSERT INTO public.boards (name, color, layout_config, owner_id, team_id)
    VALUES ('마케팅 자료', '#95E1D3', dims, uid, NULL)
    RETURNING id INTO b_mkt;
  ELSE
    SELECT b.id INTO b_mkt FROM public.boards b WHERE b.owner_id = uid AND b.name = '마케팅 자료' LIMIT 1;
  END IF;

  IF b_design IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.links l WHERE l.board_id = b_design AND l.url = 'https://dribbble.com') THEN
    INSERT INTO public.links (board_id, created_by, url, title, memo, status, sort_order)
    VALUES
      (b_design, uid, 'https://dribbble.com', 'Dribbble', 'UI/UX 디자인', 'active', 0),
      (b_design, uid, 'https://behance.net', 'Behance', '포트폴리오 참고', 'active', 1),
      (b_design, uid, 'https://awwwards.com', 'Awwwards', NULL, 'active', 2),
      (b_design, uid, 'https://pinterest.com', 'Pinterest', NULL, 'active', 3);
  END IF;

  IF b_dev IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.links l WHERE l.board_id = b_dev AND l.url = 'https://react.dev') THEN
    INSERT INTO public.links (board_id, created_by, url, title, memo, status, sort_order)
    VALUES
      (b_dev, uid, 'https://react.dev', 'React 공식 문서', 'React 최신 문서', 'active', 0),
      (b_dev, uid, 'https://tailwindcss.com', 'Tailwind CSS', NULL, 'active', 1),
      (b_dev, uid, 'https://typescriptlang.org', 'TypeScript', NULL, 'active', 2);
  END IF;

  IF b_mkt IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.links l WHERE l.board_id = b_mkt AND l.url = 'https://analytics.google.com') THEN
    INSERT INTO public.links (board_id, created_by, url, title, memo, status, sort_order)
    VALUES
      (b_mkt, uid, 'https://analytics.google.com', 'Google Analytics', 'GA4 대시보드', 'active', 0),
      (b_mkt, uid, 'https://hubspot.com', 'HubSpot', NULL, 'active', 1);
  END IF;

  RAISE NOTICE 'seed_sample_data 완료 (user %)', uid;
END $$;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  ▲▲▲ 3단계 끝                                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
