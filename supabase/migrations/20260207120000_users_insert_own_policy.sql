-- 클라이언트에서 로그인 직후 public.users 행을 upsert 할 수 있도록 (트리거 누락·실패 대비)
CREATE POLICY users_insert_own ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
