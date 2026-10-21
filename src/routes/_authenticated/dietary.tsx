import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  componentsQuery,
  dietaryBoardProductComponentsQuery,
  dietaryTagsQuery,
  formulaVersionDietaryTagLinksQuery,
  formulasQuery,
} from "@/lib/queries";
import { buildDietaryBoard, type SlotStatus } from "@/lib/dietary";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { SectionCard, selectClass } from "@/components/pilot/ui";

export const Route = createFileRoute("/_authenticated/dietary")({
  head: () => ({
    meta: [
      { title: "PILOT — Dietary" },
      { name: "description", content: "Dietary recipe builder and gap finder" },
      { property: "og:title", content: "PILOT — Dietary" },
      { property: "og:description", content: "Dietary recipe builder and gap finder" },
    ],
  }),
  component: DietaryPage,
});

const STATUS_LABEL: Record<SlotStatus, string> = {
  READY: "READY",
  ALTERNATIVE: "SWAP",
  MISSING: "MISSING",
  NO_FORMULA: "NO FORMULA",
};
const STATUS_CLASS: Record<SlotStatus, string> = {
  READY: "border-foreground bg-foreground text-background",
  ALTERNATIVE: "border-foreground text-foreground",
  MISSING: "border-destructive bg-destructive text-destructive-foreground",
  NO_FORMULA: "border-dashed border-destructive text-destructive",
};

