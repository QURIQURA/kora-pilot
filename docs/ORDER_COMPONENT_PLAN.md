# Order / Production 공용 계획

## 기존 동작

Order의 SHEET/CREAM/FILLING Formula 선택은 DB 트리거로 Work Session 선택에 연결된다.
Production에서 Formula를 바꾸면 같은 슬롯에 Formula가 하나인 경우 Order의 선택도 갱신된다.
서로 다른 Formula가 여러 개인 슬롯은 하나로 추정하지 않고 목록을 보인다.
Production의 원재료 덮어쓰기는 해당 Formula Version 자체를 수정하므로 다른 작업도 영향을 받는다.

## 변경

Order의 각 실제 작업 항목에 레시피 버전, 이 주문 사용 목표(g), 생산 배수와 버전 고정을 추가한다.
별도 주문 계획 테이블로 복사하지 않고 work_session_formula_versions의 같은 행을 편집한다.

- `target_quantity_g`: 이 주문에 사용할 총량. 기존 값은 NULL로 두며 자동 추정하지 않는다.
- `multiplier`: 생산 배수. 기본 배합 × 배수로 생산량을 계산한다.
- 사용 목표를 바꿔도 생산 배수를 자동 반올림하거나 바꾸지 않는다.
- 생산량 − 사용 목표를 잔량/부족으로 표시한다. 목표가 하나라도 미지정이면 합산 잔량도 미지정이다.
- 생산 배수는 직접 변경할 때 양의 정수만 허용한다. MERGE가 나눈 기존 소수 배정은 다른 필드만
  저장할 때 그대로 보존한다. 새 소수 입력은 허용하지 않는다.
- `version_pinned`: 새로 선택한 주문용 버전이 이후 CURRENT 승격에 교체되지 않도록 한다.
  기존 행은 false로 기존 동작을 유지하며 과거 데이터를 자동 분류하지 않는다.
- Production에서 새 DRAFT/새 Component·Formula를 만들면 선택한 작업 항목에 연결하고 고정한다.
- MERGE 상태의 레시피 편집은 변경할 주문 항목을 명시적으로 고른다. 다른 주문은 그대로 둔다.
- Order의 Formula 드롭다운 변경은 기존 Order SAVE로, 실제 버전/목표/배수는 생산 계획 저장으로 저장한다.
  Formula 선택이 아직 저장되지 않았으면 기존 항목의 생산 계획 저장은 잠근다.
- 원본 덮어쓰기는 기존처럼 해당 버전을 쓰는 모든 곳에 영향을 주며 UI에 범위를 설명한다.

## 저장과 동기화

SECURITY INVOKER RPC `save_order_component_plan`은 auth.uid 소유권, updated_at 충돌,
완료/취소 상태, 버전 소유권, dietary build 제한, 수량을 검증한 후 한 트랜잭션으로 저장한다.
배수 이력과 기존 order_production_sync_log의 before/after 기록도 남긴다.
익명 실행 권한은 없다. 기존 작업 항목/주문/세션/시간 기록을 재생성하지 않는다.
Order와 Production은 기존 user_id 스코프 Realtime/BroadcastChannel/캐시 갱신을 공유한다.

## 검증

- TypeScript 검사, 34개 시스템 테스트, production build 통과.
- 임시 PGlite DB에 기존 Order↔Production 트리거와 이번 migration을 로드했다.
- 기존 `tests/order-production-sync.sql`과 신규 `tests/order-component-plan.sql`을 롤백 트랜잭션으로 실행했다.
- 목표/배수 공유, 역방향 새 Formula 연결, 고정 DRAFT 유지, 기존 작업 기록 보존,
  타 사용자 접근/오래된 수정/음수 목표/새 소수 배수/완료 주문 차단을 확인했다.
- 운영 DB migration은 자동 승인 검토에서 차단되어 미적용 상태다. 브라우저 실사용 검증은 미실시다.

## 적용·되돌리기

DB migration을 먼저 적용한 뒤 프런트엔드를 배포한다. 새 UI를 DB보다 먼저 배포하지 않는다.
되돌릴 때 UI 커밋을 먼저 revert하고 신규 목표/버전 고정 값은 삭제하지 않는다.
CURRENT 자동 전환 트리거의 이전 정의는 `20261028013404_respect_order_formula_selection.sql`에 있다.
기존 기록을 보존하려면 새 nullable/default 필드는 남겨둘 수 있다. RPC 제거는 의존성을 확인한 후 진행한다.
