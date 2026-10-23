# SHCS 사이즈 시스템 정리 — 2단계 보고

2026-10-23. 기존 ID와 테이블을 유지하고 관리 화면·선택 검증·계산 범위를 정리했다.

## 구조 판단

Mould는 실제 도구와 기준 반죽량, Base Weight는 Component 제조 목표 g 프리셋,
Cake Size는 공용 완성 외형 규격, Product Size는 제품별 외형·구성 목표·판매가의 기준이다.
용도가 달라 DB를 즉시 한 테이블로 합치지 않는다. 먼저 같은 SIZES 관리 화면에서 명시적으로 연결한다.
Mould의 높이 10cm가 완성 케이크 높이 10cm를 보장하지 않는다.

## 변경 파일과 효과

- `src/lib/size-configuration.ts`: 실제 양수 치수 및 정확한 ID로 연결 검증. 이름/인치로 자동 매핑하지 않는다.
- `src/components/pilot/ProductSizesSection.tsx`: 공용 규격 선택·치수 불러오기·연결 저장, 불일치 표시, 사용 중 삭제 방지.
- `src/components/pilot/CakeSizeManager.tsx`: 실제 원형 지름/스퀘어 가로·세로 입력, 누락 경고, 사용 중 삭제 방지.
- `src/routes/_authenticated/settings.tsx`: SIZES 관리 영역으로 공용 규격과 제품별 구성을 함께 배치.
- `src/routes/_authenticated/products/$productId.tsx`: 제품 사이즈 편집 복원, 원가 계산 사이즈 선택, 공통 목표를 지우지 않고 사이즈별 목표 추가.
- `src/routes/_authenticated/orders/$orderId.tsx`: 명시적인 제품 사이즈 선택 시 연결 공용 규격 동시 지정, 잘못된 연결 차단.
- `src/lib/work-session.ts`: 신규 세션에 주문 수량 전달, 연결 검증, 기존 세션 즉시 반환, kg 단위 환산.
- `src/components/pilot/WorkSessionWorkspace.tsx`: 선택한 Formula Version과 생산 개수에 맞춘 목표 제안, 소수 배수와 입력 검증.
- `src/lib/product-usage.ts`, `src/lib/production-efficiency.ts`: 공통/사이즈별 그룹 선택과 동일 Formula 합산 규칙을 공유.
- `src/lib/cost.ts`, `src/lib/queries.ts`: 사용 행에 지정된 버전 원가, 미확정 원가 처리, 대시보드와 제품 페이지 계산 일치.
- 재료/Formula 상세: 원가 관련 변경 후 새 원가 조회 캐시 갱신.
- `src/components/pilot/ProductOrderSizesSection.tsx`: 동명 공용 규격을 ID로 구별하는 표기.
- `tests/size-system.test.mjs`, `tests/load-ts.mjs`: 실제 도메인 함수와 모의 DB 경계 회귀 테스트.
- `docs/SHCS_OPERATION_GUIDE.md`: 현재 화면 사용 순서와 남은 한계 명시.

## DB 변경 및 보존

이번 단계의 마이그레이션·기존 데이터 수정·병합·삭제는 0건이다.
조회 시 주문 16건, 세션 11건, 공용 규격 6건, 제품 사이즈 4건, 컴포넌트 연결 21건이었다.
각 테이블의 정렬된 전체 행 해시가 작업 전후 동일했다. 기존 Cacao 주문은 자동 매핑하지 않았다.
1단계에서 추가한 참고 몰드 6건은 유지한다.

기존 공용 사이즈의 이름/실제 치수 불일치, 누락된 실제 치수, 제품 사이즈와 공용 규격의 치수 충돌은 남아 있다.
정확한 완성 치수 확인 없이 수정하거나 이름으로 합치지 않았다. 실제 레코드 변경은 별도 변경 명세·백업·롤백·승인 후 진행한다.
소스 롤백은 이 단계 커밋의 revert와 Lovable 재배포로 가능하며 DB 데이터 롤백은 이번 단계에 필요하지 않다.

## 검증과 한계

자동 검증은 몰드 매핑 6개와 사이즈·사용량·원가·세션 회귀 11개, 총 17개다.
기존 세션 보존, 기존 Cacao 미매핑, 주문 수량/링크 전달, 잘못된 연결 차단을 모의 Supabase 경계에서 확인한다.
실제 운영 DB에는 테스트 주문/세션을 생성하지 않았다.

TypeScript 검사와 프로덕션 빌드가 통과했다. 변경 TypeScript 파일 ESLint는 오류 0개이며 기존 Hook 의존성 경고 1개가 남아 있다.
`npm run test:system`은 17개 모두 통과했다.
브라우저 실행 환경 준비에 실패해 실제 로그인 화면의 클릭 기반 E2E는 수행하지 못했다.
배포 후 실제 화면에서 몰드 선택→치수 입력→제품 사이즈→주문→세션→목표 제안을 확인해야 한다.

원가는 현재 재료 가격·원료 투입량 기준 추정이다. 제품별 제조 수율, 역할별 샌딩/아이싱 목표, 원가 스냅샷,
로트별 재고와 원자적 입출고는 구현되지 않았다. 이번 수정이 재고 자동 차감의 전체 검증을 의미하지 않는다.
