-- 규격 스펙(뼈대): 최종 완성 사이즈(cake_sizes) 하나가 컴포넌트 역할(시트/크림/필링…)별로
-- "기준(CAPACITY: 몰드 또는 기준중량) × 개수 = 목표 g" 줄들의 합으로 정의된다.
-- 숫자는 레시피 조정이 끝나면 채우는 칸이라 capacity/target 모두 비어 있어도 된다.
create table if not exists public.size_spec_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  cake_size_id uuid not null references public.cake_sizes(id) on delete cascade,
  slot text not null default 'CREAM',
  label text not null default '',
  capacity_id uuid references public.capacities(id) on delete set null,
  capacity_qty numeric not null default 1 check (capacity_qty > 0),
  target_g numeric check (target_g is null or target_g >= 0),
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists size_spec_lines_size_idx on public.size_spec_lines(cake_size_id);
alter table public.size_spec_lines enable row level security;
drop policy if exists "own size_spec_lines" on public.size_spec_lines;
create policy "own size_spec_lines" on public.size_spec_lines
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- R&D 밀도 기록 칸(비어 있어도 됨): 기준(몰드/기준중량)의 부피, 포뮬라 버전의 밀도(g/cm³)
alter table public.capacities add column if not exists volume_cm3 numeric;
alter table public.formula_versions add column if not exists density_g_per_cm3 numeric;

-- 기존 데이터로 첫 줄 채우기: 시트 몰드 연결(sheet_mould_id) → SHEET 줄, cream_g → CREAM 줄
insert into public.size_spec_lines (user_id, cake_size_id, slot, label, capacity_id, capacity_qty, sort_order)
select cs.user_id, cs.id, 'SHEET', '시트', cs.sheet_mould_id, 1, 0
from public.cake_sizes cs
where cs.sheet_mould_id is not null
  and exists (select 1 from public.capacities c where c.id = cs.sheet_mould_id)
  and not exists (select 1 from public.size_spec_lines l where l.cake_size_id = cs.id and l.slot = 'SHEET');
insert into public.size_spec_lines (user_id, cake_size_id, slot, label, target_g, sort_order)
select cs.user_id, cs.id, 'CREAM', '크림', cs.cream_g, 1
from public.cake_sizes cs
where cs.cream_g is not null
  and not exists (select 1 from public.size_spec_lines l where l.cake_size_id = cs.id and l.slot = 'CREAM');
