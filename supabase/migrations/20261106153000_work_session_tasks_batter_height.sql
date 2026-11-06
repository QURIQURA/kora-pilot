-- 반죽 높이(mm) — 생산 디테일에서 숫자로 기록, R&D 실험의 구운 높이와 비교용
alter table public.work_session_tasks add column if not exists batter_height_mm numeric;
