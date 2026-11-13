-- Value Matrix 보드 종류(2026-11-13) — 가산 변경만: matrix 컬럼 추가 + kind 허용값에 'MATRIX' 추가. 기존 데이터는 그대로.
alter table public.design_moodboards add column if not exists matrix jsonb not null default '{}'::jsonb;
alter table public.design_moodboards drop constraint if exists design_moodboards_kind_check;
alter table public.design_moodboards add constraint design_moodboards_kind_check check (kind in ('MOOD','MIND','MATRIX'));
