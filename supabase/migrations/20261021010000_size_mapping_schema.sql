-- Size unification: finished/mould dimensions on product_sizes + mapping audit log.
-- Idempotent. Already applied to production on 2026-10-21 via the reviewed mapping script;
-- the data mapping itself (batch 'size-map-20261021') is intentionally NOT part of this file.
alter table public.product_sizes
  add column if not exists mould_diameter_mm numeric,
  add column if not exists finished_diameter_mm numeric,
  add column if not exists finished_height_mm numeric;

create table if not exists public.size_mapping_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  batch text not null,
  target_table text not null,
  target_id uuid not null,
  action text not null,
  before_values jsonb,
  after_values jsonb not null,
  created_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  unique (batch, target_table, target_id)
);
alter table public.size_mapping_log enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'size_mapping_log' and policyname = 'own size_mapping_log') then
    create policy "own size_mapping_log" on public.size_mapping_log for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
