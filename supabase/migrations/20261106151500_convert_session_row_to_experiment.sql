-- 생산 세션의 컴포넌트(work_session_formula_versions 행)를 바로 R&D 실험으로 전환한다.
-- 그 행이 쓰던 버전을 복사한 DRAFT 실험 버전을 만들고, 세션 행과 그 TASK들을 새 버전으로 옮긴다.
create or replace function public.convert_session_row_to_experiment(
  p_row_id uuid, p_title text, p_hypothesis text default null)
returns uuid language plpgsql set search_path = '' as $$
declare uid uuid := auth.uid(); r public.work_session_formula_versions; v public.formula_versions;
  exp_id uuid; new_version uuid;
begin
  if uid is null then raise exception '로그인이 필요합니다'; end if;
  select * into r from public.work_session_formula_versions where id = p_row_id and user_id = uid for update;
  if not found then raise exception '세션 컴포넌트를 찾을 수 없습니다'; end if;
  select * into v from public.formula_versions where id = r.formula_version_id and user_id = uid;
  if exists (select 1 from public.formula_experiments x
             where x.version_id = r.formula_version_id and x.status = 'OPEN') then
    raise exception '이미 R&D 실험 중인 버전입니다';
  end if;
  exp_id := public.start_formula_experiment(v.formula_id, v.id, p_title, p_hypothesis);
  select version_id into new_version from public.formula_experiments where id = exp_id;
  update public.work_session_formula_versions
    set formula_version_id = new_version, version_pinned = true where id = r.id;
  update public.work_session_tasks set formula_version_id = new_version
    where work_session_id = r.work_session_id and formula_version_id = v.id;
  return exp_id;
end; $$;
revoke all on function public.convert_session_row_to_experiment(uuid,text,text) from public, anon;
grant execute on function public.convert_session_row_to_experiment(uuid,text,text) to authenticated;
