-- 2026-10-20 사이즈 통합 1단계 (대안 B 점진형): 컬럼만 추가, 기존 데이터는 변경하지 않는다(전부 null로 시작).
-- 재실행 안전(IF NOT EXISTS) — 데이터 삭제/일괄 변경 없음.
-- - work_sessions.cake_size_id: 주문의 CAKE SIZE를 세션에 복사해 보존(주문 → 세션 사이즈 전달)
-- - product_sizes.cake_size_id: 제품별 완성 스펙(product_sizes)을 공칭 사이즈(cake_sizes)에 연결 —
--   매핑은 사용자가 확정한 뒤에만 채운다(자동 매핑 없음).
alter table public.work_sessions
  add column if not exists cake_size_id uuid references public.cake_sizes(id) on delete set null;
alter table public.product_sizes
  add column if not exists cake_size_id uuid references public.cake_sizes(id) on delete set null;
