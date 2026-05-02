-- 예시 데이터 (한 명 이상 가입해 public.users 에 행이 있을 때 실행)
-- Supabase SQL Editor에서 실행하거나 MCP execute_sql 로 적용

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

  -- 개인·팀 보드 (이미 있으면 건너뜀)
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

  -- 링크 (보드가 있을 때만)
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
