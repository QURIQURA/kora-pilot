# 배합 계산 엔진 — 기준량 집계 · 기능성 재료 · 조성/균형 · N^k 증량

P1에서 재료 원장에 넣은 속성(reference_basis, typical_rate_min/max, bloom, scaling_mode/exponent, comp_*, role_*)을 FORMULA DETAIL 화면의 실제 계산에 연결한다.

## DB 변경 (마이그레이션 1건)

새 테이블 없음. 기존 테이블에 컬럼 추가:

- `formula_version_ingredients.amount_source text NOT NULL DEFAULT 'manual'`
  — 'manual' | 'suggested' | 'copied'. 저장되는 것은 사용자가 확정한 양과 이 출처 플래그뿐.
- `formula_versions.bath_water_g numeric` — 'bath' 기준(침전조 물 양)은 자동 집계 불가이므로 버전별 사용자 입력값을 저장.
- `formula_versions.basis_overrides jsonb NOT NULL DEFAULT '{}'` — 기준량 자동 집계에서 특정 재료를 포함/제외한 사용자 조정 저장.
  형태: `{ "flour": { "exclude": ["<rowIngredientId>"] }, ... }`

기존 행은 전부 'manual'로 시작. CREATE NEW VERSION 복사 시 새 행은 'copied'로, 사용자가 수정하면 'manual'로 변경. basis_overrides와 bath_water_g도 새 버전으로 복사.

## 계산 엔진 — src/lib/formula-calc.ts (신규, 순수 함수)

DB/네트워크 없이 row 배열을 받아 계산만 하는 모듈. 모든 화면 표시는 이 모듈 경유.

- `computeBases(rows)` → 기준량 자동 집계:
  - flour: function key `structure` 또는 `starch`를 가진 비기능성 재료 중량 합계 (toGrams 기준)
  - liquid: 각 재료 `comp_water% × 중량` 실합산. 조성이 없는 재료는 function `water` 보유 시 중량으로 근사
  - fat: `comp_fat` 합산 (없으면 function `fat` 재료 중량)
  - sugar: `comp_sugar` 합산 (없으면 function `sweetener` 재료 중량)
  - total: 배합 총 중량
  - egg_white: name/name_en에 "흰자"/"egg white"가 포함된 재료 합계
  - puree_sugar: sugar와 동일 규칙으로 집계 (별도 퓌레 마커가 없으므로)
  - bath: 자동 집계 없음 — `bath_water_g` 사용자 입력 사용
  - basis_overrides의 include/exclude를 반영하고, 각 기준의 구성 재료 목록도 함께 반환(체크 UI용)
- `functionalRowCalc(row, ingredient, bases)` → { basisLabel, basisGrams, ratePct, recommended [min,max]g, inRange, suggestedAmount(범위 중앙값) }
- `gelatinConvert(amount, recipeBloom, myBloom)` → amount × recipeBloom ÷ myBloom
- `scaledAmount(base, ingredient, N)` → linear: ×N, sub_linear: ×N^k(scaling_exponent), fixed: 그대로. 비선형이면 비례값도 함께 반환
- `compositionTotals(rows, batch)` → 수분/지방/당/단백질/기타고형분/알코올 g + 총고형분 + 파생 지표(수분율=총수분÷flour기준, 물:지방 비, 지방율) + 조성 미입력 재료 목록
- `balanceTotals(rows, batch)` → 강화/연화/습윤/건조 중량 합계와 비율 쌍

## FORMULA DETAIL 화면 변경

**1) BASIS 패널 (신규, 재료 테이블 위)**
- 집계된 기준량 카드 나열: FLOUR 200g / LIQUID 310g / FAT … / SUGAR … / TOTAL … / EGG WHITE … / BATH(입력칸)
- 각 기준을 펼치면 구성 재료 체크박스 목록 — 체크 해제/추가가 basis_overrides에 저장되고 즉시 재집계
- 근사값(조성 없이 function으로 추정한 경우)은 "≈" 표시

