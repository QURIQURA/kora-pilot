-- 2026-10-20 사용자 요청: CAKE SIZES 이름을 "사이즈+모양+높이"로 자동 구성한다.
-- ROUND/SQUARE는 4~12인치 드롭다운(size_inch), RECTANGLE은 가로·세로·높이 직접 입력(length_mm/width_mm/height_mm).
-- 기존 diameter_mm 값은 삭제하지 않고 보존(화면에서만 사용 안 함).
alter table public.cake_sizes add column size_inch smallint;

update public.cake_sizes
set size_inch = nullif(regexp_replace(name, '[^0-9]', '', 'g'), '')::smallint
where shape in ('ROUND', 'SQUARE');

update public.cake_sizes
set name = size_inch::text || '" ' || initcap(lower(shape))
  || case when height_mm is not null
       then ' ' || trim(trailing '.' from trim(trailing '0' from round(height_mm / 10, 1)::text)) || 'cm'
       else '' end
where shape in ('ROUND', 'SQUARE') and size_inch is not null;
