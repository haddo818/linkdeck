-- LinkDeck — PRD §5.3 스키마 + Auth 동기화 트리거 + RLS
-- Supabase SQL Editor 또는 supabase db push 로 적용

-- Extension (UUID)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- public.users — auth.users 와 동일 PK (트리거로 자동 동기화)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- teams — RLS: 생성 직후 멤버 추가 전에도 조회하기 위해 created_by 유지
-- ---------------------------------------------------------------------------
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX teams_invite_code_key ON public.teams (invite_code);

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
CREATE TABLE public.team_members (
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  PRIMARY KEY (team_id, user_id),
  CONSTRAINT team_members_role_check CHECK (role IN ('admin', 'member'))
);

CREATE INDEX team_members_user_id_idx ON public.team_members (user_id);

-- ---------------------------------------------------------------------------
-- boards — owner_id XOR team_id
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- links — SQL 예약어 회피: sort_order (앱 레이어에서 order 로 매핑)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Auth → public.users 동기화 (Google 등 raw_user_meta_data 파싱)
-- ---------------------------------------------------------------------------
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
    name = COALESCE(EXCLUDED.name, public.users.name),
    profile_image_url = COALESCE(EXCLUDED.profile_image_url, public.users.profile_image_url),
    auth_provider = EXCLUDED.auth_provider;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();

-- OAuth 이후 프로필 메타가 갱신될 때 public.users 보조 동기화 (선택)
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

-- ---------------------------------------------------------------------------
-- 초대 코드로 팀 가입 (RLS만으로는 초대 검증이 어려워 SECURITY DEFINER RPC)
-- ---------------------------------------------------------------------------
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

-- RLS 정책에서 team_members를 직접 조회하면 무한 재귀 → SECURITY DEFINER 헬퍼 사용
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

-- ---------------------------------------------------------------------------
-- RLS 활성화
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;

-- users
CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- teams
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

-- team_members
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

-- boards: 개인(owner) 또는 소속 팀
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

-- links: 보드 접근 가능 시 + 작성자 식별
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
