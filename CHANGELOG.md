# KORA PILOT — 기능 변경 기록 (사용자용)

개발 진행 중 추가/변경된 기능을 시간순으로 남깁니다. 각 항목에는 "무엇이 달라졌는지"와 "직접 눌러서 확인하는 방법"을 같이 적습니다.

---

## 2026-09-22 — PRODUCTION: 배수 표시가 반올림되어 다르게 보이던 문제 수정

**무엇이 달라졌나**
- WEIGHING MATRIX 표 상단의 "×N" 배수 표시와 FORMULA VIEW의 배수 표시가 소수점 첫째 자리까지만 반올림되고 있어서, 몰드 기준 자동 계산으로 나온 ×5.99 같은 값이 "×6"으로 보이던 문제를 고쳤습니다 (실제 계산 자체는 5.99로 정확하게 적용되고 있었고, 화면 표시만 반올림된 것이었습니다). 이제 소수점 둘째 자리까지 정확히 표시됩니다.
- Work Session 배수 변경 히스토리(HISTORY)의 표시도 동일하게 소수점 둘째 자리까지 보이도록 맞췄습니다.

**확인하는 방법**
1. 몰드 기준 반죽량으로 배수가 ×5.99처럼 소수점이 있는 값으로 계산된 Formula Version을 WEIGHING MATRIX에서 확인합니다.
2. 표 상단 컬럼 헤더에 "×6"이 아니라 "×5.99"로 정확히 표시되는지 확인합니다.

## 2026-09-22 — PRODUCTION: 몰드 기준으로 배수 자동 계산

**무엇이 달라졌나**
- 몰드(MOULD)마다 "기준 반죽량(g)" — 그 몰드를 가득 채우는 데 실제로 필요한 반죽/생지 무게 — 를 등록할 수 있게 됐습니다. SETTINGS의 MOULDS 목록과 몰드 생성 폼에서 입력합니다.
- PRODUCTION에서 Formula Version을 추가하거나 배수를 조정할 때, MOULD + 개수(QTY)를 고르면 배수(×N)가 자동으로 계산되어 채워집니다. 예: 기본 레시피가 6인치인데 8인치 몰드 3개를 만들고 싶다면 MOULD를 8인치로, QTY를 3으로 고르면 배수가 자동으로 나옵니다.
- 배수를 직접 손으로 수정해서 몰드 기준값과 달라지면 "CUSTOM"으로 표시되어 더 이상 그 몰드와 정확히 대응하지 않는다는 걸 알 수 있습니다.
- 몰드에 기준 반죽량이 아직 등록되지 않았다면 안내 문구가 표시됩니다.

**확인하는 방법**
1. SETTINGS → MOULDS에서 몰드 하나를 골라 "기준(g)"에 실측 반죽량을 입력합니다 (예: 시폰틀 6" = 340g, 8" = 620g).
2. PRODUCTION의 Work Session에서 "+ ADD FORMULA VERSION"으로 Formula를 추가할 때 MOULD와 QTY를 선택하면 MULTIPLIER ×N이 자동으로 계산되는지 확인합니다.
3. 이미 추가된 Formula Version 목록에서도 MOULD/QTY를 바꾸면 배수가 즉시 재계산되어 저장되는지 확인합니다.

## 2026-09-22 — FORMULA: YIELD & BATCH 위치 조정 + 배치 열 삭제 버튼 개선

**무엇이 달라졌나**
- YIELD & BATCH를 INGREDIENTS 표보다 위로 옮겼습니다. 이제 BATCH ×N 숫자를 바꾸면 스크롤 없이 바로 아래 표가 반응하는 걸 볼 수 있습니다.
- YIELD & BATCH 박스를 상단 SAVE 박스와 동일하게 한 줄짜리 컴팩트 박스로 줄였습니다.
- INGREDIENTS 표의 배치 열(×N 프리셋)에서 삭제 버튼이 너무 작아 누르기 어려웠던 문제를 고쳤습니다. 이제 열 아래에 "✕ 열 삭제" 버튼이 별도 줄로 크게 표시되어 실수 없이 누를 수 있습니다. (삭제 자체는 원래도 정상 동작했으나 버튼이 작아 누르기 어려웠던 것으로 확인)

**확인하는 방법**
1. Formula 상세 페이지를 엽니다 — YIELD & BATCH가 INGREDIENTS 표 바로 위, 작은 박스로 보입니다.
2. BATCH ×N 값을 바꾸면 바로 아래 표의 숫자가 즉시 바뀝니다.
3. INGREDIENTS 표에서 "+ ADD BATCH"로 배치 열을 추가한 뒤, 그 열 하단의 "✕ 열 삭제" 버튼을 눌러 정상적으로 삭제되는지 확인합니다.

## 2026-09-22 — PRODUCTION 보조 계량 표시 안 되던 진짜 원인 수정

**무엇이 달라졌나**
- 바로 전 항목에서 WEIGHING MATRIX에 보조 계량(계란 갯수 등)을 표시하도록 코드를 추가했는데도 화면에 안 뜨던 문제를 고쳤습니다. 원인은 PRODUCTION 페이지가 재료를 불러올 때 쓰는 별도의 조회 쿼리(`versionIngredientsBulkQuery`)가 애초에 보조 계량 칼럼(secondary_amount/secondary_unit)을 DB에서 가져오지도 않고 있었던 것 — 표시 코드는 맞았지만 데이터 자체가 항상 비어 있었습니다. 이제 이 쿼리도 보조 계량 칼럼을 함께 가져옵니다.

**확인하는 방법**
1. 계란처럼 보조 계량을 입력해둔 재료가 포함된 Formula로 PRODUCTION 작업 세션을 만듭니다.
2. WEIGHING MATRIX 표에서 그램수 아래에 "· N개"가 실제로 표시되는지 확인합니다.

---

## 2026-09-22 — PRODUCTION WEIGHING MATRIX에도 보조 계량(계란 갯수 등) 표시

**무엇이 달라졌나**
- PRODUCTION 페이지 WEIGHING MATRIX 표에서 그램수만 보이고 보조 계량(예: 계란 "· 3개")이 빠져 있던 것을 고쳤습니다. Formula 페이지/버전 비교 시트와 동일하게 그램수 아래에 "· N개"로 함께 표시되고, 그 칸의 배수(×1, ×2 등)만큼 자동으로 곱해서 보여줍니다.

**확인하는 방법**
1. 계란처럼 보조 계량을 입력해둔 재료가 포함된 Formula로 PRODUCTION 작업 세션을 만듭니다.
2. WEIGHING MATRIX 표에서 그램수 아래에 보조 계량이 배수만큼 곱해져 표시되는지 확인합니다.

---

## 2026-09-22 — FORMULA 페이지: 상단 부가 정보 한 박스로 정리 + 배치 관련 항목 재배치

**무엇이 달라졌나**
- 페이지 상단의 기법/방법/기준 배합 체크박스/컴포넌트 선택과 SAVE/되돌리기 버튼이 각각 크게 따로 떨어져 있던 것을 하나의 작은 박스로 모으고 버튼 크기도 줄였습니다 — 중요도가 낮은 부가 정보라 화면을 덜 차지하도록 했습니다.
- INGREDIENTS를 페이지 맨 위로 올리면서 그 아래 있던 YIELD & BATCH(배치 미리보기 "BATCH ×N")와의 사이에 버전 선택 박스가 끼어들어 있었는데, 다시 INGREDIENTS 바로 다음이 YIELD & BATCH가 되도록 순서를 바꿨습니다 — "+ ADD BATCH"로 배치를 추가하는 곳과 배치 미리보기가 서로 가깝게 붙어서 쓰기 편해집니다. 버전 선택/상태 변경 박스는 그 아래로 내려갔습니다.

**확인하는 방법**
1. FORMULA 상세 페이지를 열어 상단의 기법/방법/체크박스/컴포넌트/SAVE가 하나의 작은 박스에 모여 있는지 확인합니다.
2. INGREDIENTS 바로 아래에 YIELD & BATCH가 오고, 그 다음에 버전 선택 박스가 오는지 확인합니다.

---

## 2026-09-22 — PRODUCTION WEIGHING MATRIX: 엑셀처럼 행/열 드래그 + 크기 조절

**무엇이 달라졌나**
- PRODUCTION 페이지 WORK VIEW의 WEIGHING MATRIX 표에서, Component/Formula 페이지의 버전 비교 시트와 동일하게 재료 행과 포뮬라 버전 열을 실제 엑셀처럼 드래그로 순서를 바꿀 수 있습니다. 각 행/열 앞의 손잡이(⠿)를 잡고 드래그하면 됩니다.
- 열 오른쪽 경계, 행 아래쪽 경계를 마우스로 드래그하면 너비/높이를 조절할 수 있습니다. INGREDIENT 열도 마찬가지로 너비 조절이 가능하고, 텍스트가 버전 열 쪽(오른쪽)으로 붙습니다.
- 표가 화면(패널)보다 좁을 때 남는 빈 공간에도 각 행의 구분선이 자연스럽게 끝까지 이어집니다.
- 이 순서/크기 조절은 화면을 보는 동안만 유지되는 "보기 편의" 기능입니다 — 새로고침하면 원래 선택 순서로 돌아갑니다. 그램수 입력/체크 상태/SHORTAGE 메모 등 실제 계량 작업 방식은 그대로입니다. 첫 번째 열(INGREDIENT)과 헤더 행은 스크롤해도 고정되어 보이는 것도 그대로 유지됩니다.

**확인하는 방법**
1. PRODUCTION 페이지의 WORK VIEW → WEIGHING MATRIX 탭을 엽니다 (포뮬라 버전이 2개 이상 선택되어 있으면 더 잘 보입니다).
2. 재료 행 앞, 포뮬라 버전 열 헤더의 ⠿ 손잡이를 드래그해서 순서를 바꿔봅니다.
3. 열 오른쪽 경계, 행 아래쪽 경계, INGREDIENT 열 오른쪽 경계에 마우스를 올려 커서가 바뀌는지, 드래그하면 크기가 조절되는지 확인합니다.

---

## 2026-09-22 — FORMULA 페이지: UNLOCK→EDIT 없애고 바로 수정 + SAVE 버튼 + INGREDIENTS를 맨 위로

**무엇이 달라졌나**
- FORMULA 상세 페이지에서 UNLOCK → EDIT 두 단계를 거쳐야 재료를 수정할 수 있던 것을 완전히 없앴습니다. 이제 페이지를 열면 바로 이름/기법/몰드/YIELD/노트/재료/배수 프리셋을 수정할 수 있습니다.
- 상단에 항상 보이는 SAVE 버튼이 새로 생겼습니다. 아무것도 바꾸지 않았을 때는 비활성화(회색)이고, 뭔가 하나라도 바꾸면 바로 활성화됩니다. 저장 전까지는 "변경 사항이 있습니다 — 저장하려면 SAVE"라는 안내가 뜹니다. 실수로 바꾼 걸 되돌리고 싶으면 SAVE 옆의 "되돌리기"를 누르면 마지막 저장 상태로 복원됩니다.
- 재료와 수량을 직접 수정하는 INGREDIENTS 표를 페이지 맨 위(제목/SAVE 바로 다음)로 올렸습니다 — 버전 선택/상태 같은 부가 정보는 그 아래로 내려갔습니다. 이제 페이지를 열자마자 스크롤 없이 바로 재료 수정이 보입니다.
- READ ONLY 배너와 UNLOCK/RE-LOCK 버튼은 삭제했습니다. 확정된(SUPERSEDED 등) 버전이라도 바로 수정할 수 있습니다 — 안전하게 새 버전을 남기고 싶으면 지금처럼 "+ NEW VERSION"을 사용하시면 됩니다.

