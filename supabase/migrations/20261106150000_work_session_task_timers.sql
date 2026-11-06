-- 작업 TASK마다 타이머를 여러 개 두고 타이머별 메모를 남길 수 있게 한다.
-- 형식: [{ id, label, minutes, started_at, done_at }]
alter table public.work_session_tasks
  add column if not exists timers jsonb not null default '[]'::jsonb;
