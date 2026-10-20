-- 2026-10-20 사용자 요청: ORDER의 "사이즈"를 두 가지로 분리 관리한다.
-- - 최종 케익 사이즈(기존 orders.product_size_id → product_sizes) = PRODUCT에 연결, 단가계산용.
-- - 시트 사이즈(이 컬럼, orders.sheet_mould_id → moulds) = WORK SESSION 생성 시 연결되어
--   원하는 몰드 기준으로 자동 배수 계산에 쓰이는, 단가와는 무관한 생산 편의용 필드.
-- PRODUCT SIZE 데이터가 없는 제품/커스텀 사이즈 주문이라도 이 필드만 골라두면 WORK SESSION
-- 자동계산이 가능해진다("몰드·용량 시스템 통합 개선안"에서 짚었던 목적 분리를 ORDER 레벨까지 확장).
alter table public.orders add column sheet_mould_id uuid references public.moulds(id);
