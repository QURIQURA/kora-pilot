# KORA PILOT — 기능 변경 기록 (사용자용)

개발 진행 중 추가/변경된 기능을 시간순으로 남깁니다. 각 항목에는 "무엇이 달라졌는지"와 "직접 눌러서 확인하는 방법"을 같이 적습니다.

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
