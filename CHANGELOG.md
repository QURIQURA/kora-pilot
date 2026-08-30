# KORA PILOT — 기능 변경 기록 (사용자용)

개발 진행 중 추가/변경된 기능을 시간순으로 남깁니다. 각 항목에는 "무엇이 달라졌는지"와 "직접 눌러서 확인하는 방법"을 같이 적습니다.

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
