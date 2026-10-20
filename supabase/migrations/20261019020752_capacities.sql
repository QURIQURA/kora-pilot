-- 몰드·용량 시스템 통합 (1단계: 추가형 마이그레이션, 전환 기간 dual-write)
-- "몰드·용량 시스템 통합 개선안" 문서의 단계별 마이그레이션 계획 중 1~2단계를 반영.
-- moulds + base_weight_presets를 capacities(kind 판별 컬럼)로 통합하되,
-- 기존 테이블/컬럼(moulds, base_weight_presets, default_mould_id, default_base_weight_id,
-- mould_id/mould_qty, base_weight_id/base_weight_qty)은 안전을 위해 그대로 유지한다.
-- 기존 PK(uuid)를 그대로 보존해서 백필하므로, 기존 FK 컬럼들의 값이 새 테이블에서도
-- 그대로 유효한 id가 된다(값 재작성 없이 참조만 새 컬럼으로 추가).

create table public.capacities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null check (kind in ('MOULD', 'BASE_WEIGHT')),
  name text not null,
  weight_g numeric,
  shape_size text,
  diameter_mm numeric,
  height_mm numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.capacities enable row level security;

create policy "own capacities"
  on public.capacities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index capacities_user_id_kind_idx on public.capacities (user_id, kind);

insert into public.capacities (id, user_id, kind, name, weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at)
select id, user_id, 'MOULD', name, reference_weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at
from public.moulds;

insert into public.capacities (id, user_id, kind, name, weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at)
select id, user_id, 'BASE_WEIGHT', name, weight_g, null, null, null, notes, created_at, updated_at
from public.base_weight_presets;

-- formula_versions: 통합 기본 용량 참조 컬럼 추가
alter table public.formula_versions
  add column default_capacity_id uuid references public.capacities(id);

update public.formula_versions
  set default_capacity_id = coalesce(default_mould_id, default_base_weight_id)
  where default_mould_id is not null or default_base_weight_id is not null;

-- work_session_formula_versions: 통합 용량 참조 + 수량 컬럼 추가
alter table public.work_session_formula_versions
  add column capacity_id uuid references public.capacities(id),
  add column capacity_qty numeric;

update public.work_session_formula_versions
  set capacity_id = coalesce(mould_id, base_weight_id),
      capacity_qty = coalesce(mould_qty, base_weight_qty)
  where mould_id is not null or base_weight_id is not null;

-- 참고: product_sizes.mould_id (앱 코드 전체에서 미사용이 확인된 데드 컬럼이며, 이 레포의
-- 20260902043536_product_sizes.sql 마이그레이션 코멘트 "Mould(생산 도구)와는 독립적인
-- 개념 — mould_id 없음(승인된 설계)"와도 모순되는 스키마 드리프트)는 이번 마이그레이션에서
-- 함께 정리하려 했으나, 적용 시점에 DB 쪽 도구가 반복적으로 타임아웃되어 안전하게 적용하지
-- 못했다. 데이터 손실 위험이 없는 단순 컬럼 제거이므로 다음 기회에 별도로 재시도할 것.
