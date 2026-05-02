-- 로그인 사용자의 auth.users → public.users 동기화 (RLS INSERT 정책 없이도 동작)
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
