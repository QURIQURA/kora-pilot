alter table public.design_moodboards add column if not exists mindmap jsonb not null default '{}'::jsonb;