**확인하는 방법**
1. FORMULA 상세 페이지를 엽니다 — UNLOCK/EDIT 버튼 없이 바로 재료 칸에 값을 입력할 수 있는지 확인합니다.
2. 재료 맨 위(INGREDIENTS)가 페이지 상단에 바로 보이는지 확인합니다.
3. 아무것도 안 바꿨을 때 SAVE 버튼이 비활성화 상태인지, 값을 하나 바꾸면 활성화되는지 확인합니다.
4. 값을 바꾼 뒤 "되돌리기"를 누르면 원래 값으로 돌아오는지 확인합니다.

---

## 2026-09-22 — 버전 비교 시트: 보조 계량(계란 갯수 등)도 함께 표시

**무엇이 달라졌나**
- 버전 비교 시트(Component 페이지, Formula 상세 페이지 SNAPSHOT HISTORY 공통)의 각 칸에서, 그램수만 보이고 보조 계량(예: 계란 "· 3개")이 빠져 있던 것을 고쳤습니다. FORMULA 페이지 재료 표에서 쓰던 것과 동일한 "그램수 · 보조계량단위" 형식으로 함께 보이도록 했습니다.

**확인하는 방법**
1. 보조 계량(예: 계란 개수)을 입력해둔 재료가 있는 Formula의 버전 비교 시트를 엽니다.
2. 해당 재료 칸에 그램수 옆에 "· 3개"처럼 보조 계량이 같이 뜨는지 확인합니다.

---

## 2026-09-22 — 버전 비교 시트: INGREDIENT 텍스트 오른쪽 정렬

**무엇이 달라졌나**
- 버전 비교 시트에서 INGREDIENT 헤더와 재료명 텍스트가 버전 열 쪽(오른쪽)으로 붙도록 정렬을 바꿨습니다. 드래그 손잡이(⠿)는 그대로 왼쪽에 고정되어 있습니다.

**확인하는 방법**
1. 버전 비교 시트를 열어 INGREDIENT 헤더와 재료명들이 열 오른쪽 끝에 붙어 보이는지 확인합니다.

## 2026-09-22 — 버전 비교 시트: INGREDIENT 열도 너비 조절 + 빈 공간 점선 이어짐

**무엇이 달라졌나**
- INGREDIENT(재료명) 열도 다른 버전 열들처럼 오른쪽 경계를 드래그해서 너비를 조절할 수 있습니다.
- 표의 실제 열 너비 합계보다 화면(패널)이 넓을 때, 예전에는 그 남는 공간이 그냥 빈 배경으로 뚝 끊겨 보였습니다. 이제 그 공간에도 각 재료 행의 점선 구분선이 화면 끝까지 자연스럽게 이어집니다.

**확인하는 방법**
1. 버전 비교 시트에서 INGREDIENT 헤더 오른쪽 경계에 마우스를 올려 커서가 바뀌는지, 드래그하면 너비가 늘거나 줄어드는지 확인합니다.
2. 열 너비를 좁게 줄여서 표 오른쪽에 빈 공간이 생기게 한 뒤, 그 공간에도 각 행의 가로 점선/실선이 자연스럽게 이어지는지 확인합니다.

## 2026-09-22 — 버전 비교 시트: 열 너비 조절 후 다시 늘어나지 않던 버그 수정

**무엇이 달라졌나**
- 버전 비교 시트에서 열(버전) 너비를 한 번 줄이면 다시 늘리려고 드래그해도 반응이 없던 버그를 고쳤습니다. 표 전체 너비를 "화면 꽉 채우기"로 두고 있었는데, 실제 열 너비 합계가 그보다 좁을 때 브라우저가 남는 공간을 마음대로 다시 배분해버려서 생긴 문제였습니다. 이제 표 너비를 열 너비 합계에 정확히 맞춰서, 줄였다 늘였다를 자유롭게 할 수 있습니다.

**확인하는 방법**
1. 버전 비교 시트에서 아무 버전 열이나 오른쪽 경계를 드래그해서 줄여봅니다.
2. 같은 경계를 다시 드래그해서 원래보다 넓게 늘려봅니다 — 이제 잘 늘어나는지 확인합니다.

## 2026-09-22 — 버전 비교 시트: 엑셀처럼 행/열 드래그로 이동 + 크기 조절

**무엇이 달라졌나**
- 버전 비교 시트(Component 페이지의 CURRENT FORMULA 패널, Formula 상세 페이지의 SNAPSHOT HISTORY 둘 다)에서 이제 실제 엑셀처럼 행(재료)과 열(버전)을 드래그해서 순서를 바꿀 수 있습니다. 각 행/열 앞의 손잡이(⠿)를 눌러서 드래그하면 됩니다.
- 열(버전) 오른쪽 경계, 행(재료) 아래쪽 경계를 마우스로 드래그하면 너비/높이를 조절할 수 있습니다.
- 이 순서/크기 조절은 화면을 보는 동안만 유지되는 "보기 편의" 기능입니다 — 새로고침하거나 다시 열면 원래 순서(버전은 V1→V2→..., 재료는 공정 순서)로 돌아갑니다. 실제 재료 순서(공정 순서)를 바꾸려면 지금처럼 Formula 상세 페이지의 INGREDIENTS 표에서 드래그하면 됩니다.
- NEW/변경됨/삭제됨 표시는 열 순서를 바꿔도 항상 실제 버전 시간순(V1→V2→...) 기준으로 정확하게 계산됩니다.

**확인하는 방법**
1. 버전이 2개 이상인 Formula의 버전 비교 시트를 엽니다 (Component 페이지 또는 Formula 상세 페이지).
2. 재료 행 앞의 ⠿ 손잡이를 드래그해서 순서를 바꿔봅니다.
3. 버전 열 헤더의 ⠿ 손잡이를 드래그해서 열 순서를 바꿔봅니다.
4. 열 오른쪽 경계, 행 아래쪽 경계에 마우스를 올리면 커서가 바뀌는지 확인하고 드래그해서 크기를 조절해봅니다.

## 2026-09-22 — 버전 비교 시트: NEW 뱃지는 진짜 추가된 재료에만

**무엇이 달라졌나**
- 버전 비교 시트에서 V1(맨 처음 버전) 컬럼의 모든 재료에 NEW 뱃지가 붙던 문제를 고쳤습니다. V1은 이미 그 버전 자체가 CURRENT/SUPERSEDED 뱃지로 구분되니, 그 안의 재료들까지 전부 NEW로 표시할 필요가 없다는 피드백을 반영했습니다.
- 이제 NEW 뱃지는 V2 이후 버전에서 실제로 새로 추가된 재료(예: V2의 구연산)에만 붙습니다.

**확인하는 방법**
1. 버전이 2개 이상인 Formula(또는 그 Component 페이지)의 버전 비교 시트를 엽니다.
2. 맨 왼쪽(가장 오래된) 버전 컬럼에는 NEW 뱃지가 하나도 없는지 확인합니다.
3. 이후 버전에서 새로 추가된 재료에만 NEW 뱃지가 붙는지 확인합니다.

## 2026-09-22 — COMPONENT 페이지에서도 버전 비교 시트 바로 보기

**무엇이 달라졌나**
- COMPONENT 페이지의 CURRENT FORMULA 패널이, 현재 버전 재료 리스트만 보여주던 것에서 이 Formula의 모든 버전을 컬럼으로 나란히 비교하는 "버전 비교 시트"로 바뀌었습니다. Formula 상세 페이지(SNAPSHOT HISTORY)에서 만든 것과 완전히 같은 시트를 공유해서 보여줍니다.
- 예: V1에서 tartar를 쓰고 V2에서 citric acid로 바꿨다면, 이제 Component 페이지만 봐도 두 버전이 나란히 보이고 뭐가 바뀌었는지 바로 알 수 있습니다 — Formula를 따로 열 필요 없음.
- Formula 상세 페이지(OPEN FULL FORMULA)는 그대로입니다 — 위쪽 버전 선택 드롭다운으로 원하는 버전을 골라서 수정하는 방식은 변경 없음. 실제 재료 수정/저장은 항상 이 화면에서만 합니다.
- TOTAL WEIGHT/INGREDIENTS/UPDATED 요약 숫자는 지금처럼 현재(CURRENT) 버전 기준으로 계속 보여줍니다.

**확인하는 방법**
1. 버전이 2개 이상인 Formula를 가진 Component 페이지를 엽니다.
2. CURRENT FORMULA 패널에 재료 리스트 대신 버전별 컬럼(V1, V2, ...)이 있는 표가 보이는지 확인합니다.
3. 값이 바뀐 셀은 진하게 강조되고, 새로 추가된 재료는 NEW 표시, 빠진 재료는 취소선 "삭제됨"으로 보이는지 확인합니다.
4. "OPEN FULL FORMULA →"를 눌러서 기존처럼 버전을 선택해 수정할 수 있는지 확인합니다.

## 2026-09-22 — SNAPSHOT HISTORY: 버전 비교를 엑셀 시트처럼 한 번에 보기

### 무엇이 달라졌나

- FORMULA 상세 페이지의 SNAPSHOT HISTORY에서, 두 버전만 골라 비교하던 "COMPARE FROM/TO" 방식을 없애고 **이 Formula의 모든 버전(V1, V2, V3...)을 한 표에 열로 나란히** 보여주는 비교 시트로 바꿨습니다.
- 재료가 행, 버전이 열입니다. 어떤 재료가 어느 버전에서 **새로 추가됐는지("NEW" 표시)**, **양이 바뀌었는지(진하게 강조)**, **빠졌는지("삭제됨")**가 표 하나로 바로 보입니다.
- 재료 순서는 처음 등장한 버전에서의 공정 순서를 따릅니다 — 나중 버전에서 새로 추가된 재료는 자연스럽게 아래쪽에 붙습니다.
- 버전 간 균형(연화/습윤 등) 비교 기능은 이번에 함께 없앴습니다 — 필요하시면 다시 말씀해주세요.

### 확인하는 방법

FORMULA 상세 페이지 → SNAPSHOT HISTORY 섹션에서 버전들이 표의 열로 나란히 보이는지, 재료 양이 바뀐 칸이 강조되는지 확인.

---

## 2026-09-22 — COMPONENT ↔ FORMULA 이동 개선 + 재료명/그램수 간격 좁힘

### 무엇이 달라졌나

- FORMULA 상세 페이지에 **제목 바로 위에 "← [COMPONENT 이름]" 링크**가 새로 생겼습니다. 스크롤 없이 페이지 맨 위에서 바로 원래 있던 Component로 돌아갈 수 있습니다 (기존 "OPEN COMPONENT" 버튼은 기법/방법 선택 칸들 사이에 묻혀 있어서 찾기 불편했던 것을 이걸로 대체).
- 상단 경로 표시(breadcrumb)도 "PILOT / FORMULAS / ..." 대신 **"PILOT / COMPONENTS / [컴포넌트 이름] / [포뮬라 이름] / 버전"** 순으로 바뀌어서, 지금 보고 있는 포뮬라가 어느 Component에 속하는지 항상 보입니다.
- Component 페이지 CURRENT FORMULA 미리보기에서 재료명과 그램수 사이 점선이 패널 전체 너비까지 늘어나던 것을 좁혀서, 이름과 숫자가 서로 가깝게 붙어 보이도록 했습니다.

