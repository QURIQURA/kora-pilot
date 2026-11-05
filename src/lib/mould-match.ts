import { sizeAbbr } from "@/lib/size-label";

/** "Ø8″-H6" → "Ø8″", "▬27×32-H3" → "▬27×32" — 모양+사이즈 부분만 (높이 제외). */
const baseKey = (abbr: string) => abbr.replace(/-H.*$/, "");

type SizeLike = Parameters<typeof sizeAbbr>[0];

/**
 * 완성 규격에 맞는 시트 몰드 후보: 모양+사이즈(인치 또는 직사각 가로×세로)가 같은 몰드.
 * 몰드 높이(H3/H6)는 달라도 후보 — 완성 규격의 높이와 몰드 높이는 별개다.
 */
export function candidateMoulds<M extends SizeLike>(size: SizeLike, moulds: M[]): M[] {
  const key = baseKey(sizeAbbr(size));
  return moulds.filter((m) => baseKey(sizeAbbr(m)) === key);
}
