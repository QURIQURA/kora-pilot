-- 공용 완성 규격에 "프리폼(케이크 아님)" 종류 추가(2026-11-13): 가로·세로·높이 대신 중량(g)과 인분수로 정의한다.
ALTER TABLE public.cake_sizes
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'CAKE',
  ADD COLUMN IF NOT EXISTS weight_g numeric;
ALTER TABLE public.cake_sizes
  DROP CONSTRAINT IF EXISTS cake_sizes_kind_check;
ALTER TABLE public.cake_sizes
  ADD CONSTRAINT cake_sizes_kind_check CHECK (kind IN ('CAKE','FREE'));