### 확인하는 방법

Component 상세 → OPEN FULL FORMULA로 이동 → 제목 위 "← [컴포넌트 이름]" 링크로 바로 돌아와지는지 확인. Component 페이지의 재료 목록에서 이름/그램수 간격이 좁아졌는지 확인.

---

## 2026-09-22 — INGREDIENTS 표에서 NOTE 칸 제거

### 무엇이 달라졌나

- FORMULA 페이지 INGREDIENTS 표에서 재료별 NOTE 입력칸을 없앴습니다. 배치별 개수 표기 같은 용도는 이제 보조 계량(그램 옆 "· 3개")과 배치 열 자동 배수 기능으로 대체되어 더 이상 필요하지 않다고 판단했습니다.
- 기존에 입력해두신 NOTE 값은 DB에는 그대로 남아있고 삭제되지 않습니다 — 화면에서만 안 보이는 것이며, 나중에 다시 필요해지면 복원할 수 있습니다.

### 확인하는 방법

FORMULA 상세 페이지 → INGREDIENTS 표에 NOTE 열이 없는지 확인.

---

## 2026-09-22 — COMPONENT 페이지 CURRENT FORMULA: 전체 재료 표시 + 가독성 개선

### 무엇이 달라졌나

- Component 페이지의 CURRENT FORMULA 미리보기가 이제 **재료 6개까지만 보여주고 "+3개 재료 더 있음"으로 자르던 것을 없애고, 전체 재료를 다 보여줍니다.** OPEN FULL FORMULA를 누르지 않아도 바로 전체 배합을 볼 수 있습니다.
- 목록 순서도 무게순이 아니라 **공정 순서(재료 표에서 드래그로 정한 순서)** 그대로 보여줍니다.
- 재료명과 그램수 사이에 점선을 넣어서 둘을 시각적으로 이어줍니다 — 이름과 숫자가 화면 양 끝에 멀리 떨어져 있어도 어떤 숫자가 어떤 재료 것인지 한눈에 보이도록 했습니다.
- 보조 계량(개수 등)을 적어둔 재료는 그램수 옆에 "(3개)"처럼 같이 표시됩니다.

### 확인하는 방법

Component 상세 페이지의 CURRENT FORMULA 패널에서 재료 목록이 전부 보이는지, 재료명 옆에 점선이 그램수까지 이어지는지 확인.

---

## 2026-09-22 — 배치 열에서도 보조 계량(개수 등) 자동 배수 표시

### 무엇이 달라졌나

- 계란처럼 그램 + 보조 계량(예: "3개")을 같이 적어둔 재료는, 이제 BASE×1뿐 아니라 **각 배치 프리셋 열(×2, ×3 등)에도 배수만큼 곱해진 보조 계량이 자동으로 같이 표시**됩니다. 예: BASE×1에 "3개"로 적어두면 ×2 배치 열에는 자동으로 "6개"가 뜹니다.
- 이전에는 "전란 3개 분리" 같은 문구를 NOTE란에 고정 텍스트로 적어야 했는데, 이건 배치를 바꿔도 숫자가 그대로라 8인치(×2)에서도 "3개"로 보여 혼동이 있었습니다. 이제는 그램수처럼 배치별로 자동 계산되므로 NOTE에 개수를 직접 적을 필요가 없습니다.
- 배수가 딱 떨어지지 않는 경우(예: 3개 × 1.5배치 = 4.5개)는 반올림 없이 소수점 그대로 표시합니다 — 실제로 몇 개를 어떻게 나눠 쓸지는 직접 판단해서 계량하시면 됩니다.

### 확인하는 방법

1. FORMULA 상세 페이지 → [EDIT] → 재료의 그램수 아래 보조 계량 칸에 "3" + "개" 입력 → SAVE.
2. 배치 프리셋 열(×2 등)의 그램수 아래에 "· 6개"처럼 자동 계산된 보조 계량이 뜨는지 확인.

---

## 2026-09-21 — 재료 행 드래그로 순서 바꾸기 (공정 순서대로 정렬)

### 무엇이 달라졌나

- FORMULA 상세 페이지의 INGREDIENTS 표에서, 각 재료 행 맨 왼쪽에 **드래그 손잡이(⠿ 아이콘)**가 생겼습니다. 이걸 잡고 위아래로 끌면 재료 순서를 바꿀 수 있습니다.
- 실제로 작업하는 공정 순서대로(예: 먼저 넣는 재료가 위로 오도록) 재료 목록을 정렬해두는 용도입니다. 순서는 %나 배수 계산과는 무관하고, 표시 순서만 바꿉니다.
- 드래그로 순서를 바꾸면 **[EDIT] 버튼과 관계없이 바로 저장**됩니다 ("+ ADD INGREDIENT"와 동일하게, 별도 SAVE 없이 즉시 반영).
- 버전이 잠겨있으면(LOCKED) 드래그 손잡이가 보이지 않습니다.

### 확인하는 방법

1. FORMULA 상세 페이지 → INGREDIENTS 표에서 재료 행 왼쪽의 ⠿ 아이콘을 클릭한 채 위/아래로 드래그합니다.
2. 놓으면 바로 순서가 바뀌어 저장됩니다 (새로고침해도 순서 유지).

---

## 2026-09-21 — 재료별 보조 계량(개수/스푼 등) 표시 기능

### 무엇이 달라졌나

- 재료 한 줄마다 그램수 외에 **보조 계량**을 같이 적어둘 수 있게 됐습니다. 예: 계란 흰자를 그램으로 쓰면서 동시에 "3개"라고, 또는 바닐라를 그램으로 쓰면서 "1Tbsp"라고 같이 표기하는 식입니다.
- [EDIT] 모드에서 재료 행의 그램수 입력칸 아래에 작은 입력칸 2개(숫자 + 단위, 예: "3" + "개")가 새로 생깁니다. 비워두면 저장 안 됩니다.
- **중요: 이 보조 계량은 화면 표시 전용입니다.** 몰드 배수/베이커스 퍼센트 등 모든 계산은 여전히 그램수(amount/unit)만 기준으로 하고, 보조 계량 값은 계산에 전혀 관여하지 않습니다.
- DB에 `formula_version_ingredients.secondary_amount`(숫자), `secondary_unit`(텍스트) 컬럼이 새로 추가됐습니다. 버전을 복제/새 버전 생성할 때도 같이 복사됩니다.

### 확인하는 방법

1. FORMULA 상세 페이지 → [EDIT] 클릭 → 재료 행의 그램수 입력칸 아래 작은 입력칸 2개에 값 입력 (예: "3" / "개") → SAVE.
2. 저장 후 그램수 아래에 "· 3개"처럼 회색 작은 글씨로 표시됩니다.

---

## 2026-09-21 — FORMULA 페이지: INGREDIENTS를 상단으로 이동 + 재료명 클릭 오작동 수정

### 무엇이 달라졌나

- FORMULA 상세 페이지에서 **INGREDIENTS(재료·그램수 표)**가 이제 YIELD & BATCH/BASIS PANEL보다 먼저, 페이지 상단에 뜹니다. 재료/그램수를 보거나 고치러 들어왔을 때 스크롤을 덜 해도 됩니다.
- 재료 표에서 **재료 이름을 눌러도 더 이상 재료 마스터(INGREDIENTS 메뉴의 재료 상세) 페이지로 이동하지 않습니다.** 예전엔 재료명이 링크로 돼 있어서, 배합을 고치려고 이름을 누르면 엉뚱하게 화면이 넘어가버리는 문제가 있었습니다 — 이제 이름은 그냥 텍스트로만 보입니다.
- 참고: 재료의 양(그램수)을 실제로 고치려면 여전히 페이지 상단의 **[EDIT]** 버튼을 먼저 눌러야 입력칸이 활성화됩니다(우측 상단 "편집하려면 EDIT을 누르세요" 안내). "+ ADD INGREDIENT"만 EDIT 없이도 바로 눌리는 버튼이라 이 둘의 차이가 헷갈릴 수 있는데, 이 부분은 별도로 정리할 예정입니다.
- 코드/DB 로직 변경 없음 — 배치 순서 변경 + 링크 제거만.

### 확인하는 방법

1. 아무 FORMULA 상세 페이지로 들어갑니다.
2. 페이지 상단에 INGREDIENTS 표가 바로 보이는지 확인합니다.
3. 재료 이름을 눌러도 페이지 이동 없이 그대로인지 확인합니다.
4. [EDIT]을 누른 뒤에는 그램수 입력칸이 활성화되어 수정 가능한지 확인합니다.

---

## 2026-09-21 — CURRENT FORMULA 패널을 상단으로 이동

### 무엇이 달라졌나

- COMPONENT 상세 페이지에서 CURRENT FORMULA(재료 요약 + OPEN FULL FORMULA 링크)가 이제 DESCRIPTION/USED IN/NOTES보다 위, 헤더 바로 아래에 뜹니다. 예전엔 스크롤을 내려야 배합을 볼 수 있었는데, 이제 페이지에 들어가자마자 바로 보이고 한 번 클릭으로 FORMULA 편집 페이지로 이동할 수 있습니다.
- 코드/DB 변경 없음 — 화면 배치 순서만 바꿨습니다.

### 확인하는 방법

1. 아무 COMPONENT 상세 페이지로 들어갑니다.
2. 스크롤 없이 바로 CURRENT FORMULA 패널이 보이는지 확인합니다.

---

## 2026-09-21 — DUPLICATE COMPONENT

### 무엇이 달라졌나

- COMPONENT 상세 페이지 상단에 **[DUPLICATE COMPONENT]** 버튼이 생겼습니다. 누르면 새 이름을 입력하는 창이 뜨고, 확인하면 지금 COMPONENT의 CURRENT FORMULA(재료 목록·몰드·수율·배쓰워터)를 그대로 복사해서 새 COMPONENT + 새 FORMULA를 한 번에 만들어줍니다. 예를 들어 "Vanilla Chiffon"을 복제해서 "Cacao Chiffon"을 만들고, 그 다음 카카오파우더만 추가/조정하면 됩니다 — 처음부터 재료를 다시 입력할 필요가 없습니다.
- 복제된 FORMULA는 원본과의 관계가 `derived_from_formula_id`로 남습니다(기준 배합 라이브러리에서 시작할 때와 동일한 방식).
- 원본에 아직 CURRENT 배합이 없으면 COMPONENT만 새로 생성됩니다(배합은 비어있는 상태로 시작).
- DB 변경 없음 — 기존 테이블에 새 행을 추가하는 것뿐입니다.

### 확인하는 방법

1. 재료가 있는 아무 COMPONENT 상세 페이지로 들어갑니다.
2. 상단 [DUPLICATE COMPONENT]를 누르고 새 이름을 입력한 뒤 [DUPLICATE]를 누릅니다.
3. 새로 만들어진 COMPONENT 페이지로 자동 이동하고, CURRENT FORMULA에 원본과 같은 재료/수율이 복사되어 있는지 확인합니다.

---

## 2026-09-21 — PRODUCT 목록의 CATEGORY 색상 표시

### 무엇이 달라졌나

- PRODUCTS 목록의 CATEGORY 칸이 이제 그 카테고리에 지정한 색을 글자 배경색으로 보여줍니다(예전엔 색 없는 텍스트였습니다). 배경색이 밝으면 어두운 글자, 어두우면 밝은 글자로 자동 대비를 맞춰서 항상 읽을 수 있게 했습니다. 카테고리에 색이 지정 안 돼 있으면 예전처럼 그냥 회색 텍스트로 보입니다.

