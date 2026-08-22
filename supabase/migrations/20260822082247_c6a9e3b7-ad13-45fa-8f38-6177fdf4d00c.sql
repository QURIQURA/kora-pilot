create type public.experiment_status as enum ('PLANNED','RUNNING','COMPLETE','FAILED','CANCELLED');

create table public.experiments (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_number integer,
  product_id uuid references public.products(id) on delete set null,
  component_id uuid references public.components(id) on delete set null,
  formula_version_id uuid references public.formula_versions(id) on delete set null,
  mould_id uuid references public.moulds(id) on delete set null,
  batch_multiplier numeric not null default 1,
  date date not null default current_date,
  status public.experiment_status not null default 'PLANNED',
  hypothesis text,
  variables text,
  control_variables text,
  result text,
  conclusion text,
  next_experiment text,
  ai_interpretation text,
  notes text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (user_id, experiment_number)
);

grant select, insert, update, delete on public.experiments to authenticated;
grant all on public.experiments to service_role;

alter table public.experiments enable row level security;

create policy "own experiments" on public.experiments for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.assign_experiment_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.experiment_number is null then
    perform pg_advisory_xact_lock(hashtext(new.user_id::text));
    select coalesce(max(experiment_number), 0) + 1
      into new.experiment_number
      from public.experiments
     where user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger experiments_assign_number
  before insert on public.experiments
  for each row execute function public.assign_experiment_number();

create trigger experiments_updated_at
  before update on public.experiments
  for each row execute function public.update_updated_at_column();

create table public.observations (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  experiment_id uuid not null references public.experiments(id) on delete cascade,
  label text not null default '',
  value text not null default '',
  note text,
  created_at timestamp with time zone not null default now()
);

grant select, insert, update, delete on public.observations to authenticated;
grant all on public.observations to service_role;

alter table public.observations enable row level security;

create policy "own observations" on public.observations for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);