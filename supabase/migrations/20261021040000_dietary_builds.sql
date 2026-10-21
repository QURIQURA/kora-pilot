-- DIETARY BUILD: saved formula-version combinations per product + dietary tags; orders.dietary_build_id (nullable).
-- Additive, idempotent. Already applied to production on 2026-10-21.
create table if not exists public.dietary_builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  product_id uuid references public.products(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.dietary_build_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  build_id uuid not null references public.dietary_builds(id) on delete cascade,
  dietary_tag_id uuid not null references public.dietary_tags(id) on delete cascade,
  unique (build_id, dietary_tag_id)
);
create table if not exists public.dietary_build_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  build_id uuid not null references public.dietary_builds(id) on delete cascade,
  component_id uuid not null references public.components(id) on delete cascade,
  formula_version_id uuid not null references public.formula_versions(id) on delete restrict,
  sort_order integer not null default 0,
  unique (build_id, component_id)
);
create index if not exists dbt_tag_idx on public.dietary_build_tags (dietary_tag_id);
create index if not exists dbi_version_idx on public.dietary_build_items (formula_version_id);
alter table public.orders
  add column if not exists dietary_build_id uuid references public.dietary_builds(id) on delete set null;

alter table public.dietary_builds enable row level security;
alter table public.dietary_build_tags enable row level security;
alter table public.dietary_build_items enable row level security;
do $$
declare t text;
begin
  foreach t in array array['dietary_builds','dietary_build_tags','dietary_build_items'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='own '||t) then
      execute format('create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', 'own '||t, t);
    end if;
  end loop;
end $$;
