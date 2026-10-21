/**
 * 2026-10-21 사용자 요청("일단 안보이게 하고 다시 정하자"): DIETARY 조립 기능(DIETARY 탭, FORMULA 버전 태그,
 * 주문의 DIETARY BUILD 선택, 세션 생성 시 고정 버전 사용)을 화면에서 숨긴다. 테이블과 데이터는 그대로이며
 * 이 값을 true로 바꾸면 전부 다시 나타난다. SETTINGS의 DIETARY TAGS, 주문의 태그 선택, 주문 목록의
 * DIETARY REQUIREMENT 열은 이 플래그와 무관하게 유지된다.
 */
export const DIETARY_ASSEMBLY_ENABLED = false;
