import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  componentsQuery,
  dietaryBoardProductComponentsQuery,
  dietaryBuildsQuery,
  dietaryTagsQuery,
  formulaVersionDietaryTagLinksQuery,
  formulasQuery,
} from "@/lib/queries";
import { buildDietaryBoard, type SlotStatus } from "@/lib/dietary";
import { useSetBreadcrumb } from "@/components/layout/breadcrumb-context";
import { SectionCard, buttonClass, inputClass, selectClass } from "@/components/pilot/ui";

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

  const queryClient = useQueryClient();
  const builds = useQuery(dietaryBuildsQuery());
  const [buildNames, setBuildNames] = useState<Record<string, string>>({});
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

  const versionLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of formulas.data ?? [])
      for (const v of f.formula_versions ?? []) m.set(v.id, `${f.name} v${v.version_number}`);
    return m;
  }, [formulas.data]);
  const tagsByVersion = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of links.data ?? []) {
      const set = m.get(l.formula_version_id) ?? new Set<string>();
      set.add(l.dietary_tag_id);
      m.set(l.formula_version_id, set);
    }
    return m;
  }, [links.data]);
  const tagName = useMemo(() => new Map((tags.data ?? []).map((t) => [t.id, t.name])), [tags.data]);

  // BUILD 저장: 모든 슬롯의 버전이 같은 태그를 공통으로 가질 때만(활성 태그 포함) 저장한다.
  // 서버 트랜잭션이 없어서 중간에 실패하면 만든 build를 지워 반쪽짜리 저장본이 남지 않게 한다.
  const saveBuild = useMutation({
    mutationFn: async (args: {
      name: string;
      productId: string;
      items: { componentId: string; versionId: string }[];
    }) => {
      const sets = args.items.map((i) => tagsByVersion.get(i.versionId) ?? new Set<string>());
      const common = [...(sets[0] ?? [])].filter((t) => sets.every((st) => st.has(t)));
      if (!common.includes(activeTagId)) throw new Error("Every chosen formula must carry the tag");
      const { data: build, error } = await supabase
        .from("dietary_builds")
        .insert({ name: args.name, product_id: args.productId })
        .select("id")
        .single();
      if (error) throw error;
      try {
        const { error: tErr } = await supabase
          .from("dietary_build_tags")
          .insert(common.map((dietary_tag_id) => ({ build_id: build.id, dietary_tag_id })));
        if (tErr) throw tErr;
        const { error: iErr } = await supabase.from("dietary_build_items").insert(
          args.items.map((i, idx) => ({
            build_id: build.id,
            component_id: i.componentId,
            formula_version_id: i.versionId,
            sort_order: idx,
          })),
        );
        if (iErr) throw iErr;
      } catch (e) {
        await supabase.from("dietary_builds").delete().eq("id", build.id);
        throw e;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dietary_builds"] }),
  });

  const removeBuild = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dietary_builds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dietary_builds"] }),
  });
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    className={inputClass + " !w-72"}
                    value={buildNames[b.productId] ?? `${product?.name ?? ""} — ${activeTag.name}`}
                    onChange={(e) =>
                      setBuildNames((n) => ({ ...n, [b.productId]: e.target.value }))
                    }
                    aria-label="Build name"
                  />
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={!complete || saveBuild.isPending}
                    onClick={() =>
                      saveBuild.mutate({
                        name: (
                          buildNames[b.productId] ?? `${product?.name ?? ""} — ${activeTag.name}`
                        ).trim(),
                        productId: b.productId,
                        items: chosen.map((c) => ({
                          componentId: c.slot.componentId,
                          versionId: c.pick as string,
                        })),
                      })
                    }
                  >
                    SAVE AS BUILD
                  </button>
                  {saveBuild.isError && (
                    <span className="font-mono text-[11px] text-destructive">
                      {(saveBuild.error as Error).message}
                    </span>
                  )}
                </div>
              </SectionCard>
            );
          })}

          <SectionCard title={`SAVED BUILDS — ${activeTag.name}`}>
            {(() => {
              const list = (builds.data ?? []).filter((bd) =>
                bd.dietary_build_tags.some((t) => t.dietary_tag_id === activeTagId),
              );
              if (list.length === 0)
                return (
                  <p className="font-mono text-xs text-muted-foreground">NO SAVED BUILDS YET</p>
                );
              return (
                <ul className="divide-y divide-border border border-border">
                  {list.map((bd) => {
                    const buildTagIds = bd.dietary_build_tags.map((t) => t.dietary_tag_id);
                    const stale = bd.dietary_build_items.filter((it) => {
                      const have = tagsByVersion.get(it.formula_version_id);
                      return !have || !buildTagIds.every((id) => have.has(id));
                    });
                    return (
                      <li key={bd.id} className="space-y-1 px-2 py-2 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{bd.name}</span>
                          {stale.length > 0 ? (
                            <span className="label-caps border border-destructive bg-destructive px-1.5 py-0.5 text-[10px] text-destructive-foreground">
                              STALE — RE-CHECK TAGS
                            </span>
                          ) : (
                            <span className="label-caps border border-foreground px-1.5 py-0.5 text-[10px]">
                              OK
                            </span>
                          )}
                          {buildTagIds.map((id) => (
                            <span
                              key={id}
                              className="label-caps border border-input px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {tagName.get(id) ?? "—"}
                            </span>
                          ))}
                          <button
                            type="button"
                            className={buttonClass + " ml-auto"}
                            disabled={removeBuild.isPending}
                            onClick={() => {
                              if (window.confirm(`Delete build "${bd.name}"?`))
                                removeBuild.mutate(bd.id);
                            }}
                          >
                            DELETE
                          </button>
                        </div>
                        <ul className="font-mono text-[11px] text-muted-foreground">
                          {[...bd.dietary_build_items]
                            .sort((a, b2) => a.sort_order - b2.sort_order)
                            .map((it) => (
                              <li key={it.id}>
                                {componentName.get(it.component_id) ?? "—"} →{" "}
                                {versionLabel.get(it.formula_version_id) ?? "—"}
                                {stale.some((x) => x.id === it.id) ? "  (tag missing)" : ""}
                              </li>
                            ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}
          </SectionCard>
          <p className="font-mono text-[11px] text-muted-foreground">
            SAVE AS BUILD stores the chosen formula versions. Linking a build to an order comes next.
          </p>
        </>
      )}
    </div>
  );
}
