
Abbreviation legend.widget.tsx · TXT
import type { WidgetDef } from "./types";
 
/**
 * Formula 이름에 쓰이는 재료 약어 표기 기준.
 * 여기 없는 재료/기법 이름(Vanilla, Tangerine, Chiffon, Mousse, Curd, Ganache, Mud, SMB 등)은
 * 약어화하지 않고 그대로 쓴다 — 이 표는 "자주 쓰는 일부 재료"만 다룬다.
 */
const ABBREVIATIONS: { abbr: string; full: string }[] = [
  { abbr: "W.C", full: "White Chocolate" },
  { abbr: "D.C", full: "Dark Chocolate" },
  { abbr: "M.C", full: "Milk Chocolate" },
  { abbr: "LM", full: "Lemon" },
  { abbr: "C.C", full: "Cream Cheese" },
  { abbr: "W.E", full: "Whole Egg" },
  { abbr: "E.Y", full: "Egg Yolk" },
  { abbr: "E.W", full: "Egg White" },
];
 
function AbbreviationLegendWidget() {
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border border border-border">
        {ABBREVIATIONS.map((item) => (
          <li key={item.abbr} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="font-mono text-sm font-semibold tabular-nums">{item.abbr}</span>
            <span className="text-xs text-muted-foreground">{item.full}</span>
          </li>
        ))}
      </ul>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        두 단어 이니셜 조합은 점(.)으로 연결(W.C, D.C…), 한 단어 축약은 점 없음(LM).
        Chiffon/Mousse/Curd/Ganache 같은 케익·제과 이름과 SMB는 약어화하지 않음. Formula 이름 순서:
        [기법] [재료/풍미] V[N] [제품명].
      </p>
    </div>
  );
}
 
export const abbreviationLegendWidget: WidgetDef = {
  id: "abbreviation-legend",
  title: "NAMING ABBREVIATIONS",
  size: "small",
  component: AbbreviationLegendWidget,
};
 