**2) 재료 테이블 두 구역 분리**
- [BULK INGREDIENTS] — 기존 표 그대로 (is_functional = false)
- [FUNCTIONAL INGREDIENTS] — 별도 표: INGREDIENT / AMOUNT / UNIT / RATE / BASIS / RECOMMENDED / NOTE
  - RATE: "2.5% of FLOUR 200g" 자동 계산 (표시 전용, 저장 안 함)
  - RECOMMENDED: 권장 범위 가로 막대(회색 띠 + 현재값 눈금, 범위 안=실선 / 밖=점선+방향) + 숫자. 공용 `RangeBar` 컴포넌트로 만들어 P3 조성 대시보드에서 재사용. 모바일(sm 미만)에서는 막대 숨기고 숫자+상태만
  - 구역 상단 요약: 범위 이탈 항목 목록 + "기능성 재료 N개 중 M개 권장값 그대로 — 미검증" (amount_source 집계)
  - 범위 이탈해도 저장 차단 없음 — 정보 표시만
- 기록 모드: 시스템이 양을 자동으로 채우지 않음. 입력하면 RATE/범위 상태만 표시
- 설계 모드: 기능성 재료 추가 후 양이 비어 있으면 회색 제안값 "≈ 4g (2%)"(중앙값×기준량)을 placeholder 스타일로 표시. [적용] 클릭 시에만 실제 값이 되며 amount_source='suggested'. [목표 %로 채우기] 입력도 'suggested'로 기록
- 출처 표시: suggested 행 끝에 작은 "권장값" 뱃지, copied는 "복사됨" 뱃지, manual은 표시 없음(진한 텍스트·실선). 미적용 제안만 흐린 텍스트+점선
- 기준 재료 양 변경 시: 저장된 양은 건드리지 않고 "기준량 변경됨 — N.N%로 다시 맞추기" 버튼 표시
- 젤라틴(bloom 있는 재료): "내 제품 bloom __" 입력 → 환산량 제안(원래량 × 원래블룸 ÷ 내블룸), [적용] 시 'manual'

**3) COMPOSITION 패널 (신규)**
- 총 수분/지방/당/단백질/기타 고형분/총 고형분 (g, %) + 수분율·물:지방·지방율
- 100% 누적 가로 막대 한 줄
- 조성 미입력 재료가 있으면 경고: "재료 N개의 조성 미입력 — 계산이 실제보다 낮게 나옵니다" + 재료명 클릭 시 해당 재료 페이지로 이동

**4) BALANCE 패널 (신규)**
- 강화:연화 / 습윤:건조 비율 막대 2개 (판단 도구 — 정답 범위 없음)
- VERSION HISTORY에서 두 버전 비교 시 양쪽 균형을 함께 계산해 이동 표시 ("연화 +8%" 등)

**5) 배치 증량 N^k**
- ×N 컬럼이 scaledAmount 적용. 비선형 항목은 "5.4g (비례 시 6.0g)" 병기
- process_note 보유 재료 포함 + 배수 ≥ 2 → 배합 상단에 공정 주의 배너
- COMPOSITION/BALANCE 패널도 배치 배수 반영

**모바일**: 각 패널 접이식(Collapsible), 표 가로 스크롤 유지, RangeBar는 숫자로 대체, 입력 16px/48px 터치 규칙 유지.

## 구현 파일

- `src/lib/formula-calc.ts` — 위 순수 함수 전부
- `src/components/pilot/RangeBar.tsx` — 권장 범위/비율 막대 공용 컴포넌트
- `src/components/pilot/formula/BasisPanel.tsx` — 기준량 집계 + 체크 조정
- `src/components/pilot/formula/FunctionalIngredientTable.tsx` — 기능성 구역 (행 동작 전부)
- `src/components/pilot/formula/CompositionPanel.tsx`, `BalancePanel.tsx`
- `src/routes/_authenticated/formulas/$formulaId.tsx` — 두 구역 분리, 패널 배치, 버전 복사 로직에 amount_source/basis_overrides/bath_water_g 복사 추가
- `src/lib/queries.ts` — versionIngredientsQuery에 amount_source 포함

## 확인한 현재 상태

- ingredients의 P1 속성 컬럼 전부 존재, 시드 데이터에 basis/range/scaling 채워져 있음
- ingredient_functions 시스템 키 structure/starch/water/fat/sweetener 존재
- formula_version_ingredients에 amount_source 없음 → 마이그레이션 필요
- 기존 표는 baker's % 기준 재료 수동 선택 방식 → 유지하되 기능성 구역은 기준량 자동 집계 사용

## 검증

- 샘플 배합(밀가루/버터/설탕/젤라틴 등)으로 기준량·RATE·조성·균형 수치 수동 대조
- suggested 적용 전 저장 안 되는지, 버전 복사 시 'copied' 되는지 확인
- 375px 모바일 폭에서 패널/표 확인
