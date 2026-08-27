# Kora Pilot

PILOT — 개인 제과 R&D 시스템의 기반 골격을 만든다.
이번 작업은 "기반(Phase 0~1)"만 구현한다. 데이터 테이블 생성, 상세 화면, AI 기능은 아직 만들지 않는다.

@project:8107281d-4f79-4569-ad09-bf5571f7e0aa:"WANN-PLANNER"  프로젝트의 디자인 시스템을 코드베이스에서 직접 참조해서 동일하게 재현한다:
- 폰트: DM Mono Light / IBM Plex Mono
- 배경 #F5F4F1, 보더 #D4D3CE, 텍스트 #1A1A18
- 1px 보더, 최소한의 border radius, 무채색 모노톤, UPPERCASE 라벨
- 그림자 / 그라데이션 / 둥근 카드 / 화려한 SaaS 대시보드 스타일 금지

이번에 구현할 것 (순서대로):

1. 날짜/시간 유틸 — 가장 먼저, 반드시
   - src/lib/datetime.ts 파일 하나에 로컬 타임존(Australia/Sydney) 기준 유틸 함수를 만든다:
     toLocalDateString(), parseLocalDate(), nowLocalTime(), formatTime() 등
   - 날짜는 항상 로컬 기준 문자열(YYYY-MM-DD)로 다루고,
     new Date("YYYY-MM-DD") 같은 Date 생성자 직접 호출은 프로젝트 전체에서 금지한다.
   - 모든 컴포넌트는 반드시 이 유틸만 사용한다. 이 규칙을 파일 상단 주석에 명시한다.
   - 이 앱은 베이킹 공정의 타임스탬프 자동 기록이 핵심이므로 타임존 정확성이 매우 중요하다.

2. 레이아웃 셸
   - 왼쪽: 글로벌 네비게이션
     DASHBOARD / PRODUCTS / FORMULAS / EXPERIMENTS / KNOWLEDGE / INGREDIENTS / REFERENCES
     하단에 SETTINGS
   - 상단: breadcrumb 영역. 모든 페이지에 고정 표시하고, 각 단계는 클릭 가능하게 만든다.
     예: PILOT / PRODUCTS / CAKES / CHIFFON
     스크롤해도 breadcrumb이 사라지지 않는다.
   - 중앙: 메인 콘텐츠 영역
   - 모바일: 네비게이션은 compact하게, breadcrumb은 축약하되 전체 경로를 확인할 수 있는
     방법을 제공한다. 주방에서 한 손으로 쓸 수 있도록 터치 영역을 크게 한다.

3. 위젯 레지스트리 구조
   - 부수효과 import(registerWidget() 호출) 방식은 금지한다. 트리셰이킹으로 제거될 수 있다.
   - 대신 각 위젯이 export const xWidget: WidgetDef = {...} 형태로 값을 export하고,
     중앙 registry 파일이 이 값들을 명시적으로 import해서 배열로 모으는 방식으로 만든다.

4. 각 메뉴의 빈 페이지 (empty state)
   - "NO PRODUCTS YET" + "+ CREATE" 버튼처럼 간결한 텍스트와 행동 버튼만.
   - 일러스트, 아이콘 장식 금지.

Supabase(KORA Business)는 연결 상태만 유지하고, 테이블 생성은 다음 단계에서 진행한다.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://kora-pilot.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e2009f44-8619-4e71-8a9f-20dc744ceeb9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