### 확인하는 방법

1. SETTINGS → CATEGORIES에서 카테고리 하나에 색을 지정합니다.
2. PRODUCTS 목록에서 그 카테고리로 분류된 PRODUCT의 CATEGORY 칸이 그 색 배경으로 뜨는지 확인합니다.

---

## 2026-09-14 (Phase 3–7) — SAVE DEVELOPMENT · MAKE CURRENT · R&D DASHBOARD · KNOWLEDGE/REFERENCE 태그

### 무엇이 달라졌나

- **SAVE DEVELOPMENT (재료표 저장의 핵심)**: Development Entry(실험) 상세 페이지에 **FORMULA SNAPSHOT** 섹션이 새로 생겼습니다. 그 시점 배합의 재료를 직접 고치거나(+ADD INGREDIENT/양·단위·메모 수정/삭제) OUTCOME(KEEP/FAILED/PARTIAL/REFERENCE)을 고른 뒤 **[SAVE DEVELOPMENT]**를 누르면 한 번에 기록됩니다. PRODUCT가 연결된 경우 "COMPONENT 전체에 반영"(체크 시 Current Formula 갱신) / "이 PRODUCT에만 적용"(체크 해제 시, 그 PRODUCT 전용 사용량만 기록 — 새 FORMULA를 만들지 않습니다)을 고를 수 있습니다. 재료가 실제로 안 바뀌었으면 새 버전을 만들지 않고 기록만 갱신합니다. 가설/변수/결과/무게 등 나머지 필드는 예전처럼 각자 입력칸을 벗어나면(blur) 바로 저장됩니다 — 이 부분만 새로 SAVE 버튼이 필요합니다.
- **MAKE CURRENT**: FORMULA 상세 페이지의 SNAPSHOT HISTORY(예전 "VERSION HISTORY")에서, 지금 CURRENT가 아닌 예전 스냅샷 옆에 [MAKE CURRENT] 버튼이 생겼습니다 — "예전 버전이 더 나았다"고 판단되면 눌러서 되돌릴 수 있습니다. 되돌려도 지금 CURRENT였던 버전은 삭제되지 않고 SUPERSEDED로 남습니다.
- **R&D DASHBOARD**: 예전 "EXPERIMENTS" 화면이 "R&D DASHBOARD"로 이름이 바뀌고, 위쪽에 ALL/IN PROGRESS/TODAY/RECENTLY KEEP/FAILED 요약 타일이 생겼습니다 — 눌러서 바로 그 그룹만 필터링해서 볼 수 있습니다. 표에 OUTCOME 열이 추가됐습니다. 왼쪽 메뉴에서도 "EXPERIMENTS" → "R&D DASHBOARD"로, "FORMULAS" 메뉴 항목은 없앴습니다(FORMULA는 이제 COMPONENT 하나당 하나라 COMPONENTS를 통해 들어가는 게 자연스럽습니다 — `/formulas` 페이지 자체는 그대로 있어서 COMPONENT에서 "OPEN FULL FORMULA"로는 계속 들어갈 수 있습니다).
- **PRODUCT의 COMPONENT 조정 문구 정리**: PRODUCT 상세의 "COMPONENTS" 섹션 이름이 "COMPONENTS & PRODUCT-SPECIFIC ADJUSTMENT"로 바뀌고, FORMULA VERSION/사용량을 수동으로 지정하는 대신 보통은 Development Entry에서 "이 PRODUCT에만 적용"으로 저장하면 자동으로 채워진다는 안내가 추가됐습니다. "EXPERIMENTS" 섹션도 "DEVELOPMENT HISTORY"로 이름이 바뀌었습니다.
- **KNOWLEDGE/REFERENCE를 COMPONENT에 태그처럼**: COMPONENT 상세 페이지 맨 아래에 KNOWLEDGE/REFERENCES 두 칸이 생겨서, 이 COMPONENT에 연결된 항목을 바로 보고 추가할 수 있습니다(전체 목록은 기존 KNOWLEDGE/REFERENCES 메뉴에서 그대로 확인 가능).
- DB 변경 없음 — 전부 이미 있던 테이블/컬럼(Phase 1에서 추가한 `outcome`/`derived_from_formula_id`/`LOGGED` 포함)을 화면에 연결한 것입니다.

### 확인하는 방법

1. COMPONENT 상세에서 [+ START DEVELOPMENT]로 Development Entry를 열고, FORMULA SNAPSHOT에서 재료 양을 바꾼 뒤 OUTCOME을 KEEP으로 두고 [SAVE DEVELOPMENT] — COMPONENT의 CURRENT FORMULA가 갱신되는지 확인합니다.
2. FORMULA 상세의 SNAPSHOT HISTORY에서 예전 버전에 [MAKE CURRENT]를 눌러 되돌아가는지 확인합니다.
3. R&D DASHBOARD에서 요약 타일을 눌러 필터가 바뀌는지 확인합니다.
4. COMPONENT 상세 하단 KNOWLEDGE/REFERENCES에 항목을 추가하고 잘 붙는지 확인합니다.

---

## 2026-09-14 (Phase 2) — COMPONENT 상세를 R&D 허브로 재구성

### 무엇이 달라졌나

- **COMPONENT 상세 = R&D 허브**: COMPONENT 하나는 이제 배합(Formula) 하나만 가집니다. Formula를 계속 새로 만드는 대신, COMPONENT 상세 페이지에 **CURRENT FORMULA** 패널이 생겨서 지금 쓰는 배합을 한눈에 보여줍니다(재료 개수 · 총 중량 · 주요 재료 미리보기 · 마지막 수정일). 재료를 직접 고치려면 **[OPEN FULL FORMULA →]**로 이동해 기존 EDIT/SAVE 화면에서 수정합니다 — CURRENT FORMULA 패널 자체는 읽기 전용입니다(따로 수정 경로를 두면 "이게 기록으로 남는 건지" 헷갈리기 때문에 의도적으로 그렇게 했습니다).
- **+ START DEVELOPMENT**: COMPONENT 상세에서 바로 새 실험(Development Entry)을 시작할 수 있습니다. FORMULA/FORMULA VERSION/COMPONENT는 자동으로 채워지고, PRODUCT는 선택 사항입니다.
- **DEVELOPMENT HISTORY**: 예전 "EXPERIMENTS" 섹션 이름을 바꾼 것입니다 — 같은 데이터(실험 기록)이고, 각 항목에 KEEP/FAILED/PARTIAL/REFERENCE 판정(있는 경우)이 함께 표시됩니다. FORMULA 상세 페이지의 "RELATED EXPERIMENTS"도 같은 이름·버튼("+ START DEVELOPMENT")으로 바꿨습니다.
- **처음 배합을 만들 때**: COMPONENT에 아직 배합이 없으면 "빈 배합으로 시작" 또는(재사용 가능한 기준 배합이 있으면) "기준 배합에서 시작"을 선택할 수 있습니다. 기준 배합에서 시작하면 그 배합의 재료·몰드·YIELD를 그대로 복사해서 새로 시작합니다(원본 기준 배합은 전혀 바뀌지 않습니다).
- **DB 변경 없음** — 화면 구성과 라벨만 바꿨습니다. `formulas`/`formula_versions`/`experiments` 테이블 구조는 그대로입니다.

### 확인하는 방법

1. 배합이 이미 있는 COMPONENT 상세 페이지를 열면 CURRENT FORMULA 패널에 재료 요약이 보입니다.
2. [+ START DEVELOPMENT]를 눌러 실험을 하나 만들어보면 FORMULA/COMPONENT가 이미 채워져 있는지 확인합니다.
3. DEVELOPMENT HISTORY에 방금 만든 실험이 나타나는지 확인합니다.
4. 아직 배합이 없는 COMPONENT를 열어 "빈 배합으로 시작"이 정상 동작하는지 확인합니다.

---

## 2026-09-12 — PRODUCT의 COMPONENT마다 실사용 FORMULA VERSION·수량(g) 기록

### 무엇이 달라졌나

- Product 상세 페이지의 **COMPONENTS** 섹션에서, 링크된 Component마다 **이 Product에서 실제로 사용하는 Formula Version**과 **실사용량(g)**을 지정할 수 있습니다. 하나의 Component가 여러 Formula Version을 가질 수 있으므로 Component 단위가 아니라 **Formula Version 단위**로 지정합니다.
- Formula 자체의 기준 배합량(예: 1kg 배치)과 이 Product에서 실제로 쓰는 양(예: 그중 150g)이 다른 경우를 그대로 기록하기 위한 기능입니다 — Formula의 배합 자체는 전혀 바뀌지 않고, Product↔Component 연결에만 "이 조합에서는 몇 g 쓴다"는 정보가 별도로 붙습니다.
- Formula Version을 지정하지 않으면 기존과 동일하게 동작합니다("FORMULA VERSION 미지정").
- DB 변경은 `product_components` 테이블에 컬럼 2개(`formula_version_id`, `quantity_g`)를 추가한 것뿐이며 둘 다 nullable — 기존 링크는 값이 모두 비어 있는 상태로 그대로 유지되고, 다른 테이블/관계는 건드리지 않았습니다(순수 추가).

### 테스트 방법

1. Product 상세 페이지 → COMPONENTS 섹션에서 기존에 링크된 Component들이 그대로 보이는지 확인
2. 각 Component 아래 새로 생긴 FORMULA VERSION 드롭다운에서 해당 Component에 연결된 Formula의 버전들이 나오는지 확인 → 하나 선택
3. 옆의 그램(g) 입력란에 실사용량을 입력하고 다른 곳을 클릭 → 저장되는지, 새로고침 후에도 유지되는지 확인
4. Formula Version이 없는 Component는 "이 COMPONENT에 연결된 FORMULA VERSION이 없음"으로 표시되는지 확인
5. 다른 Product의 COMPONENTS 목록, Formula 자체의 배합 계산 결과가 전혀 바뀌지 않았는지 확인

---

## 2026-09-03 — WORKFLOW TIMELINE: 세로형 24시간 그리드로 개편 (행=시간, 열=품목)

### 무엇이 달라졌나

- Production 탭의 **WORKFLOW** 화면 레이아웃이 가로형(시간=가로축, Task=세로로 나열)에서 **세로형 24시간 그리드**로 바뀌었습니다: **행 = 시간(00:00~24:00 하루 전체), 열 = 품목**(현재 Work Session에 선택된 Formula Version들 + Formula 연결이 없는 Task를 위한 GENERAL 열 하나). 시간 라벨(왼쪽) 열은 세로 스크롤 시에도 화면에 고정됩니다.
- Task는 이제 해당 품목(열) 안에서, 시작 시각에 맞는 세로 위치에 시작 시각~끝 시각 길이만큼 블록으로 표시됩니다. 블록 안에는 **Task 이름 + TYPE 배지**가 함께 보이고, TYPE 배지는 같은 TYPE끼리 항상 같은 색으로 자동 배정되어 Task 이름과 구분됩니다(예: Mix는 파란색, Bake는 주황색 — 같은 TYPE을 여러 번 입력해도 매번 같은 색).
- 시간 범위는 더 이상 06:00~18:00 기본값에서 확장되는 방식이 아니라 **항상 24시간 전체(00:00~24:00)**를 보여줍니다.
- 시간 미정(시작/끝 시각을 안 넣은) Task는 그리드에 표시할 위치가 없으므로 그리드 아래 별도 "시간 미정 TASK" 목록에 모아서 보여줍니다 — 클릭하면 그리드의 Task와 동일하게 상태가 순환됩니다.
- "지금" 위치를 나타내는 빨간 가로선, 열기 시 진행중(IN PROGRESS) Task 또는 현재 시각 근처로 자동 스크롤하는 동작은 그대로 유지됩니다.
- 하단 TASK LIST(상세/삭제용 목록)의 TYPE 배지도 동일한 색상 규칙으로 통일했습니다.

