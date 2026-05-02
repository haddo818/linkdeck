-- team_members RLS: 정책 안에서 team_members를 직접 SELECT하면 같은 테이블 정책이 재평가되어 무한 재귀(42xxx) 발생.
-- SECURITY DEFINER 헬퍼로 멤버십만 조회하고, 정책은 이 함수들만 호출한다.

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
