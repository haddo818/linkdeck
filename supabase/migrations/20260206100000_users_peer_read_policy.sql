-- 같은 팀 소속 사용자의 프로필 이름 조회 (링크 작성자 표시용)
-- peer_user_ids_for_auth_user()는 initial_schema의 SECURITY DEFINER 헬퍼 사용
DROP POLICY IF EXISTS users_select_team_peers ON public.users;
CREATE POLICY users_select_team_peers ON public.users
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.peer_user_ids_for_auth_user()));
