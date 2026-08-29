-- KNOWLEDGE (누적 원칙/노하우) — 실험 하나에 종속되지 않는 지식 기록.
-- PRODUCT/COMPONENT/INGREDIENT/TECHNIQUE_CATEGORY 중 0~1개 이상에 선택적으로 연결.
-- 전부 null이면 "일반 원칙"으로 KNOWLEDGE 탭 전체 목록에 노출.
create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  body text not null default '',
  product_id uuid references public.products(id) on delete set null,
  component_id uuid references public.components(id) on delete set null,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  technique_category_id uuid references public.technique_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.knowledge_entries is
  'PILOT — KNOWLEDGE. 실험 1건에 종속되지 않는 누적 원칙/노하우. 연결 필드는 전부 선택적이며 동시에 여러 개 채워질 수 있다(예: 특정 재료+기법 조합에 대한 지식).';
comment on column public.knowledge_entries.body is '지식/원칙 본문 (자유 텍스트)';

alter table public.knowledge_entries enable row level security;

create policy "own knowledge_entries select"
  on public.knowledge_entries for select
  using (auth.uid() = user_id);
create policy "own knowledge_entries insert"
  on public.knowledge_entries for insert
  with check (auth.uid() = user_id);
create policy "own knowledge_entries update"
  on public.knowledge_entries for update
  using (auth.uid() = user_id);
create policy "own knowledge_entries delete"
  on public.knowledge_entries for delete
  using (auth.uid() = user_id);

create index knowledge_entries_product_id_idx on public.knowledge_entries(product_id);
create index knowledge_entries_component_id_idx on public.knowledge_entries(component_id);
create index knowledge_entries_ingredient_id_idx on public.knowledge_entries(ingredient_id);
create index knowledge_entries_technique_category_id_idx on public.knowledge_entries(technique_category_id);

create trigger knowledge_entries_updated_at
  before update on public.knowledge_entries
  for each row
  execute function update_updated_at_column();
