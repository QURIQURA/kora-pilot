-- DIETARY TAGS: global tag list (SETTINGS) + order links. Additive only; idempotent.
-- Already applied to production on 2026-10-21 (user-approved plan).
create table if not exists public.dietary_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists dietary_tags_user_name_uniq
  on public.dietary_tags (user_id, lower(name));

create table if not exists public.order_dietary_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  dietary_tag_id uuid not null references public.dietary_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (order_id, dietary_tag_id)
);
create index if not exists odt_tag_idx on public.order_dietary_tags (dietary_tag_id);

alter table public.dietary_tags enable row level security;
alter table public.order_dietary_tags enable row level security;
do $$
declare t text;
begin
  foreach t in array array['dietary_tags','order_dietary_tags'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='own '||t) then
      execute format('create policy %I on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', 'own '||t, t);
    end if;
  end loop;
end $$;
