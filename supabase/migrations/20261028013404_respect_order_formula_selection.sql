-- A CURRENT promotion must never undo an Order selection of a different formula.
create or replace function public.pilot_current_version_to_production() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare r record;
begin
  if new.status<>'CURRENT' then return new; end if;
  if tg_op='UPDATE' and old.status='CURRENT' then return new; end if;
  for r in select w.id from public.work_session_formula_versions w
    join public.formula_versions v on v.id=w.formula_version_id and v.user_id=new.user_id
    join public.work_sessions s on s.id=w.work_session_id and s.user_id=new.user_id
    join public.orders o on o.id=s.order_id and o.user_id=new.user_id
    where w.user_id=new.user_id and w.kind='CORE' and v.formula_id=new.formula_id and w.formula_version_id<>new.id
      and s.status not in('COMPLETED','CANCELLED') and o.status not in('COMPLETED','CANCELLED')
      and o.dietary_build_id is null
      and (case w.slot when 'SHEET' then o.flavoring_sheet_formula_id when 'CREAM' then o.flavoring_cream_formula_id when 'FILLING' then o.flavoring_filling_formula_id end is null
        or case w.slot when 'SHEET' then o.flavoring_sheet_formula_id when 'CREAM' then o.flavoring_cream_formula_id when 'FILLING' then o.flavoring_filling_formula_id end = new.formula_id)
  loop
    update public.work_session_formula_versions set formula_version_id=new.id
      where id=r.id and user_id=new.user_id;
  end loop;
  return new;
end $$;
