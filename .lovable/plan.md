# PILOT — Phase 4B: Process Timeline + 실시간 기록

Experiment Detail에 실시간 공정 기록(START/STOP/LOG)과 타임라인을 구현한다.
모든 시간 기록은 datetime.ts 유틸 경유, 저장은 timestamptz(초 단위), 표시는 Australia/Sydney 로컬.

## 1. 데이터베이스 (마이그레이션)

**process_categories**
- `id`, `user_id`, `name`, `color` (기본 `#D4D3CE`), `sort_order`, `is_default`, created/updated_at
- 기본 5종 시드: PREP / MIXING / BAKING / COOLING / DECOR
  - 신규 사용자: `handle_new_user()` 트리거에 기본 카테고리 INSERT 추가
  - 기존 사용자: 마이그레이션에서 아직 기본 카테고리가 없는 user에게만 backfill INSERT
- GRANT(authenticated 전체 / service_role ALL) + RLS(`auth.uid() = user_id`)

**process_events**
- `id`, `user_id`, `experiment_id` (FK experiments), `action` (text), `category_id` (FK process_categories, nullable), `event_type` (enum `process_event_type`: `point` | `span`), `started_at` (timestamptz, not null), `ended_at` (timestamptz, nullable — 진행 중 = null), `note`, created/updated_at
- CHECK: `ended_at IS NULL OR ended_at >= started_at` (두 컬럼 간 불변 조건이라 CHECK 사용)
- 동시 다발 span 허용 — 진행 중 이벤트에 대한 유니크 제약 없음
- GRANT + RLS(own rows) + updated_at 트리거

## 2. datetime.ts 확장 (절대 규칙 유지)

- `formatDuration(seconds)` → `"45 SEC"` / `"12 MIN"` / `"1H 24M"`
- `formatTimeWithSeconds(iso)` → `"HH:MM:SS"` (수동 편집 입력 표시용)
- `localDateTimeToISO(dateStr, "HH:MM:SS")` → 로컬 시각을 ISO(UTC)로 변환. `Intl.DateTimeFormat`의 formatToParts로 Sydney 오프셋을 계산하는 방식 (DST 안전). `new Date("YYYY-MM-DDTHH:mm")` 직접 파싱 금지 규칙 유지.

## 3. 도메인/쿼리

**src/lib/process.ts** — `ProcessCategory`, `ProcessEvent` 타입, `eventDurationSeconds(event, now)`, 진행 중 여부 헬퍼.

**src/lib/queries.ts 추가**
- `processCategoriesQuery()`, `processCategoryUsageQuery()` (process_events 참조 수)
- `processEventsQuery(experimentId)` — started_at 오름차순, category join
- `recentProcessEventsQuery()` — 최근 8개 + experiments(id, experiment_number) join (대시보드 위젯용)

## 4. 공용 컴포넌트

- `ProcessCategoryCreateForm` (CategoryCreateForm 패턴, 이름+색상)
- `ProcessCategorySelect` — MouldSelect와 동일한 "+ NEW …" 즉석 생성 모달 패턴
- `ProcessCategoryManager` — Settings용 목록/수정/색상/삭제(사용 중이면 삭제 보호 경고)
- `ProcessTimelineSection` — Experiment Detail의 핵심 섹션 (아래 5번)

## 5. Experiment Detail — PROCESS TIMELINE

기존 `NextPhaseSection title="PROCESS TIMELINE"` 자리를 실제 섹션으로 교체.

**QUICK LOG 바** (실험 status = RUNNING일 때 표시)
- ACTION 텍스트 입력 + ProcessCategorySelect + [START] [LOG]
- [START]: `nowLocalTimestamp()`로 span 이벤트 생성(ended_at null)
- [LOG]: point 이벤트 생성
- 진행 중 span은 경과 시간이 1초 tick(`setInterval` + 로컬 state clock)으로 올라가며 표시, [STOP] 버튼 → ended_at 기록
- 모바일(`< sm`): 화면 하단 고정 바(`fixed bottom-0`), 버튼 최소 48px, ACTION 입력 → START 한 손 조작 가능. 본문 하단에 동일 높이 spacer 추가해 가림 방지.

**타임라인 목록** (started_at 시간순)
- 행: TIME(HH:MM) / ACTION / DURATION(formatDuration, point는 "—") / CATEGORY
- 카테고리 색 → 행 배경 50% opacity (사용자 지정 hex라 inline style + `80` alpha), 진행 중 이벤트는 점선 보더
- 각 행 인라인 편집: ACTION 텍스트, 카테고리, 시작/종료 시각(`HH:MM:SS` 입력 → `localDateTimeToISO(실험 date, …)`로 변환 저장), note, REMOVE(삭제 허용)
- "+ ADD PAST EVENT": 날짜+시각 지정 수동 추가 폼 (기록 못한 과거 작업 보완)

## 6. Settings + Dashboard

- Settings에 PROCESS CATEGORIES 관리 섹션 추가 (MouldManager 패턴)
- `recent-process-logs.widget.tsx` 생성 후 `src/widgets/registry.ts`에 명시 import로 등록 — 최근 이벤트 TIME/ACTION/소속 실험 번호, 클릭 시 실험 상세로 이동

## 검증

- 타임존: Sydney 로컬로 START → DB 저장값(UTC)과 표시값이 일치하는지 확인
- span 진행 중 새로고침 후에도 진행 상태 유지(ended_at null 기반), STOP 후 duration 계산 확인
- 과거 이벤트 수동 추가/수정(정방향+역방향 시각 편집) 테스트
- 기존 사용자에게 기본 process_categories backfill 적용 확인

## 기술 참고

- 진행 중 경과 시간 표시는 DB 폴링이 아닌 1초 로컬 타이머 + `started_at` 기준 계산(Realtime 불필요)
- 쿼리 무효화 키: `["process_events", experimentId]`, `["recent_process_events"]`, `["process_categories"]`
- 타입: 마이그레이션 후 `Tables<"process_events">` / `Tables<"process_categories">` 사용
