# PILOT — Phase 0~1 기반 골격

## 참조 프로젝트 확인 결과

WANN-PLANNER 코드베이스를 스냅샷으로 열어 확인했습니다. 해당 프로젝트에는 아직 화면/컴포넌트/토큰이 없습니다 (`src/routes`에 `__root.tsx`만 있고 페이지 없음, `styles.css`는 기본 shadcn 템플릿 그대로, Supabase 연동 파일만 존재). 따라서 "재현할 디자인 시스템 코드"는 존재하지 않으므로, 요청에 적어주신 사양(폰트/색/보더 규칙)을 기준으로 PILOT에 디자인 시스템을 새로 정의합니다.

## 1. 디자인 시스템

`src/styles.css`의 토큰을 모노톤으로 교체:

- `--background #F5F4F1`, `--foreground #1A1A18`, `--border/--input #D4D3CE`, `--muted-foreground` 는 중간 그레이 (oklch 표기)
- `--radius: 0`(사실상 sharp), 그림자/그라데이션 토큰 미사용
- 폰트: `__root.tsx` head에 Google Fonts `<link>` — DM Mono 300, IBM Plex Mono 300/400/500
  - `@theme`에 `--font-body: "DM Mono", monospace`, `--font-mono: "IBM Plex Mono", monospace`
  - 기본 본문은 DM Mono Light 300, 라벨/코드/네비게이션은 IBM Plex Mono
- `@utility label-caps`: UPPERCASE + letter-spacing, 라벨 전용

## 2. 날짜/시간 유틸 (가장 먼저)

`src/lib/datetime.ts` — Australia/Sydney 고정, 파일 상단에 "모든 컴포넌트는 이 유틸만 사용, `new Date("YYYY-MM-DD")` 금지" 규칙 주석.

- `LOCAL_TZ`
- `toLocalDateString(d?)` → `YYYY-MM-DD` (Intl.DateTimeFormat + `en-CA`, timeZone 고정)
- `parseLocalDate("YYYY-MM-DD")` → 로컬 자정 기준 Date (문자열 파싱 후 숫자 인자로 생성)
- `nowLocalTime()` → `HH:mm`
- `nowLocalTimestamp()` → ISO 문자열 (기록용)
- `formatTime(date|iso)`, `formatDateTime()`, `formatDateLabel()` (예: `2026-08-20 THU`)
- `addDays(dateStr, n)`, `diffDays(a, b)`, `isToday(dateStr)`
- 이후 ESLint 규칙 없이도 지켜지도록 주석 + README 한 줄 명시

## 3. 레이아웃 셸

`src/routes/__root.tsx` 안에서 `AppShell`로 감싸고 `<Outlet />` 렌더.

- `src/components/layout/AppShell.tsx` — 좌측 사이드바 + 상단 고정 breadcrumb + 메인 영역 (1px 보더 구획)
- `src/components/layout/SideNav.tsx` — DASHBOARD / PRODUCTS / FORMULAS / EXPERIMENTS / KNOWLEDGE / INGREDIENTS / REFERENCES, 하단 SETTINGS. `<Link>` + `activeProps`. 아이콘 없이 UPPERCASE 텍스트.
- `src/components/layout/Breadcrumb.tsx` — `sticky top-0` 로 스크롤에도 유지. 각 단계는 `<Link>`. 경로에서 자동 생성 (`PILOT / PRODUCTS / ...`).
- 모바일: 사이드바는 상단 햄버거 → 전체화면 드로어(터치 타깃 최소 48px). breadcrumb은 `PILOT / … / CURRENT` 로 축약하고 탭하면 전체 경로 목록을 펼침.

## 4. 위젯 레지스트리

- `src/widgets/types.ts` — `WidgetDef { id, title, size, component }`
- 예시 위젯 2개: `src/widgets/today.widget.tsx`, `src/widgets/recent-experiments.widget.tsx` — 각각 `export const todayWidget: WidgetDef = {...}`
- `src/widgets/registry.ts` — 위 값들을 명시적 import 후 `export const widgets: WidgetDef[] = [todayWidget, recentExperimentsWidget]`. 부수효과 `registerWidget()` 없음.
- DASHBOARD 페이지가 `widgets`를 순회 렌더 (내용은 빈 상태 텍스트)

## 5. 라우트 + 빈 상태

`src/routes/index.tsx`(DASHBOARD), `products.tsx`, `formulas.tsx`, `experiments.tsx`, `knowledge.tsx`, `ingredients.tsx`, `references.tsx`, `settings.tsx`.

- 각 라우트에 고유한 `head()` (title/description/og)
- `src/components/EmptyState.tsx` — `NO PRODUCTS YET` + `+ CREATE` 버튼만. 일러스트/아이콘 없음. 버튼은 현재 동작 없음(다음 단계에서 연결).

## 데이터

이번 단계에서는 테이블 생성 없음. PILOT 프로젝트 자체에는 아직 Cloud/Supabase 연동 파일이 없으므로, 다음 단계에서 테이블을 만들 때 함께 활성화합니다.