### 테스트 방법

1. Production → Work Session에서 **WORKFLOW** 탭을 열고, 화면 위쪽에 Formula Version들의 이름이 가로로(열 헤더) 나열되는지, 왼쪽에 00:00~23:00 시간 라벨이 세로로(행) 나열되는지 확인
2. **+ ADD TASK**로 이름/TYPE/Formula/시작·끝 시각을 입력해 추가 → 해당 Formula 열의, 시작 시각에 맞는 세로 위치에 Task 블록이 뜨는지 확인. 블록 안에 이름과 TYPE 배지가 같이 보이는지 확인
3. 같은 TYPE(예: "Bake")으로 Task를 여러 개 만들어서 배지 색이 항상 같은지 확인, 다른 TYPE(예: "Mix")은 다른 색인지 확인
4. Formula를 선택하지 않고 Task를 추가하면 GENERAL 열에 뜨는지 확인
5. 시작/끝 시각을 비워두고 추가하면 그리드가 아니라 그리드 아래 "시간 미정 TASK" 목록에 뜨는지 확인
6. Task 블록을 클릭해 상태가 NOT STARTED → IN PROGRESS → DONE → SKIPPED 순으로 순환하고, 그리드/목록 양쪽에 똑같이 반영되는지 확인

---

## 2026-09-02 — FORMULA 이름 표기 규칙 통일 + 약어표 위젯

### 무엇이 달라졌나

- 기존 Formula 8개 이름을 하나의 규칙으로 통일했습니다: **[기법/컴포넌트] [재료·풍미] V[버전] [제품명]** 순서, 같은 단어 중복 멘션 금지, 제품명은 대괄호로 맨 뒤(제품이 늘고 표준화되면 나중에 뗄 예정이라 지금은 유지).
  - `CHIFFON — Standard Oil Emulsion V1` → `Chiffon V1` (특정 flavor 없는 공용 베이스, 2개 Product에서 공유 중이라 제품 태그 생략)
  - `STRENGTH — Vanilla Chiffon V1` → `Chiffon Vanilla V1 [Strength]`
  - `TANGERINE MARMALADE SMB — V1` → `SMB Tangerine Marmalade V1`
  - `LEMON CURD — Whole Egg + Gelatin V1` → `Curd LM V1`
  - `LEMON CREAM CHEESE YOGURT MOUSSE — V1` → `Mousse LM C.C Yogurt V1`
  - `Vanilla White Chocolate Whipped Ganache V1` → `Ganache Vanilla W.C V1 [Strength]`
  - `Dark & Milk Chocolate Whipped Ganache V2` → `Ganache D.C & M.C V2 [60th]`
  - `Chocolate Mud Cake Sheet V1` → `Mud D.C V1 [60th]`
- 재료 약어는 자주 쓰는 일부만 적용합니다: W.C(White Chocolate)/D.C(Dark Chocolate)/M.C(Milk Chocolate)/LM(Lemon)/C.C(Cream Cheese)/W.E(Whole Egg)/E.Y(Egg Yolk)/E.W(Egg White). 두 단어 이니셜 조합은 점(.)으로 연결(W.C, D.C…), 한 단어 축약은 점 없음(LM). Chiffon/Mousse/Curd/Ganache/Mud 같은 케익·제과 이름과 SMB는 약어화하지 않고 그대로 씁니다.
- **DASHBOARD**에 새 위젯 **NAMING ABBREVIATIONS**가 추가돼서, 위 약어 규칙표를 항상 화면에서 바로 참고할 수 있습니다.
- Formula의 실제 데이터(재료/양/버전/Component·Product 연결)는 전혀 바뀌지 않았습니다 — `formulas.name` 컬럼 값만 바뀌었습니다.

### 테스트 방법

1. **FORMULAS** 목록과 Work Session의 **+ ADD FORMULA VERSION** 드롭다운에서 8개 Formula 이름이 위 표대로 바뀌었는지 확인
2. **DASHBOARD**에서 NAMING ABBREVIATIONS 박스가 보이는지, 약어/전체 이름이 맞게 나오는지 확인
3. 이름이 바뀐 Formula를 열어 재료/양/버전/Experiment 연결 등 실제 데이터는 그대로인지 확인

---

## 2026-09-02 — WEIGHING MATRIX (스프레드시트형 동시 계량 화면으로 전면 개편)

### 무엇이 달라졌나

- **WEIGHING VIEW**가 카드/리스트 나열 방식에서 **엑셀 시트 같은 매트릭스(표)**로 전면 개편되고, 메뉴 이름도 **WEIGHING MATRIX**로 바뀌었습니다.
- **행 = 재료(Ingredient Master 기준), 열 = 현재 Work Session에 선택된 Formula Version.** 동일 Ingredient Master ID는 모든 Formula 열에 걸쳐 항상 같은 한 줄(행)에 나옵니다 — 예: Butter가 3개 레시피에 쓰이면 Butter 행이 하나만 생기고, 그 행 안에서 각 레시피 열에 각자의 수량이 따로 표시됩니다.
- **수량은 절대 합산하지 않습니다.** 같은 재료라도 Formula별 칸에 각자의 (원본 수량 × 그 Formula Version의 현재 multiplier) 값만 독립적으로 표시됩니다. 한 재료의 총합을 보여주는 숫자는 어디에도 없습니다.
- 재료(첫 번째) 열은 가로 스크롤 시에도 화면 왼쪽에 고정되어, Formula가 많아 옆으로 스크롤해도 지금 보고 있는 줄이 어떤 재료인지 항상 확인할 수 있습니다.
- 체크 상태(NOT STARTED/DONE/SHORTAGE/SKIPPED)는 각 칸 안의 작은 아이콘 버튼으로 옮겨져 시각적으로 보조 역할만 하고, 수량 숫자가 항상 가장 크고 먼저 보이도록 했습니다. SHORTAGE 상태일 때만 칸을 눌러 메모를 입력할 수 있습니다(기존과 동일하게 서버에 저장/유지).
- **FORMULA VIEW**(원래 레시피 구조 그대로, Formula 하나씩 세로로 읽는 화면)는 그대로 유지됩니다 — 매트릭스는 "여러 레시피 동시 비교/계량"용, Formula View는 "레시피 하나 자세히 읽기"용으로 역할이 나뉩니다.
- 데이터/저장 구조는 전혀 바뀌지 않았습니다 — `work_sessions`/`work_session_formula_versions`/`work_session_progress`/`formula_versions`/`formula_version_ingredients`/`ingredients` 위에 표시 방식만 바뀐 것이고, 새 테이블이나 "재료 통합" 개념은 추가되지 않았습니다. 그룹핑은 기존과 동일하게 `ingredient_id` 기준입니다.
- **행 정렬 방식**: 재료 행이 단순 이름순이 아니라, "어느 Formula 열에 걸쳐 있는지"를 기준으로 정렬됩니다. 한 Formula에만 쓰이는 재료는 그 Formula 열 쪽으로 몰리고, 여러 Formula에 공통으로 쓰이는 재료는 자연스럽게 그 Formula들 사이(중간)에 위치합니다 — 겹치는 재료를 한눈에 찾기 위함입니다.
- **버그 수정**: ADD FORMULA VERSION / Formula Version별 MULTIPLIER ×N 입력칸에서 브라우저가 기본값 "1"을 무효한 값으로 처리해 "0.6과 1.1 중에 골라라" 같은 경고를 띄우던 문제를 고쳤습니다(입력 단위를 0.1로 조정). ×1, ×1.5, ×2 등 흔히 쓰는 값이 모두 정상적으로 입력됩니다.

### 테스트 방법

1. Work Session에 서로 다른 Formula Version을 2~3개 추가(공통 재료가 하나 이상 포함되도록, 예: Heavy cream이 여러 Formula에 쓰이는 조합)
2. **WEIGHING MATRIX**로 들어가서 공통 재료가 한 행에만 나오고, 그 행 안에서 Formula별 칸에 서로 다른 수량이 각각 표시되는지 확인 — 합산된 숫자가 아닌지 확인
3. Formula 열이 많을 때 가로로 스크롤해도 재료(첫 번째) 열이 화면에 고정되어 있는지 확인
4. 칸의 작은 상태 버튼을 눌러 NOT STARTED → DONE → SHORTAGE → SKIPPED 순으로 바뀌는지, SHORTAGE일 때 메모 입력이 뜨는지, 새로고침 후에도 상태/메모가 유지되는지 확인
5. **FORMULA VIEW**로 전환해 기존과 동일하게 Formula별 세로 리스트로 보이는지 확인
6. 공통 재료가 있는 2개 이상의 Formula를 추가했을 때, 그 공통 재료 행이 각 Formula 전용 재료 행들 사이(중간)에 위치하는지 확인
7. **+ ADD FORMULA VERSION**에서 MULTIPLIER ×N을 기본값 1로 그대로 ADD 눌렀을 때 경고 없이 추가되는지 확인

---

## 2026-09-02 — PRODUCTION / WEIGHING DASHBOARD (여러 Formula 동시 계량)

### 무엇이 달라졌나

- 새 메뉴 **PRODUCTION**이 추가됐습니다. 여러 Formula Version을 하나의 **Work Session**으로 묶어서 한 화면에서 계량 작업을 진행할 수 있습니다.
- **Work Session 생성 → Formula Version 선택 → Multiplier(배수) 설정 → START WORK → 계량 → PAUSE/RESUME → COMPLETE** 흐름으로 동작하고, 브라우저를 닫았다 다시 열어도 선택한 Formula, multiplier, 체크 상태가 그대로 남아 있습니다.
- **WEIGHING VIEW**: 선택된 모든 Formula Version의 재료를 **Ingredient Master 기준으로 묶어서** 보여줍니다(이름이 아니라 실제 재료 ID 기준 — Caster Sugar와 Icing Sugar는 절대 같이 묶이지 않습니다). Butter가 여러 Formula에 등장해도 수량을 합치지 않고 Formula별 줄을 나란히 독립적으로 보여줍니다. 각 줄을 눌러 NOT STARTED → DONE → SHORTAGE → SKIPPED 순으로 체크 상태를 바꿀 수 있고, SHORTAGE일 때는 메모를 남길 수 있습니다. 이 체크 상태는 서버에 저장되어 나중에 다시 열어도 유지됩니다.
- **FORMULA VIEW**: 같은 데이터를 Formula 원래 구조 그대로(재료 목록 순서대로) 보여주는 화면입니다. Weighing View와 같은 원본 데이터를 다른 방식으로 보여줄 뿐, 새로운 레시피 데이터 구조는 아닙니다.
- **Multiplier**: 각 Formula Version마다 개별적으로 ×1.5, ×2 같은 배수를 설정할 수 있고, 실제 계량에 쓰이는 수량(working quantity)에만 반영됩니다. **원본 Formula Version의 레시피 양은 전혀 바뀌지 않습니다.**
- Multiplier를 바꿀 때마다 이전 값 → 새 값, 그리고 그 순간 계산된 실제 작업 수량이 이력으로 남습니다(HISTORY 버튼으로 확인). 이 이력은 나중에 원본 레시피가 바뀌어도 "그때 실제로 몇 g을 썼는지"를 그대로 보존합니다.
- **PROMOTE TO EXPERIMENT**: Work Session에서 특정 Formula Version을 골라 바로 Experiment로 승급할 수 있습니다. 그 시점의 multiplier가 Experiment의 BATCH ×N 값으로 복사되고(실시간 연동 아님, 스냅샷), 어느 Work Session에서 만들어진 Experiment인지 참조가 남습니다. 기존 Experiment의 baseline/변수/Sensory/Yield-Loss/Process Timeline 구조는 전혀 바뀌지 않았습니다.
- DB에는 `work_sessions`, `work_session_formula_versions`, `work_session_multiplier_history`, `work_session_progress` 4개 테이블이 새로 추가됐고, `experiments`에는 추적용 `work_session_id`(nullable) 컬럼만 추가됐습니다. 기존 `formulas`/`formula_versions`/`formula_version_ingredients`/`ingredients`/`experiments`의 기존 컬럼과 계산 로직(Balance Role/Context Weight/Sensory/Yield-Loss/Process Parameters 포함)은 전혀 손대지 않았습니다.

