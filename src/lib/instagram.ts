/** 인스타그램 입력값(@handle / handle / 전체 URL)을 열 수 있는 링크로 정규화한다. 저장값은 건드리지 않는다. */
export function instagramUrl(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").replace(/^instagram\.com\//i, "").replace(/\/+$/, "");
  return handle ? `https://www.instagram.com/${handle}/` : null;
}

/** 표시용 — "@handle" 형태로 통일(전체 URL이면 마지막 경로 조각). */
export function instagramLabel(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const m = v.match(/instagram\.com\/([^/?#]+)/i);
  const handle = (m?.[1] ?? v).replace(/^@/, "");
  return handle ? `@${handle}` : null;
}
