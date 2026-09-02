## 2026-09-02 — WEIGHING MATRIX (스프레드시트형 동시 계량 화면으로 전면 개편)

### 무엇이 달라졌나

- **WEIGHING VIEW**가 카드/리스트 나열 방식에서 **엑셀 시트 같은 매트릭스(표)**로 전면 개편되고, 메뉴 이름도 **WEIGHING MATRIX**로 바뀌었습니다.
- **행 = 재료(Ingredient Master 기준), 열 = 현재 Work Session에 선택된 Formula Version.** 동일 Ingredient Master ID는 모든 Formula 열에 걸쳐 항상 같은 한 줄(행)에 나옵니다 — 예: Butter가 3개 레시피에 쓰이면 Butter 행이 하나만 생기고, 그 행 안에서 각 레시피 열에 각자의 수량이 따로 표시됩니다.
- **수량은 절대 합산하지 않습니다.** 같은 재료라도 Formula별 칸에 각자의 (원본 수량 × 그 Formula Version의 현재 multiplier) 값만 독립적으로 표시됩니다. 한 재료의 총합을 보여주는 숫자는 어디에도 없습니다.
- 재료(첫 번째) 열은 가로 스크롤 시에도 화면 왼쪽에 고정되어, Formula가 많아 옆으로 스크롤해도 지금 보고 있는 줄이 어떤 재료인지 항상 확인할 수 있습니다.
- 체크 상태(NOT STARTED/DONE/SHORTAGE/SKIPPED)는 각 칸 안의 작은 아이콘 버튼으로 옮겨져 시각적으로 보조 역할만 하고, 수량 숫자가 항상 가장 크고 먼저 보이도록 했습니다. SHORTAGE 상태일 때만 칸을 눌러 메모를 입력할 수 있습니다(기존과 동일하게 서버에 저장/유지).
- **FORMULA VIEW**(원래 레시피 구조 그대로, Formula 하나씩 세로로 읽는 화면)는 그대로 유지됩니다 — 매트릭스는 "여러 레시피 동시 비교/계량"용, Formula View는 "레시피 하나 자세히 읽기"용으로 역할이 나뉩니다.
- 데이터/저장 구조는 전혀 바뀌지 않았습니다 — `work_sessions`/`work_session_formula_versions`/`work_session_progress`/`formula_versions`/`formula_version_ingredients`/`ingredients` 위에 표시 방식만 바뀐 것이고, 새 테이블이나 "재료 통합" 개념은 추가되지 않았습니다. 그룹핑은 기존과 동일하게 `ingredient_id` 기준입니다.

### 테스트 방법

1. Work Session에 서로 다른 Formula Version을 2~3개 추가(공통 재료가 하나 이상 포함되도록, 예: Heavy cream이 여러 Formula에 쓰이는 조합)
2. **WEIGHING MATRIX**로 들어가서 공통 재료가 한 행에만 나오고, 그 행 안에서 Formula별 칸에 서로 다른 수량이 각각 표시되는지 확인 — 합산된 숫자가 아닌지 확인
3. Formula 열이 많을 때 가로로 스크롤해도 재료(첫 번째) 열이 화면에 고정되어 있는지 확인
4. 칸의 작은 상태 버튼을 눌러 NOT STARTED → DONE → SHORTAGE → SKIPPED 순으로 바뀌는지, SHORTAGE일 때 메모 입력이 뜨는지, 새로고침 후에도 상태/메모가 유지되는지 확인
5. **FORMULA VIEW**로 전환해 기존과 동일하게 Formula별 세로 리스트로 보이는지 확인

---
