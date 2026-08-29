-- REFERENCES (외부 참고자료) — 책/영상/아티클/웹사이트 등 외부 출처를 기록.
-- KNOWLEDGE와 동일한 선택적 다중 연결 패턴(PRODUCT/COMPONENT/INGREDIENT/TECHNIQUE_CATEGORY).
-- 전부 null이면 REFERENCES 탭 전체 목록에서만 "일반 참고자료"로 노출.
create table public.reference_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  title text not null,
  source_type text not null default 'OTHER',
  url text,
  author text,
  note text not null default '',
  product_id uuid references public.products(id) on delete set null,
  component_id uuid references public.components(id) on delete set null,
  ingredient_id uuid references public.ingredients(id) on delete set null,
  technique_category_id uuid references public.technique_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reference_entries_source_type_check
    check (source_type in ('BOOK', 'VIDEO', 'ARTICLE', 'WEBSITE', 'OTHER'))
);

comment on table public.reference_entries is
  'PILOT — REFERENCES. 책/영상/아티클/웹사이트 등 외부 참고자료. 연결 필드는 KNOWLEDGE와 동일 패턴(선택적, 다중 가능).';
comment on column public.reference_entries.source_type is 'BOOK | VIDEO | ARTICLE | WEBSITE | OTHER';
comment on column public.reference_entries.url is '외부 링크 (선택). 책처럼 링크가 없을 수도 있음.';
comment on column public.reference_entries.note is '왜 참고했는지, 핵심 요약 등 자유 메모';

alter table public.reference_entries enable row level security;

create policy "own reference_entries select"
  on public.reference_entries for select
  using (auth.uid() = user_id);
create policy "own reference_entries insert"
  on public.reference_entries for insert
  with check (auth.uid() = user_id);
create policy "own reference_entries update"
  on public.reference_entries for update
  using (auth.uid() = user_id);
create policy "own reference_entries delete"
  on public.reference_entries for delete
  using (auth.uid() = user_id);

create index reference_entries_product_id_idx on public.reference_entries(product_id);
create index reference_entries_component_id_idx on public.reference_entries(component_id);
create index reference_entries_ingredient_id_idx on public.reference_entries(ingredient_id);
create index reference_entries_technique_category_id_idx on public.reference_entries(technique_category_id);

create trigger reference_entries_updated_at
  before update on public.reference_entries
  for each row
  execute function update_updated_at_column();
