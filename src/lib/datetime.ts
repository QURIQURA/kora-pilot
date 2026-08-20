/**
 * PILOT 날짜/시간 유틸 — Australia/Sydney 기준
 *
 * 절대 규칙:
 * - 모든 날짜는 로컬 타임존(Australia/Sydney) 기준 문자열 "YYYY-MM-DD"로 다룬다.
 * - new Date("YYYY-MM-DD") 같은 Date 생성자 직접 호출은 금지한다.
 *   (UTC로 파싱되어 하루 밀리는 버그를 방지하기 위함)
 * - 모든 컴포넌트는 반드시 이 파일의 유틸 함수만 사용한다.
 */

export const LOCAL_TZ = "Australia/Sydney";

const DATE_PARTS: Intl.DateTimeFormatOptions = {
  timeZone: LOCAL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
};

const TIME_PARTS: Intl.DateTimeFormatOptions = {
  timeZone: LOCAL_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const WEEKDAY_PARTS: Intl.DateTimeFormatOptions = {
  timeZone: LOCAL_TZ,
  weekday: "short",
};

/**
 * Date 객체를 "YYYY-MM-DD" 문자열로 변환 (로컬 타임존 기준)
 */
export function toLocalDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", DATE_PARTS).format(date);
}

/**
 * "YYYY-MM-DD" 문자열을 로컬 자정 기준 Date 객체로 변환
 * 날짜 파트를 숫자로 분해한 후 Date(year, month-1, day)로 생성한다.
 */
export function parseLocalDate(dateStr: string): Date {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date string: ${dateStr}. Expected YYYY-MM-DD.`);
  }
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * 현재 로컬 시간을 "HH:mm" 문자열로 반환
 */
export function nowLocalTime(): string {
  return new Intl.DateTimeFormat("en-AU", TIME_PARTS).format(new Date());
}

/**
 * 현재 시점의 ISO 문자열 (타임스탬프 기록용)
 */
export function nowLocalTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Date 또는 ISO 문자열을 "HH:mm"으로 포맷
 */
export function formatTime(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-AU", TIME_PARTS).format(date);
}

/**
 * Date 또는 ISO 문자열을 "YYYY-MM-DD HH:mm"으로 포맷
 */
export function formatDateTime(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return `${toLocalDateString(date)} ${formatTime(date)}`;
}

/**
 * "YYYY-MM-DD" 문자열에서 "2026-08-20 THU" 형태의 라벨 반환
 */
export function formatDateLabel(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  const weekday = new Intl.DateTimeFormat("en-AU", WEEKDAY_PARTS)
    .format(date)
    .toUpperCase();
  return `${dateStr} ${weekday}`;
}

/**
 * "YYYY-MM-DD" 문자열에 n일을 더하거나 뺀다
 */
export function addDays(dateStr: string, n: number): string {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + n);
  return toLocalDateString(date);
}

/**
 * 두 "YYYY-MM-DD" 문자열 사이의 일수 차이를 반환 (b - a)
 */
export function diffDays(a: string, b: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const da = parseLocalDate(a);
  const db = parseLocalDate(b);
  return Math.round((db.getTime() - da.getTime()) / msPerDay);
}

/**
 * 주어진 "YYYY-MM-DD"가 오늘인지 확인
 */
export function isToday(dateStr: string): boolean {
  return dateStr === toLocalDateString();
}
