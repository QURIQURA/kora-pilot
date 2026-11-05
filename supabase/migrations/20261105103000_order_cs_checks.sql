-- 2026-11-05: Customer care checklist on the PILOT order page (ORDER DETAIL tab).
-- One row per completed (step, channel). Channel is TEXT (SMS) or EMAIL.
create table if not exists public.order_cs_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  step text not null,
  channel text not null check (channel in ('TEXT', 'EMAIL')),
  done_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (order_id, step, channel)
);

alter table public.order_cs_checks enable row level security;

drop policy if exists "own order_cs_checks" on public.order_cs_checks;
create policy "own order_cs_checks" on public.order_cs_checks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.order_cs_checks to authenticated;
