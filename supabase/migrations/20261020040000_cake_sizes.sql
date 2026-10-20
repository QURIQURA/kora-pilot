-- 2026-10-20 사용자 요청: PRODUCT의 "최종 케익 사이즈" 기능을 ORDER의 CAKE SIZE로 옮겨 대체한다.
-- SETTINGS에서 전역 CAKE SIZES 목록(모양/치수/인분/시트 몰드)을 한 번만 등록하고, 주문이 그 중 하나를 고른다.
-- 기존 orders.cake_size(enum)/custom_size 값은 삭제하지 않고 보존(legacy).
create table public.cake_sizes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  shape text,
  diameter_mm numeric,
  length_mm numeric,
  width_mm numeric,
  height_mm numeric,
  servings integer,
  sheet_mould_id uuid references public.moulds(id) on delete set null,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.cake_sizes enable row level security;
create policy "own cake_sizes" on public.cake_sizes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.orders add column cake_size_id uuid references public.cake_sizes(id) on delete set null;

-- 기존 주문에 쓰인 enum 값(Custom 제외)을 이름만으로 시드 — 치수/인분은 추측하지 않고 비워둔다.
insert into public.cake_sizes (user_id, name, sort_order)
select user_id, cake_size::text, row_number() over (partition by user_id order by cake_size::text)
from (select distinct user_id, cake_size from public.orders where cake_size is not null and cake_size::text <> 'Custom') d;

update public.orders o set cake_size_id = c.id
from public.cake_sizes c
where c.user_id = o.user_id and c.name = o.cake_size::text and o.cake_size is not null;
