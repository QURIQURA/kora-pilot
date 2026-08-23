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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) {
    throw new Error(`Invalid date string: ${dateStr}. Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
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

/* ── Phase 4B — PROCESS TIMELINE용 시각/duration 유틸 ─────────────── */

const TIME_WITH_SECONDS: Intl.DateTimeFormatOptions = {
  timeZone: LOCAL_TZ,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

/**
 * Date 또는 ISO 문자열을 "HH:MM:SS"로 포맷 (수동 편집 입력 표시용)
 */
export function formatTimeWithSeconds(input: Date | string): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-AU", TIME_WITH_SECONDS).format(date);
}

/**
 * 초 단위 duration을 "M:SS" / "H:MM:SS" 형태로 포맷 (항상 초 포함)
 * - 1시간 미만: "12:34" (분:초)
 * - 1시간 이상: "1:24:05" (시:분:초)
 * tabular-nums와 함께 사용해 숫자가 흔들리지 않게 한다.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const seconds = s % 60;
  const minutes = Math.floor(s / 60) % 60;
  const hours = Math.floor(s / 3600);
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${ss}`;
  }
  return `${Math.floor(s / 60)}:${ss}`;
}

const OFFSET_PARTS: Intl.DateTimeFormatOptions = {
  timeZone: LOCAL_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
};

/**
 * 주어진 시점에서 로컬 타임존(Australia/Sydney)의 UTC 오프셋(ms)을 반환.
 * Intl formatToParts 기반이라 DST 전환에도 안전하다.
 */
function localOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", OFFSET_PARTS).formatToParts(
    date
  );
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * 로컬 날짜/시각("YYYY-MM-DD" + "HH:MM" 또는 "HH:MM:SS")을 ISO(UTC) 문자열로 변환.
 * new Date("YYYY-MM-DDTHH:mm") 같은 직접 파싱은 사용하지 않는다.
 */
export function localDateTimeToISO(dateStr: string, timeStr: string): string {
  const date = parseLocalDate(dateStr);
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeStr);
  if (!tm) {
    throw new Error(`Invalid time string: ${timeStr}. Expected HH:MM[:SS].`);
  }
  const guess = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    Number(tm[1]),
    Number(tm[2]),
    Number(tm[3] ?? "0")
  );
  // 로컬 시각을 UTC로 가정한 뒤 오프셋을 빼고, DST 경계를 위해 한 번 더 보정한다.
  const first = localOffsetMs(new Date(guess));
  let utc = guess - first;
  const second = localOffsetMs(new Date(utc));
  if (second !== first) utc = guess - second;
  return new Date(utc).toISOString();
}
