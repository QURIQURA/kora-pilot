-- TECHNIQUE CATEGORY taxonomy v1 재정비 (사용자 확정, 2026-08-29).
-- 매핑 원칙:
--   1) 기존 최상위 4개 그룹 이름을 v1 번호/이름 체계에 맞춤 (구조는 유지)
--   2) "오일폼 케이크"는 별도 카테고리에서 제거하고, CHIFFON은 "폼 케이크"로 재연결.
--      "오일 유화법(Oil Emulsion)"은 폼 케이크 소속 METHOD로 신설 — Formula가 없으므로
--      실제 Formula-Method 연결은 CHIFFON의 첫 FORMULA 생성 시점으로 미룸.
--   3) "무스"는 "크림·필링 → 휘핑크림"의 3단계 자식이었던 걸 최상위 "02. MOUSSE"로 승격.
--   4) "슈(Choux)"는 위치 변경 없음 — 페이스트리(→09. DOUGH & PASTRY) 안에 그대로 유지
--      (사용자 확정: Choux는 Cake/Sponge 계열이 아니라 가열 반죽(Panade) 기반 별도 기법).
--   5) "멜티드팻 케이크", "초콜릿 베이스 크림"은 사용자 확정대로 위치 변경 없이 유지.
--   6) 실사용 중인 기존 항목은 임의로 삭제/병합하지 않음.
--   7) v1의 나머지 대분류(02 MOUSSE 제외 04~08, 11~12)는 빈 최상위 카테고리로만 생성 —
--      하위 항목은 실제 COMPONENT/FORMULA가 생기면서 추가.
--   8) components.technique_category_id는 이번 migration에서 유지 (FORMULA 데이터/화면이
--      생기고 안전하게 이전된 뒤 별도 migration에서 제거 예정).
--   9) FORMULA가 0건이므로 이번 migration은 FORMULA 데이터 이전을 포함하지 않음.

-- 1) CHIFFON 컴포넌트를 "오일폼 케이크"에서 "폼 케이크"로 재연결
update public.components
  set technique_category_id = '67ffbb6d-fe15-4e33-9138-e217a30911a3' -- 폼 케이크 / Foam Cake
  where technique_category_id = '7d99745d-2ee1-4779-9c2e-806e5122d66e'; -- 오일폼 케이크 / Oil Foam Cake

-- 2) "오일 유화법(Oil Emulsion)" METHOD를 "폼 케이크" 소속으로 신설
insert into public.methods (user_id, technique_category_id, name, name_en, sort_order, notes)
select user_id, '67ffbb6d-fe15-4e33-9138-e217a30911a3', '오일 유화법', 'Oil Emulsion', 1,
  'CHIFFON류. 첫 FORMULA 생성 시 이 METHOD로 연결 예정 (2026-08-29 taxonomy 재정비 시점엔 FORMULA 0건).'
from public.technique_categories
where id = '67ffbb6d-fe15-4e33-9138-e217a30911a3';

-- 3) "오일폼 케이크" 카테고리 삭제 (컴포넌트 재연결 완료 후)
delete from public.technique_categories
  where id = '7d99745d-2ee1-4779-9c2e-806e5122d66e';

-- 4) "무스"를 최상위 "02. MOUSSE"로 승격 (기존: 크림·필링 → 휘핑크림 → 무스, 3단계 체인 해소)
update public.technique_categories
  set parent_id = null,
      name_en = 'Mousse',
      sort_order = 2
  where id = '2ec50c46-c768-489b-bd1c-1a4e0b8f4ed3';

-- 5) 기존 최상위 4개 그룹 — 이름(name_en)/순서만 v1에 맞춰 정리, 구조는 유지
update public.technique_categories set name_en = 'Cake & Sponge', sort_order = 1
  where id = 'e4587110-d718-4aec-aa99-c4a2c7ac79b7'; -- 케이크
update public.technique_categories set name_en = 'Cream & Filling', sort_order = 3
  where id = 'df00c5c1-48e5-4203-b513-7821fb6b0259'; -- 크림 · 필링
update public.technique_categories set name_en = 'Dough & Pastry', sort_order = 9
  where id = 'f446863e-8d2b-4149-a47a-13fd3d02fa23'; -- 페이스트리 (Choux 포함 그대로 유지)
update public.technique_categories set name_en = 'Meringue', sort_order = 10
  where id = '11bfd0fc-01a0-4463-b232-716f11b7073d'; -- 머랭

-- 6) v1 나머지 대분류를 빈 최상위 카테고리로 신설 (하위 항목 없이, 필요시 나중에 추가)
insert into public.technique_categories (user_id, name, name_en, parent_id, sort_order)
select user_id, name, name_en, null, sort_order
from (
  select
    (select user_id from public.technique_categories where id = 'e4587110-d718-4aec-aa99-c4a2c7ac79b7') as user_id,
    v.name, v.name_en, v.sort_order
  from (values
    ('과일', 'Fruit', 4),
    ('겔 · 젤리화', 'Gel & Gelified', 5),
    ('크런치 · 텍스처', 'Crunch & Texture', 6),
    ('초콜릿', 'Chocolate', 7),
    ('설탕 · 캐러멜', 'Sugar & Caramel', 8),
    ('글레이즈 · 코팅', 'Glaze & Coating', 11),
    ('피니싱 · 데코레이션', 'Finishing & Decoration', 12)
  ) as v(name, name_en, sort_order)
) seed;
