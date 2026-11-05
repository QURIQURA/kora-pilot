import { useQuery } from "@tanstack/react-query";
import { cakeSizesQuery, mouldsQuery } from "@/lib/queries";
import { mouldAbbr } from "@/lib/component-size";
import { fmtNumber } from "@/lib/formula";
import { SectionCard } from "./ui";

/**
 * 공용 완성 규격(왼쪽) ↔ 시트 몰드(오른쪽)를 한 줄씩 짝지어 보여주는 읽기 전용 표.
 * 짝은 cake_sizes.sheet_mould_id 기준이다. 연결이 없는 규격/몰드는 빨간 "—"로 표시해 정리할 곳을 찾기 쉽게 한다.
 */
export function CakeSizeMouldPairs() {
  const sizes = useQuery(cakeSizesQuery());
  const moulds = useQuery(mouldsQuery());
  const sizeRows = sizes.data ?? [];
  const mouldRows = moulds.data ?? [];
  const linked = new Set(sizeRows.map((s) => s.sheet_mould_id).filter(Boolean));
  const orphanMoulds = mouldRows.filter((m) => !linked.has(m.id));
  const cm = (mm: number | string | null | undefined) =>
    mm == null ? "?" : String(Math.round((Number(mm) / 10) * 10) / 10);

  return (
    <SectionCard title="규격 ↔ 몰드 짝 (한 줄에 하나)">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="label-caps border-b border-border text-left text-[10px] text-muted-foreground">
              <th className="px-2 py-1">완성 규격</th>
              <th className="px-2 py-1">인분</th>
              <th className="px-2 py-1" aria-label="연결" />
              <th className="px-2 py-1">시트 몰드</th>
              <th className="px-2 py-1">몰드 치수</th>
              <th className="px-2 py-1 text-right">기준중량</th>
            </tr>
          </thead>
          <tbody>
            {sizeRows.map((s) => {
              const m = mouldRows.find((x) => x.id === s.sheet_mould_id);
              return (
                <tr key={s.id} className="border-b border-border">
                  <td className="px-2 py-1 font-mono">{s.name}</td>
                  <td className="px-2 py-1 font-mono">{s.servings ?? "—"}</td>
                  <td className="w-16 px-1 py-1">
                    <span className="flex items-center" aria-hidden>
                      <span className="size-1.5 rounded-full bg-foreground" />
                      <span
                        className={`h-px flex-1 ${m ? "bg-foreground" : "border-t border-dashed border-destructive"}`}
                      />
                      <span
                        className={`size-1.5 rounded-full ${m ? "bg-foreground" : "bg-destructive"}`}
                      />
                    </span>
                  </td>
                  <td className={`px-2 py-1 font-mono ${m ? "" : "text-destructive"}`}>
                    {m ? mouldAbbr(m) : "— 몰드 없음"}
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-muted-foreground">
                    {m
                      ? m.diameter_mm
                        ? `Ø${cm(m.diameter_mm)} × H${cm(m.height_mm)}cm`
                        : `${cm(m.length_mm)}×${cm(m.width_mm)} × H${cm(m.height_mm)}cm`
                      : ""}
                  </td>
                  <td className="px-2 py-1 text-right font-mono">
                    {m?.reference_weight_g
                      ? `${fmtNumber(Number(m.reference_weight_g))}g`
                      : m
                        ? "—"
                        : ""}
                  </td>
                </tr>
              );
            })}
            {orphanMoulds.map((m) => (
              <tr key={m.id} className="border-b border-border bg-secondary/40">
                <td className="px-2 py-1 font-mono text-destructive">— 규격 없음</td>
                <td />
                <td className="w-16 px-1 py-1" aria-hidden>
                  <span className="flex items-center">
                    <span className="size-1.5 rounded-full bg-destructive" />
                    <span className="h-px flex-1 border-t border-dashed border-destructive" />
                  </span>
                </td>
                <td className="px-2 py-1 font-mono">{mouldAbbr(m)}</td>
                <td className="px-2 py-1 font-mono text-xs text-muted-foreground">
                  {m.diameter_mm
                    ? `Ø${cm(m.diameter_mm)} × H${cm(m.height_mm)}cm`
                    : `${cm(m.length_mm)}×${cm(m.width_mm)} × H${cm(m.height_mm)}cm`}
                </td>
                <td className="px-2 py-1 text-right font-mono">
                  {m.reference_weight_g ? `${fmtNumber(Number(m.reference_weight_g))}g` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[11px] text-muted-foreground">
        짝은 규격의 시트 몰드 설정 기준이에요. 아래 두 목록에서 이름·치수·몰드 연결을 고치면 여기에
        바로 반영돼요. 기준중량이 "—"인 몰드는 레시피 배수 계산(몰드×개수)에 쓸 수 없어요.
      </p>
    </SectionCard>
  );
}