function DietaryPage() {
  useSetBreadcrumb([{ label: "PILOT", path: "/" }, { label: "DIETARY" }]);

  const tags = useQuery(dietaryTagsQuery());
  const links = useQuery(formulaVersionDietaryTagLinksQuery());
  const formulas = useQuery(formulasQuery());
  const components = useQuery(componentsQuery());
  const productComponents = useQuery(dietaryBoardProductComponentsQuery());
  const products = useQuery({
    queryKey: ["dietary_board", "products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const [tagId, setTagId] = useState("");
  const activeTagId = tagId || tags.data?.[0]?.id || "";
  // 레고 조립: "productId:componentId" → 고른 formula version. 저장하지 않는 작업용 선택(주문 연결은 다음 단계).
  const [picks, setPicks] = useState<Record<string, string>>({});

  const componentName = useMemo(
    () => new Map((components.data ?? []).map((c) => [c.id, c.name])),
    [components.data],
  );
  const productList = products.data ?? [];

  const board = useMemo(() => {
    const taggedVersionIds = new Set(
      (links.data ?? []).filter((l) => l.dietary_tag_id === activeTagId).map((l) => l.formula_version_id),
    );
    return buildDietaryBoard({
      productIds: productList.map((p) => p.id),
      productComponents: productComponents.data ?? [],
      formulas: (formulas.data ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        component_id: f.component_id,
        formula_versions: (f.formula_versions ?? []).map((v) => ({
          id: v.id,
          version_number: v.version_number,
          status: v.status,
        })),
      })),
      taggedVersionIds,
    }).filter((b) => b.totalCount > 0);
  }, [links.data, activeTagId, productList, productComponents.data, formulas.data]);

  // 부족한 formula: 컴포넌트 단위로 모아서 어떤 제품에 필요한지 보여준다.
  const gaps = useMemo(() => {
    const map = new Map<string, { status: SlotStatus; products: string[] }>();
    for (const b of board) {
      const pname = productList.find((p) => p.id === b.productId)?.name ?? "—";
      for (const s of b.slots) {
        if (s.status !== "MISSING" && s.status !== "NO_FORMULA") continue;
        const g = map.get(s.componentId) ?? { status: s.status, products: [] };
        g.products.push(pname);
        map.set(s.componentId, g);
      }
    }
    return [...map.entries()];
  }, [board, productList]);

  const unlinkedFormulas = (formulas.data ?? []).filter((f) => !f.component_id);
  const loading = tags.isLoading || formulas.isLoading || productComponents.isLoading;
  const activeTag = (tags.data ?? []).find((t) => t.id === activeTagId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg">DIETARY</h1>
          <p className="font-mono text-xs uppercase text-muted-foreground">
            식이 태그별로 제품의 컴포넌트마다 쓸 수 있는 FORMULA를 확인하고, 부족한 것을 찾아 조립합니다.
          </p>
        </div>
        <select
          className={selectClass + " !w-56"}
          value={activeTagId}
          onChange={(e) => setTagId(e.target.value)}
          disabled={(tags.data ?? []).length === 0}
        >
          {(tags.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {(tags.data ?? []).length === 0 && !loading && (
        <p className="font-mono text-xs text-muted-foreground">
          No dietary tags yet — add them in SETTINGS &gt; DIETARY TAGS, then tag formula versions on
          the FORMULA page.
        </p>
      )}

      {activeTag && (
        <>
          <SectionCard title={`GAPS — ${activeTag.name}`}>
            {gaps.length === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">
                {board.length === 0
                  ? "NO PRODUCT HAS COMPONENTS YET"
                  : "NO GAPS — EVERY COMPONENT HAS A TAGGED FORMULA"}
              </p>
            ) : (
              <ul className="divide-y divide-border border border-border">
                {gaps.map(([cid, g]) => (
                  <li key={cid} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                    <span
                      className={`label-caps border px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[g.status]}`}
                    >
                      {STATUS_LABEL[g.status]}
                    </span>
                    <span className="font-medium">{componentName.get(cid) ?? "—"}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      needed by {[...new Set(g.products)].join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {unlinkedFormulas.length > 0 && (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                {unlinkedFormulas.length} formula(s) are not linked to any component and cannot be
                matched: {unlinkedFormulas.map((f) => f.name).join(", ")}
              </p>
            )}
          </SectionCard>

          {board.map((b) => {
            const product = productList.find((p) => p.id === b.productId);
            const chosen = b.slots.map((s) => {
              const key = `${b.productId}:${s.componentId}`;
              const pick =
                picks[key] ??
                (s.status === "READY" ? s.pinnedVersionId : s.candidates[0]?.versionId) ??
                null;
              return { slot: s, key, pick };
            });
            const complete = chosen.every((c) => c.pick);
            return (
              <SectionCard key={b.productId} title={product?.name ?? "—"}>
                <div className="mb-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>
                    {b.coveredCount}/{b.totalCount} COMPONENTS COVERED
                  </span>
                  <span
                    className={`label-caps border px-1.5 py-0.5 text-[10px] ${
                      complete ? "border-foreground text-foreground" : "border-destructive text-destructive"
                    }`}
                  >
                    {complete ? "CAN BE ASSEMBLED" : "INCOMPLETE"}
                  </span>
                  <Link
                    to="/products/$productId"
                    params={{ productId: b.productId }}
                    className="ml-auto underline"
                  >
                    OPEN PRODUCT
                  </Link>
                </div>
                <ul className="divide-y divide-border border border-border">
                  {chosen.map(({ slot, key, pick }) => (
                    <li key={key} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                      <span
                        className={`label-caps border px-1.5 py-0.5 text-[10px] ${STATUS_CLASS[slot.status]}`}
                      >
                        {STATUS_LABEL[slot.status]}
                      </span>
                      <span className="w-56 shrink-0 font-medium">
                        {componentName.get(slot.componentId) ?? "—"}
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {slot.pinnedLabel ? `now: ${slot.pinnedLabel}` : "now: no formula linked"}
                      </span>
                      {slot.candidates.length > 0 ? (
                        <select
                          className={selectClass + " !w-64 ml-auto"}
                          value={pick ?? ""}
                          onChange={(e) => setPicks((p) => ({ ...p, [key]: e.target.value }))}
                        >
                          {slot.candidates.map((c) => (
                            <option key={c.versionId} value={c.versionId}>
                              {c.formulaName} v{c.versionNumber} · {c.versionStatus}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="ml-auto font-mono text-[11px] text-destructive">
                          no {activeTag.name} formula
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            );
          })}
          <p className="font-mono text-[11px] text-muted-foreground">
            Selections here are a working view only (not saved). Linking an assembled recipe to an
            order comes next.
          </p>
        </>
      )}
    </div>
  );
}