### 테스트 방법

1. **PRODUCTION → + CREATE WORK SESSION** → 이름 입력 후 생성
2. Work Session 상세에서 **+ ADD FORMULA VERSION**으로 서로 다른 Formula를 2개 이상 추가, 각각 multiplier(예: ×1.5, ×2) 지정
3. 같은 Formula Version을 다시 추가하면 거부되는지 확인(중복 방지)
4. **WEIGHING VIEW**에서 동일 재료가 여러 Formula 줄로 나란히 보이는지, 수량이 각자 독립적으로(합쳐지지 않고) 표시되는지 확인
5. 재료 줄을 눌러 체크 상태를 DONE → SHORTAGE로 바꾸고 메모 입력 → 페이지를 새로고침해도 상태/메모가 유지되는지 확인
6. **FORMULA VIEW**로 전환해 각 Formula가 원래 레시피 순서대로 나오는지 확인
7. Formula Version의 multiplier 값을 바꾸고 **HISTORY**를 열어 이전 값 → 새 값 기록이 남는지 확인
8. **START WORK → PAUSE → RESUME → COMPLETE** 상태 전환이 저장되는지 확인
9. 한 Formula Version에서 **PROMOTE TO EXPERIMENT**를 눌러 Experiment가 생성되고 BATCH ×N에 그 시점 multiplier가 들어가는지 확인
10. 기존 EXPERIMENTS, FORMULAS, PRODUCTS 화면과 그 안의 Sensory/Yield-Loss/Process Timeline/Baseline-Variant 기능이 예전과 동일하게 동작하는지 확인

---

## 2026-09-02 — PRODUCT SIZE / DIMENSION SYSTEM (제품 실측 사이즈)

### 무엇이 달라졌나

- **PRODUCT 상세 → SIZES**: 제품마다 실제 완성 사이즈를 여러 개 등록할 수 있는 섹션이 추가됐습니다. Shape(ROUND/RECTANGLE)을 고르면 그에 맞는 입력칸만 나타납니다 — ROUND는 지름(DIAMETER)/높이(HEIGHT), RECTANGLE은 가로(LENGTH)/세로(WIDTH)/높이(HEIGHT).
- 입력은 cm 단위로 하지만 DB에는 mm로 저장됩니다(변환은 자동). 화면에는 다시 cm로 표시됩니다 — 예: "Ø15 × H3 cm", "32 × 24 × H3 cm".
- 각 사이즈 아래에 단면적(AREA, cm²)과 부피(VOLUME, cm³)가 자동으로 계산되어 표시됩니다. 이 값들은 DB에 저장되지 않고 지름/가로세로/높이로부터 매번 계산됩니다.
- 사이즈 하나를 "SET DEFAULT"로 지정할 수 있고, 한 제품에는 기본 사이즈가 최대 1개만 허용됩니다(두 번째를 기본으로 지정하면 이전 기본이 자동으로 해제됩니다).
- `product_sizes`는 `products`의 하위 테이블로 새로 추가됐습니다. 기존 `moulds`(생산 도구), `formula_versions`, `experiments`, Formula 계산 로직(Balance Role/Context Weight/Sensory/Yield-Loss/Process Parameters 포함)은 전혀 건드리지 않았습니다. Formula 배치 스케일링/몰드 환산 계산도 이번 단계에서는 구현하지 않았습니다(향후 확장을 위한 구조만 마련).

### 테스트 방법

1. **PRODUCTS → 아무 제품 열기 → SIZES → + ADD SIZE**
2. SHAPE을 ROUND로 두고 지름 15, 높이 3을 입력 후 CREATE → "Ø15 × H3 cm"와 AREA ≈176.7cm², VOLUME ≈530.1cm³가 표시되는지 확인
3. 같은 제품에 SHAPE RECTANGLE로 가로 32, 세로 24, 높이 3을 추가 → "32 × 24 × H3 cm"와 AREA 768cm², VOLUME 2,304cm³가 표시되는지 확인
4. 두 사이즈 중 하나를 SET DEFAULT → DEFAULT 배지가 옮겨가고 이전 것에는 더 이상 배지가 없는지 확인
5. EDIT으로 값을 수정하고 저장 후 표시/계산 값이 갱신되는지 확인, DELETE로 삭제되는지 확인
6. 같은 제품의 COMPONENTS/NOTES/PRODUCT TARGET/EXPERIMENTS/OBSERVATIONS/KNOWLEDGE 섹션과 다른 제품/Formula/Mould/Experiment 화면이 예전과 동일하게 동작하는지 확인

---

## 2026-08-31 — PROCESS PARAMETERS (구조화된 공정 파라미터)

### 무엇이 달라졌나

- **SETTINGS → PROCESS PARAMETERS**: MIXING/BAKING/COOLING 같은 공정 카테고리별로 구조화된 파라미터(속도, 시간, 온도, 팬, 습도, 선반 위치 등)를 정의할 수 있습니다. 여러 카테고리에서 공통으로 쓰이는 항목(온도, 시간)은 "COMMON"으로 묶여 모든 카테고리에서 선택됩니다. 이미 값이 기록된 파라미터는 삭제 버튼을 누르면 "N개의 공정 이벤트에서 사용 중" 안내가 뜨고 삭제되지 않습니다(SENSORY ATTRIBUTES와 동일한 보호 방식).
- **EXPERIMENT 상세 → PROCESS TIMELINE**: 각 이벤트 행에 "PARAMS ▼" 버튼이 추가됐습니다. 펼치면 그 이벤트의 카테고리에 맞는 파라미터 입력칸이 나타나고(예: BAKING 이벤트라면 온도/시간/팬/습도/선반 위치), 값을 입력하면 저장됩니다. 값을 비우면 저장되지 않거나 삭제됩니다. 기존 ACTION/NOTE/시간/카테고리 편집, QUICK LOG, 음성 로그는 전혀 바뀌지 않았습니다.
- 기본 계정에는 MIXING(속도/시간/온도/투입순서), BAKING(온도/시간/팬/습도/선반위치), COOLING(온도/시간, COMMON 항목 재사용)에 맞는 파라미터가 미리 등록되어 있습니다.
- DB에는 `process_parameter_definitions`(마스터 데이터)와 `process_event_parameters`(실제 기록값) 테이블이 새로 추가됐고, 값의 타입(숫자/텍스트/불리언)이 정의와 다르면 저장 시 막힙니다. 기존 `process_events`(action/note/timeline) 구조는 컬럼 하나도 바뀌지 않았습니다.

### 테스트 방법

1. **SETTINGS → PROCESS PARAMETERS** 펼치기 → MIXING/BAKING/COOLING/COMMON 그룹 아래 기본 파라미터(속도, 온도, 시간 등)가 보이는지 확인
2. **EXPERIMENTS → 아무 실험 열기 → PROCESS TIMELINE**에서 BAKING 카테고리로 지정된 이벤트의 "PARAMS ▼"를 눌러 펼치기 → 온도(예: 170), 시간, 팬, 습도, 선반 위치 입력 후 저장되는지 확인(포커스 아웃 시 저장)
3. 같은 값을 다시 열어서 입력했던 값이 그대로 보이는지 확인
4. 값 입력칸을 비워서 저장 시 값이 삭제되는지 확인
5. **SETTINGS → PROCESS PARAMETERS**로 돌아가 방금 값을 기록한 파라미터를 삭제해보고 "N개의 공정 이벤트에서 사용 중" 경고가 뜨는지 확인
6. 기존 ACTION 텍스트, NOTE, QUICK LOG(START/STOP/LOG), 과거 이벤트 추가가 예전처럼 동작하는지 확인

---

## 2026-08-30 — EXPERIMENT BASELINE / VARIANT UI 완성

### 무엇이 달라졌나

- **EXPERIMENTS → + NEW EXPERIMENT**: 실험 생성 화면에 BASELINE EXPERIMENT(선택) 필드가 추가됐습니다. 아직 만들어지지 않은 실험이라 자기 자신은 목록에 나타나지 않고, 비워둔 채로 생성해도 됩니다.
- **EXPERIMENT 상세**: BASELINE EXPERIMENT를 LINKED CONTEXT 칸에서 분리해 별도 섹션(EXPERIMENT BASELINE / VARIANT)으로 옮기고, "BASE FORMULA와는 다른 개념"이라는 설명을 항상 보이게 했습니다. Baseline을 선택하면 바로 그 실험으로 이동하는 링크가 뜹니다.
- **EXPERIMENT 상세 → USED AS BASELINE BY (VARIANTS)**: 반대 방향 조회 — 지금 보고 있는 실험을 다른 어떤 실험들이 baseline으로 쓰고 있는지 목록으로 보여주고, 각 항목을 눌러 바로 이동할 수 있습니다.
- HYPOTHESIS / VARIABLES 자유 텍스트 필드, Sensory/Yield-Loss 구조, Balance Role, Context Weight는 이번 작업에서 전혀 손대지 않았습니다. DB 마이그레이션도 추가하지 않았습니다(기존 `baseline_experiment_id` 컬럼만 사용).

### 테스트 방법

1. **EXPERIMENTS → + NEW EXPERIMENT** → BASELINE EXPERIMENT 선택창에서 기존 실험 하나를 골라 생성 → 생성된 실험 상세에서 baseline이 연결되어 있는지 확인
2. 실험 상세의 **EXPERIMENT BASELINE / VARIANT** 섹션에서 "→ #N · 날짜" 링크를 눌러 baseline 실험으로 이동되는지 확인
3. 방금 baseline으로 지정한 실험을 열어 **USED AS BASELINE BY (VARIANTS)** 목록에 방금 만든 실험이 나타나는지, 눌러서 이동되는지 확인
4. BASELINE EXPERIMENT 선택창에서 자기 자신은 목록에 없는지 확인
5. HYPOTHESIS/VARIABLES 입력이 기존처럼 정상 동작하는지 확인

---

## 2026-08-30 — SENSORY EVALUATION / YIELD·LOSS / EXPERIMENT BASELINE (P0)

### 무엇이 달라졌나

