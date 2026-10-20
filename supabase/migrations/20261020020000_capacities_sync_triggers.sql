-- 2026-10-20 버그 수정: "+ NEW MOULD"로 몰드를 새로 만들면 moulds 테이블에는 들어가지만
-- 어제 만든 capacities 테이블에는 매칭되는 행이 자동으로 생기지 않아서, 그 몰드를 바로 골라
-- work_session_formula_versions.capacity_id에 쓰려는 순간
-- "work_session_formula_versions_capacity_id_fkey" 위반 에러가 났다(사용자 리포트).
--
-- moulds/base_weight_presets → capacities로의 동기화가 어제 마이그레이션 시점의 1회성
-- 백필뿐이었던 게 원인 — 이후 INSERT/UPDATE/DELETE는 전혀 반영되지 않았다. 전환 기간 동안
-- 두 쪽 다 UI에서 계속 쓰이므로(MouldManager/BaseWeightManager는 여전히 moulds/
-- base_weight_presets를 직접 CRUD함), capacities가 항상 최신 상태를 유지하도록 트리거로
-- 자동 미러링한다.

create or replace function public.sync_capacity_from_mould() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.capacities where id = OLD.id and kind = 'MOULD';
    return OLD;
  end if;
  insert into public.capacities (id, user_id, kind, name, weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at)
  values (NEW.id, NEW.user_id, 'MOULD', NEW.name, NEW.reference_weight_g, NEW.shape_size, NEW.diameter_mm, NEW.height_mm, NEW.notes, NEW.created_at, NEW.updated_at)
  on conflict (id) do update set
    user_id = excluded.user_id,
    name = excluded.name,
    weight_g = excluded.weight_g,
    shape_size = excluded.shape_size,
    diameter_mm = excluded.diameter_mm,
    height_mm = excluded.height_mm,
    notes = excluded.notes,
    updated_at = excluded.updated_at;
  return NEW;
end;
$$;

create or replace function public.sync_capacity_from_base_weight() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.capacities where id = OLD.id and kind = 'BASE_WEIGHT';
    return OLD;
  end if;
  insert into public.capacities (id, user_id, kind, name, weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at)
  values (NEW.id, NEW.user_id, 'BASE_WEIGHT', NEW.name, NEW.weight_g, null, null, null, NEW.notes, NEW.created_at, NEW.updated_at)
  on conflict (id) do update set
    user_id = excluded.user_id,
    name = excluded.name,
    weight_g = excluded.weight_g,
    notes = excluded.notes,
    updated_at = excluded.updated_at;
  return NEW;
end;
$$;

create trigger trg_sync_capacity_from_mould
  after insert or update or delete on public.moulds
  for each row execute function public.sync_capacity_from_mould();

create trigger trg_sync_capacity_from_base_weight
  after insert or update or delete on public.base_weight_presets
  for each row execute function public.sync_capacity_from_base_weight();

-- 트리거가 없던 동안(어제 백필 이후 ~ 방금 전) 생긴 누락분 백필.
insert into public.capacities (id, user_id, kind, name, weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at)
select id, user_id, 'MOULD', name, reference_weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at
from public.moulds where id not in (select id from public.capacities)
on conflict (id) do nothing;

insert into public.capacities (id, user_id, kind, name, weight_g, shape_size, diameter_mm, height_mm, notes, created_at, updated_at)
select id, user_id, 'BASE_WEIGHT', name, weight_g, null, null, null, notes, created_at, updated_at
from public.base_weight_presets where id not in (select id from public.capacities)
on conflict (id) do nothing;
