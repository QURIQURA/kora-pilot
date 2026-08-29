-- METHOD — TECHNIQUE CATEGORY와는 별개의 새 개념 (사용자 확정, 2026-08-29).
-- Technique Category = "무슨 기법군인가" (예: Foam Cake, Mousse)
-- Method       = "그 기법을 어떤 제조 방식/원리로 구현했는가" (예: Whole Egg/공립법, Oil Emulsion/오일 유화법)
-- Method는 특정 Technique Category에 종속된다 (예: "공립법"은 Foam Cake에서만 의미가 있음).
-- Source of Truth는 FORMULA: formulas.technique_category_id + formulas.method_id로 관리하고,
-- COMPONENT에는 중복 저장하지 않는다 (Component Detail은 연결된 Formula에서 자동 집계해서 보여줌 — 별도 후속 작업).
create table public.methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  technique_category_id uuid references public.technique_categories(id) on delete cascade,
  name text not null,
  name_en text,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.methods is
  'PILOT — METHOD. 특정 TECHNIQUE CATEGORY에 종속된 제조 방식/원리 (예: Foam Cake → 공립법/별립법/오일 유화법). FORMULA가 technique_category_id와 함께 참조하는 Source of Truth.';
comment on column public.methods.technique_category_id is
  '이 Method가 속한 TECHNIQUE CATEGORY. on delete cascade — 상위 기법 카테고리가 삭제되면 그 아래 Method도 함께 삭제됨.';

alter table public.methods enable row level security;

create policy "own methods select"
  on public.methods for select
  using (auth.uid() = user_id);
create policy "own methods insert"
  on public.methods for insert
  with check (auth.uid() = user_id);
create policy "own methods update"
  on public.methods for update
  using (auth.uid() = user_id);
create policy "own methods delete"
  on public.methods for delete
  using (auth.uid() = user_id);

create index methods_technique_category_id_idx on public.methods(technique_category_id);

create trigger methods_updated_at
  before update on public.methods
  for each row
  execute function update_updated_at_column();

-- FORMULA가 Technique Category와 함께 Method도 저장 (Source of Truth).
-- technique_category_id는 이미 존재함 — method_id만 추가.
alter table public.formulas
  add column method_id uuid references public.methods(id) on delete set null;

comment on column public.formulas.method_id is
  '이 FORMULA의 제조 방식/원리 (METHOD). technique_category_id와 함께 FORMULA 레벨에서 관리 — COMPONENT에는 중복 저장하지 않는다.';

create index formulas_method_id_idx on public.formulas(method_id);