- **SETTINGS → SENSORY ATTRIBUTES**: TEXTURE / FLAVOUR / APPEARANCE 3개 카테고리로 평가 속성(예: Softness, Sweetness, Colour)을 직접 만들고, 속성마다 점수 범위(SCALE MIN~MAX, 기본 1~5)를 다르게 설정할 수 있습니다. 이미 EXPERIMENT에서 점수가 기록된 속성은 삭제 버튼을 누르면 "이 속성은 현재 N개의 실험에서 사용 중이라 삭제할 수 없습니다" 안내가 뜨고 삭제되지 않습니다(METHOD/FLAVOUR FAMILY와 동일한 보호 방식).
- **EXPERIMENT 상세 → SENSORY EVALUATION**: OBSERVATION(자유 기록)과는 별도로, SETTINGS에 등록된 속성별로 점수+메모를 입력하는 구조화된 평가 섹션이 추가됐습니다. 범위를 벗어난 점수는 저장 시 막힙니다(DB 레벨 검증 포함).
- **EXPERIMENT 상세 → YIELD/LOSS**: RAW WEIGHT / PROCESSED WEIGHT / FINISHED WEIGHT(g) 실측값을 입력할 수 있고, LOSS %는 저장하지 않고 화면에서 자동 계산됩니다. FORMULA VERSION의 YIELD(이론값)와는 별개입니다.
- **EXPERIMENT 상세 → BASELINE EXPERIMENT**: 이 실험이 어떤 이전 실험을 기준(baseline)으로 한 변형인지 선택할 수 있습니다. FORMULA의 "⭐ 기준 배합(is_base_formula)"과는 완전히 다른 개념입니다 — 자기 자신을 baseline으로 지정하는 것은 DB에서 막혀 있습니다.

### 테스트 방법

1. **SETTINGS → SENSORY ATTRIBUTES** 펼치기 → "+ ADD ATTRIBUTE"로 TEXTURE 카테고리에 속성 하나(예: 촉촉함/Moistness, 1~5) 추가
2. **EXPERIMENTS → 아무 실험 열기 → SENSORY EVALUATION** 섹션에서 방금 만든 속성에 점수(예: 4)와 메모 입력 → 저장되는지 확인
3. 같은 칸에 범위 밖 점수(예: 10)를 입력해보고 경고와 함께 저장이 막히는지 확인
4. **YIELD/LOSS** 섹션에서 RAW WEIGHT/FINISHED WEIGHT를 입력하고 LOSS %가 자동으로 계산되어 표시되는지 확인
5. **BASELINE EXPERIMENT** 선택창에서 다른 실험을 골라 연결되는지 확인
6. **SETTINGS → SENSORY ATTRIBUTES**로 돌아가 방금 점수를 기록한 속성을 삭제해보고 "N개의 실험에서 사용 중" 경고가 뜨는지 확인

---

## 2026-08-29 — METHOD 관리 화면 + FORMULA에 METHOD 연결 (PHASE 2)

### 무엇이 달라졌나

- **SETTINGS → METHODS**: TECHNIQUE CATEGORY별로 METHOD(제조 방식/원리, 예: "오일 유화법")를 만들고 이름/영문명/정렬을 수정하거나 삭제할 수 있습니다. 이미 FORMULA에서 쓰이고 있는 METHOD는 삭제 버튼을 누르면 "이 METHOD는 현재 N개의 FORMULA에서 사용 중이라 삭제할 수 없습니다" 안내가 뜨고 삭제되지 않습니다 (FLAVOUR FAMILIES와 동일한 보호 방식).
- **FORMULAS → + NEW FORMULA**: TECHNIQUE 선택 아래에 METHOD 선택이 추가됐습니다. TECHNIQUE을 먼저 골라야 그 TECHNIQUE에 등록된 METHOD만 목록에 뜨고, TECHNIQUE을 바꾸면 이미 골랐던 METHOD는 자동으로 초기화됩니다(잘못된 조합 방지).
- **FORMULA 상세 화면**: 상단에 METHOD 선택창이 추가돼서 바로 바꿀 수 있고, TECHNIQUE 옆에 현재 METHOD 이름이 뱃지로 표시됩니다.

### 테스트 방법

1. **SETTINGS → METHODS** 펼치기 → "오일 유화법 (Oil Emulsion)" 항목이 "폼 케이크" 그룹 밑에 보이는지 확인
2. **+ ADD METHOD**로 아무 TECHNIQUE CATEGORY 밑에 테스트용 METHOD 하나 추가 → 목록에 바로 뜨는지, 이름/영문명/정렬 수정이 되는지 확인
3. **FORMULAS → + NEW FORMULA** → TECHNIQUE을 "폼 케이크"로 선택 → METHOD 선택창에 "오일 유화법"이 뜨는지 확인
4. TECHNIQUE을 다른 걸로 바꿔보고 METHOD 선택이 자동으로 비워지는지 확인
5. FORMULA 하나를 만든 뒤 상세 화면에서 METHOD를 바꿔보고, 헤더의 TECHNIQUE 옆에 METHOD 이름이 뱃지로 뜨는지 확인
6. 방금 만든 FORMULA가 사용 중인 METHOD를 SETTINGS → METHODS에서 삭제 시도 → "1개의 FORMULA에서 사용 중" 안내가 뜨고 삭제가 막히는지 확인

---

## 2026-08-29 — TECHNIQUE CATEGORY 구조 재정비 (taxonomy v1)

### 무엇이 달라졌나

COMPONENT/FORMULA가 쓰는 TECHNIQUE CATEGORY 26개를 새 기준으로 정리했습니다. 화면에서 실제로 보이는 변화는 다음과 같아요.

- **오일폼 케이크가 사라지고 CHIFFON은 "폼 케이크"로 이동**했습니다. "오일 유화법(Oil Emulsion)"은 별도 카테고리가 아니라 "폼 케이크" 소속 METHOD(제조 방식)로 등록됐어요 — 나중에 CHIFFON의 첫 FORMULA를 만들 때 이 METHOD로 연결할 예정입니다.
- **무스가 "크림 · 필링 → 휘핑크림" 밑의 3단계 하위 항목이었는데, 독립된 최상위 분류(02. MOUSSE)로 승격**됐습니다.
- 케이크/페이스트리/머랭/크림·필링 4개 최상위 그룹은 그대로 유지하되 영문 이름을 정리했고, 앞으로 쓸 새 최상위 분류 7개(과일/겔·젤리화/크런치·텍스처/초콜릿/설탕·캐러멜/글레이즈·코팅/피니싱·데코레이션)를 빈 상태로 미리 만들어뒀습니다 — 하위 항목은 실제 COMPONENT/FORMULA를 만들면서 필요할 때 추가합니다.
- 슈(Choux), 멜티드팻 케이크, 초콜릿 베이스 크림 등 기존 항목은 위치 변경 없이 그대로입니다.
- LEMON CURD는 영향 없음(그대로 "커드"에 연결).

### 테스트 방법

1. **COMPONENTS → CHIFFON 클릭** → TECHNIQUE CATEGORY가 "폼 케이크"로 표시되는지 확인 (예전엔 "오일폼 케이크"였음)
2. **COMPONENTS → LEMON CURD 클릭** → TECHNIQUE CATEGORY가 여전히 "커드"인지 확인 (변경 없음)
3. 아무 COMPONENT나 새로 만들 때 TECHNIQUE CATEGORY 선택창을 열어서 "오일폼 케이크"가 더 이상 없고, "무스"가 최상위 항목으로 뜨는지 확인
4. (선택) SETTINGS 등에서 카테고리 목록을 볼 수 있다면 과일/겔·젤리화/초콜릿 등 새 빈 최상위 분류 7개가 보이는지 확인 — 하위 항목은 아직 없는 게 정상

---

## 2026-08-29 — METHOD 데이터 모델 준비 (스키마만, taxonomy 재정비는 다음 단계)

### 무엇이 달라졌나

TECHNIQUE CATEGORY("무슨 기법군인가", 예: Foam Cake)와 METHOD("그 기법을 어떤 방식으로 만들었는가", 예: 공립법/오일 유화법)를 분리해서 관리하기로 확정했습니다. 이번 작업에서는 METHOD를 저장할 DB 구조만 먼저 만들었어요 — 화면은 아직 없습니다.

- METHOD는 특정 TECHNIQUE CATEGORY에 종속됩니다(공립법은 Foam Cake 전용).
- METHOD의 실제 값은 FORMULA(배합) 레벨에서만 저장됩니다 — TECHNIQUE CATEGORY + METHOD 둘 다 FORMULA가 갖고, COMPONENT에는 중복 저장하지 않습니다. (COMPONENT의 기존 `technique_category_id`는 아직 FORMULA 데이터/화면이 없어서 당분간 그대로 유지합니다.)
- 아직 기존 26개 TECHNIQUE CATEGORY 데이터는 손대지 않았습니다 — 예: 현재 "오일폼 케이크"가 별도 카테고리로 있는데, 이걸 "폼 케이크" + METHOD "오일 유화법"으로 재정비하는 작업은 매핑안을 먼저 확인받은 뒤 별도로 진행합니다.

### 지금 확인할 수 있는 것

화면이 아직 없어서 눈으로 테스트할 건 없어요. DB에 `methods` 테이블과 `formulas.method_id` 컬럼이 생성됐다는 것만 참고해주세요.

---

## 2026-08-29 — KNOWLEDGE 화면 완성 (목록·필터·CRUD·PRODUCT 연동)

### 무엇이 달라졌나

앞서 스키마만 준비됐던 KNOWLEDGE가 이제 실제로 쓸 수 있는 화면이 됐습니다.

- **KNOWLEDGE 탭**: 지식 항목 목록이 뜨고, 전체 / 일반 원칙만 / PRODUCT·COMPONENT·INGREDIENT·TECHNIQUE 별로 필터할 수 있어요. "+ ADD KNOWLEDGE"로 제목/본문과 함께 원하는 연결 대상(제품/구성요소/재료/기법, 전부 선택 안 해도 됨)을 골라 새로 추가하고, 항목을 눌러 바로 수정하거나 삭제할 수 있습니다.
- **PRODUCT DETAIL의 KNOWLEDGE 섹션**: 그 제품에 연결된 지식만 모아서 보여주고, "+ ADD KNOWLEDGE"를 누르면 이 제품에 자동으로 연결된 채로 새 지식을 바로 추가할 수 있어요.

이번 작업은 화면(UI)만 새로 만든 것이라 DB 변경은 없었고, 별도로 진행 중이던 REFERENCES 스키마·PRODUCT DETAIL의 OBSERVATIONS 작업과 합쳐서 반영했습니다.

### 테스트 방법

1. **KNOWLEDGE 탭 진입** → 목록이 placeholder 대신 실제로 뜨는지 확인 (아직 아무것도 없으면 빈 상태 문구가 정상)
2. **"+ ADD KNOWLEDGE"** → 제목/본문 입력, 연결 대상 선택 없이 저장 → 목록에 "일반 원칙"으로 뜨는지 확인
3. 다시 하나 추가하면서 이번엔 PRODUCT 하나를 연결 → 필터에서 그 제품을 선택했을 때만 뜨는지 확인
4. 항목 클릭 → 제목/본문/연결 대상 수정 → 저장 후 반영되는지 확인, DELETE도 확인
5. **PRODUCTS → 아무 제품 클릭** → KNOWLEDGE 섹션에 이 제품과 연결된 항목만 뜨는지 확인, "+ ADD KNOWLEDGE"로 추가하면 자동으로 이 제품에 연결되는지 확인

---

