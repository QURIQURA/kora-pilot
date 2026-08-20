# PILOT — Phase 2: Products / Components / Ingredients

## 목표

Supabase에 데이터 구조를 만들고 PRODUCTS / COMPONENTS / INGREDIENTS 화면을 실제 데이터와 연결한다. FORMULA / EXPERIMENT / KNOWLEDGE는 자리만 잡고 다음 Phase에서 연결한다.

## 로그인

이메일 로그인을 도입한다. `/auth` 화면(로그인 / 가입)을 추가하고, 데이터 화면은 로그인한 사용자 전용 영역으로 옮긴다. 모든 데이터는 내 계정에 귀속되며 다른 사람은 볼 수 없다.

## 데이터 구조

- **categories** — name, parent_id(계층: CAKES > CHIFFON), color, sort_order
- **tags** — name, color
- **products** — name, category_id, status(IDEA/ACTIVE/TESTING/STABLE/ARCHIVED), description, notes, product_target(jsonb)
- **product_tags** — product ↔ tag 연결
- **components** — name, category_id, description, notes (여러 product에서 재사용)
- **product_components** — product ↔ component 연결(복사 아님), 정렬 순서 포함
- **ingredients** — name, category_id, supplier, brand, default_unit, notes
- **ingredient_functions** — 기능 마스터(기본 제공 + 직접 추가)
- **ingredient_function_links** — ingredient ↔ function 다대다

기본 제공 데이터(로그인 시 자동 생성): 카테고리는 `SAMPLE_CAKES > SAMPLE_CHIFFON`, `SAMPLE_TARTS`, `SAMPLE_COOKIES`, `SAMPLE_CREAMS` 처럼 이름 앞에 SAMPLE_ 을 붙여 샘플임을 명시하고 각각 색상 지정. 기능 목록은 FAT / PROTEIN / STRUCTURE / AERATION / WATER / SWEETENER / FLAVOUR / ACID / LEAVENING / STABILISER / MOUTHFEEL / EMULSIFIER (샘플 표기 없이 기본 제공).

`product_target`은 texture / sweetness / acidity / richness / stability / visual / shelf_life 기본 항목 + 사용자가 직접 추가하는 custom 항목을 함께 담는다.

## 화면

### 1. PRODUCTS 목록 `/products`
- 상단: `+ CREATE PRODUCT`
- 필터: CATEGORY(계층 표시) / STATUS / TAG — 하나의 필터 바로 통합
- 정렬: UPDATED / CREATED / NAME
- 행 표시: NAME · CATEGORY · STATUS · COMPONENT COUNT · UPDATED
- STATUS는 컬러 남용 없이 뱃지/보더로 표현 (CURRENT/ACTIVE 계열은 검정 배경 + 흰 텍스트)
- 비어 있으면 `NO PRODUCTS YET` + `+ CREATE PRODUCT`

### 2. CREATE 플로우
- 이름 + 카테고리 + 상태만 받는 짧은 폼(모달). 저장 즉시 Detail로 이동
- 나머지 정보는 Detail에서 점진적으로 추가

### 3. PRODUCT DETAIL `/products/$productId`
- Breadcrumb에 카테고리 경로 포함: `PILOT / PRODUCTS / CAKES / CHIFFON / MANDARIN LEMON CHIFFON` (sticky, 각 단계 클릭 가능)
- 헤더: 이름(인라인 수정), STATUS 변경, 태그 편집, 생성/수정 일시
- **PRODUCT TARGET** — 기본 속성 목록 + `+ ADD ATTRIBUTE`로 custom 추가. 각 항목은 값 + 메모
- **COMPONENTS** — 연결된 컴포넌트 목록(이름/카테고리), `+ ADD COMPONENT`
- **NOTES** — 자유 텍스트
- **FORMULAS / EXPERIMENTS / OBSERVATIONS / KNOWLEDGE** — 섹션 자리만 두고 "NEXT PHASE" 표기

### 4. + ADD COMPONENT
- 하나의 패널에서 기존 컴포넌트 검색 → 선택해 연결 (중복 생성 방지)
- 검색 결과 없을 때만 `CREATE "<입력한 이름>"` 로 새로 만들고 바로 연결
- 연결 해제 시 컴포넌트 자체는 삭제되지 않음 (다른 제품에서 계속 사용)
- 컴포넌트 목록 화면 `/components` 와 상세 `/components/$componentId` 추가 — 상세에는 "USED IN" 으로 역방향 탐색 제공. 상단 메뉴는 늘리지 않음

### 5. INGREDIENTS `/ingredients`
- 목록: NAME · CATEGORY · FUNCTIONS · SUPPLIER/BRAND · DEFAULT UNIT · UPDATED, 이름/기능 검색
- 생성: 이름 + 기본 단위로 시작, 상세에서 supplier/brand/notes 추가
- FUNCTION 다중 선택 — 기본 목록에서 고르거나 직접 입력해 새 기능 추가
- 상세 `/ingredients/$ingredientId` — 필드 편집 + 기능 편집

날짜/시간 표시는 전부 `src/lib/datetime.ts` 유틸만 사용한다.

## 기술 메모

- 마이그레이션 한 번으로 테이블 + GRANT + RLS(모두 `auth.uid() = user_id` 소유자 범위) + `updated_at` 트리거를 함께 생성
- 신규 가입/최초 로그인 시 샘플 카테고리와 기본 기능 목록을 넣는 트리거(`handle_new_user`)
- 데이터 화면은 `src/routes/_authenticated/` 아래로 이동하고 `/auth`는 공개 라우트로 유지. 사이드바 링크 경로는 그대로(`/products` 등) 유지되도록 구성
- 읽기/쓰기는 브라우저 Supabase 클라이언트 + TanStack Query(`useQuery`/`useMutation`)로 처리, 저장 후 관련 쿼리 무효화
- 공용 UI 추가: `Field`, `SectionCard`, `StatusBadge`, `CategoryPath`, `FilterBar` — 기존 모노톤 토큰만 사용(그림자/라운드/그라데이션 없음)
- Breadcrumb 컴포넌트를 라우트별 커스텀 세그먼트를 받을 수 있게 확장 (제품명·카테고리 경로 표시용)
