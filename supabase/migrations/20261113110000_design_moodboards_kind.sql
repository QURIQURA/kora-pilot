alter table public.design_moodboards add column if not exists kind text not null default 'MOOD';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='design_moodboards_kind_check') then
    alter table public.design_moodboards add constraint design_moodboards_kind_check check (kind in ('MOOD','MIND'));
  end if;
end $$;