## 2026-08-29 — PRODUCT DETAIL에 OBSERVATIONS 목록 추가

### 무엇이 달라졌나

**제품(PRODUCT) 상세 화면**의 "OBSERVATIONS" 자리가 빈 "NEXT PHASE" 표시였는데, 이제 그 제품으로 진행된 모든 실험에서 남긴 관찰 기록(예: "HEIGHT — 12cm peak → 10cm final")이 시간순으로 한눈에 모여서 보입니다. 각 항목을 누르면 그 관찰을 남긴 실험(#003 같은 번호)으로 바로 이동해요.

이 목록은 보기 전용이에요 — 관찰 기록 자체는 지금처럼 EXPERIMENT DETAIL 화면에서 추가/수정합니다. 새 테이블이나 컬럼은 필요 없었고, 기존 관찰-실험-제품 연결을 화면에 모아 보여준 것뿐이라 DB 변경 없이 바로 반영됐습니다.

### 테스트 방법

1. **PRODUCTS → 아무 제품 클릭**
2. 화면 하단쪽 "OBSERVATIONS" 섹션 확인
3. 그 제품으로 만든 실험에 관찰 기록이 하나도 없으면 "NO OBSERVATIONS YET" 문구가 정상
4. 관찰 기록이 있는 제품이라면, 목록에 뜨고 오른쪽의 실험 번호(#001 등)를 누르면 해당 실험 상세로 이동하는지 확인
5. (선택) EXPERIMENT DETAIL에서 새 관찰을 추가해보고, 그 실험이 속한 PRODUCT 상세로 돌아와서 방금 추가한 관찰이 뜨는지 확인

---

## 2026-08-29 — REFERENCES 데이터 모델 준비 (스키마만, 화면은 다음 단계)

### 무엇이 달라졌나

"REFERENCES"는 책·영상·아티클·웹사이트 같은 외부 참고자료를 정리해두는 공간이에요. KNOWLEDGE와 똑같이, 원하면 PRODUCT·COMPONENT·재료·기법 카테고리에 선택적으로 연결할 수 있고 안 하면 "일반 참고자료"로 취급됩니다. 종류(책/영상/아티클/웹사이트/기타), 링크, 저자/출처, 메모를 남길 수 있는 구조로 DB를 만들었어요. 이번에도 화면은 아직 없고 다음 단계에서 KNOWLEDGE와 함께 추가될 예정입니다.

### 지금 확인할 수 있는 것

화면이 아직 없어서 눈으로 테스트할 건 없어요. DB에 `reference_entries` 테이블이 생성됐다는 것만 참고해주세요.

---

## 2026-08-29 — KNOWLEDGE 데이터 모델 준비 (스키마만, 화면은 다음 단계)

### 무엇이 달라졌나

"KNOWLEDGE"는 특정 실험 하나에 묶이지 않는, 계속 쌓아가는 원칙/노하우를 남기는 공간이에요 (예: "다크초콜릿 템퍼링은 31-32도가 안정적"). 이번 작업에서는 이 데이터를 저장할 DB 구조만 먼저 만들었습니다 — 화면(입력 폼, 목록)은 아직 없어요, 다음 단계에서 추가됩니다.

지식 항목 하나는 제목/본문과 함께, 원하면 PRODUCT·COMPONENT·재료·기법 카테고리 중 여러 개에 동시에 연결할 수 있어요(예: "다크초콜릿" 재료 + "가나슈" 기법에 동시에 연결). 아무것도 연결 안 하면 "일반 원칙"으로 취급돼서 KNOWLEDGE 탭 전체 목록에만 뜨는 구조입니다.

### 지금 확인할 수 있는 것

화면이 아직 없어서 눈으로 테스트할 건 없어요. DB에 `knowledge_entries` 테이블이 생성됐다는 것만 참고해주세요.

---

## 2026-08-29 — COMPONENT 카테고리를 TECHNIQUE CATEGORY로 전환

### 무엇이 달라졌나

지금까지 COMPONENT(구성요소)를 만들거나 볼 때 뜨던 "CATEGORY" 선택창이, PRODUCT가 쓰는 것과 같은 자리를 빌려 쓰고 있었는데 실제로는 내용이 거의 비어있는(값 2개뿐인) 목록이었어요. 반면 FORMULA(배합) 화면에는 이미 "케이크 / 크리밍 케이크"처럼 잘 정리된 기법 분류 목록(TECHNIQUE CATEGORY)이 있었죠.

이제 이 둘을 다음과 같이 정리했습니다.

- **PRODUCT**: 계속 기존 CATEGORY(예: Cake, Tart, Bread)를 씁니다. 변경 없음.
- **COMPONENT**: 이제 FORMULA와 똑같은 TECHNIQUE CATEGORY 목록(예: 버터크림, 머랭, 폼 케이크)을 씁니다. COMPONENT 생성/상세 화면, PRODUCT 상세에서 컴포넌트를 새로 만들 때 모두 동일하게 적용됩니다.
- **FORMULA**: 원래도 TECHNIQUE CATEGORY를 썼고 그대로입니다. 즉 이제 COMPONENT와 FORMULA는 같은 기법 분류 체계를 공유해요.
- **INGREDIENT**: 카테고리 기능은 아직 이 작업 범위가 아니에요 (유제품/신선제품/초콜릿/가루류/넛트류 같은 재료 전용 분류는 별도로 준비 중).

기존에 COMPONENT 2건 중 "LEMON CURD"에 붙어있던 카테고리 값("FILLING")은 애초에 PRODUCT용 목록에 있던 값이라 기법 분류로 자동 변환할 수 없어서 초기화됐습니다 — 상세 화면에서 알맞은 기법 카테고리(예: 크림·필링 계열)로 다시 선택해주시면 됩니다.

### 테스트 방법

1. **COMPONENTS → 아무 컴포넌트 클릭** (또는 새로 CREATE COMPONENT)
   - 상단 우측 선택창이 "NO TECHNIQUE CATEGORY"이고, 눌러보면 FORMULA에서 보던 것과 같은 목록(케이크/페이스트리/머랭/크림·필링 등)이 뜨는지 확인
2. **PRODUCTS → 아무 제품 → + ADD COMPONENT → 검색해도 없는 이름 입력**
   - "TECHNIQUE CATEGORY (OPTIONAL)" 선택창이 뜨는지, 선택 후 CREATE 하면 정상 생성되는지 확인
3. **LEMON CURD 컴포넌트가 있다면** 상세 화면에서 카테고리가 비어있는 게 정상 — 원하는 기법 카테고리로 재선택
4. **SETTINGS → CATEGORIES**(PRODUCT용) 화면은 그대로 PRODUCT 카테고리만 관리하고, 카테고리 삭제 시 "몇 개 항목이 사용 중"이라는 안내도 이제 PRODUCTS/SUB CATEGORIES만 보여주는지 확인 (COMPONENTS/INGREDIENTS 줄은 더 이상 안 뜸 — 정상)

---

## 2026-08-28 — COMPONENT/INGREDIENT 상세 화면에 연결 목록 추가

### 무엇이 달라졌나

**구성요소(COMPONENT) 상세 화면**에 "이 구성요소로 어떤 실험을 진행했는지" 목록이 새로 생겼어요. 지금까지는 이 자리가 빈 "NEXT PHASE" 표시였는데, 이제 실제 실험 목록(번호/상태/가설/날짜)이 뜨고, 클릭하면 해당 실험 상세로 이동합니다.

**재료(INGREDIENT) 상세 화면**에는 "이 재료가 어떤 배합에 쓰였는지" 목록이 생겼어요. 배합 이름, 버전, 이 배합에서 쓰는 용량, 상태(DRAFT/CURRENT 등)가 보이고, 클릭하면 배합 상세로 이동합니다.

새 데이터베이스 테이블이나 컬럼은 필요 없었어요 — 원래 있던 연결 정보(실험이 어떤 구성요소로 만들어졌는지, 배합이 어떤 재료를 쓰는지)를 화면에 꺼내 보여준 것뿐이라, DB 변경 없이 바로 반영됐습니다.

### 테스트 방법

1. **PRODUCTS → 아무 제품 → 구성요소 클릭** (또는 COMPONENTS 메뉴에서 바로 진입)
   - 화면 하단쪽 "EXPERIMENTS" 섹션 확인
   - 그 구성요소로 실험을 하나도 안 만들었다면 "NO EXPERIMENTS YET" 문구가 보이는 게 정상
   - 이미 실험이 있는 구성요소라면, 실험 목록이 뜨고 클릭 시 실험 상세로 이동하는지 확인
2. **INGREDIENTS → 아무 재료 클릭**
   - "USED IN FORMULAS" 섹션 확인
   - 어떤 배합에도 안 쓰인 재료면 "NOT USED IN ANY FORMULA" 문구
   - 배합에 쓰인 재료라면, 배합명·버전·용량·상태가 뜨고 클릭 시 배합 상세로 이동하는지 확인
3. (선택) 재료를 배합에 새로 추가해보고, 그 재료 상세 화면에 돌아와서 방금 추가한 배합이 목록에 뜨는지 확인

---

## 2026-08-28 — 실시간 음성 작업 로그 (STEP10, MVP)

### 무엇이 달라졌나

베이킹하면서 손이 바쁠 때, 타이핑 대신 **말로** 작업 로그를 남길 수 있는 기능이에요. 실험이 RUNNING 상태일 때 EXPERIMENT DETAIL 화면의 PROCESS TIMELINE 섹션에 "VOICE LOG" 녹음 버튼이 새로 생겼습니다.

동작 방식:
1. REC 버튼 눌러서 말하기 (예: "지금 오븐에 넣었어", "10분 지났는데 색깔 좋아", "꺼냈어")
2. STOP 누르면 자동으로 텍스트 변환 + AI가 어떤 종류의 이벤트인지 분류
3. 화면에 분석 결과가 미리보기로 뜸 (수정 가능) — 시각은 **말을 시작한 그 순간**의 시간이 자동으로 찍혀요, AI가 처리하는 데 걸리는 시간과 무관하게
4. CONFIRM & SAVE를 눌러야 실제로 저장됨 (자동으로 조용히 저장되지 않음 — 오분류 위험을 줄이기 위한 안전장치)
5. "오븐에 넣었어" 같은 시작 발화와 "꺼냈어" 같은 종료 발화가 자동으로 짝지어져서, 오븐에 있던 실제 시간이 자동 계산됨

### 아직은 테스트할 수 없어요

이 기능은 Whisper(음성인식)와 Claude(이벤트 분류) API 키가 Supabase에 등록되어야 실제로 동작해요. 등록 전까지는 REC를 눌러도 "음성 처리에 실패했습니다" 오류가 뜨는 게 정상입니다.

### 등록 후 테스트 방법

1. 아무 실험을 RUNNING 상태로 변경
2. 실험 상세 화면 → PROCESS TIMELINE → VOICE LOG의 REC 버튼
3. "믹싱 시작"이라고 말하고 STOP
4. 미리보기에 TYPE=SPAN START, ACTION=MIX_START 근처로 뜨는지 확인 → CONFIRM & SAVE
5. 잠시 후 다시 REC, "다 됐어"라고 말하고 STOP
6. 미리보기에 TYPE=SPAN STOP, 방금 시작한 이벤트가 CLOSE EVENT로 자동 선택돼 있는지 확인 → CONFIRM & SAVE
7. 타임라인에 두 이벤트 사이 실제 소요 시간이 자동으로 표시되는지 확인
