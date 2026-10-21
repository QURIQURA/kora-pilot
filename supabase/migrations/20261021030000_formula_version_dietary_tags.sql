-- Dietary tags declared per formula VERSION (a new version must be re-tagged). Additive, idempotent.
-- Already applied to production on 2026-10-21.
create table if not exists public.formula_version_dietary_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  formula_version_id uuid not null references public.formula_versions(id) on delete cascade,
  dietary_tag_id uuid not null references public.dietary_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (formula_version_id, dietary_tag_id)
);
create index if not exists fvdt_tag_idx on public.formula_version_dietary_tags (dietary_tag_id);
alter table public.formula_version_dietary_tags enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='formula_version_dietary_tags' and policyname='own formula_version_dietary_tags') then
    create policy "own formula_version_dietary_tags" on public.formula_version_dietary_tags for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
