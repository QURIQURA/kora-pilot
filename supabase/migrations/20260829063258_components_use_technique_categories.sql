-- COMPONENT의 분류 체계를 generic categories에서 technique_categories로 전환.
-- 이유: technique_categories가 COMPONENT(반제품/기법 단위)에 맞는 실제 사용 중인 taxonomy이고,
-- categories는 PRODUCT 전용으로 남긴다 (사용자 확정, 2026-08-29).
-- 영향도 확인: components 2행 중 1행(LEMON CURD)만 category_id 값 있음(=categories.FILLING),
-- technique_categories에는 해당 id가 없으므로 전환 시 null로 초기화됨(데이터 손실 아님 — 재선택 필요).

alter table public.components
  drop constraint components_category_id_fkey;

alter table public.components
  rename column category_id to technique_category_id;

update public.components
  set technique_category_id = null
  where technique_category_id is not null
    and technique_category_id not in (select id from public.technique_categories);

alter table public.components
  add constraint components_technique_category_id_fkey
  foreign key (technique_category_id) references public.technique_categories(id);

comment on column public.components.technique_category_id is
  'COMPONENT의 기법 분류. technique_categories 참조 (PRODUCT의 categories와는 별도 관리).';
