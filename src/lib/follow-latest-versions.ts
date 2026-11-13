import { supabase } from "@/integrations/supabase/client";

/**
 * 2026-11-13 사용자 확정 — 레시피는 상태(DRAFT/CURRENT/ARCHIVED)와 무관하게 "버전 번호가 가장 높은 것"이 항상 우선.
 * 진행 중인(완료·취소 아닌) 오더/세션의 컴포넌트 행과 제품의 하위 컴포넌트가 낡은 버전에 머물러 있으면
 * 최신 버전으로 옮긴다. 계량 진행 상태/작업 재료 연결은 같은 재료(ingredient_id)끼리 새 버전 줄로 옮겨 준다.
 * 새 버전이 없으면 아무 일도 하지 않는다. 바뀐 행 수를 돌려준다.
 */
export async function followLatestVersions(): Promise<number> {
  const vers = await supabase.from("formula_versions").select("id, formula_id, version_number");
  if (vers.error) throw vers.error;
  const latest = new Map<string, { id: string; n: number }>();
  const formulaOf = new Map<string, string>();
  for (const v of vers.data ?? []) {
    formulaOf.set(v.id, v.formula_id);
    const cur = latest.get(v.formula_id);
    if (!cur || v.version_number > cur.n)
      latest.set(v.formula_id, { id: v.id, n: v.version_number });
  }
  const target = (versionId: string | null) => {
    if (!versionId) return null;
    const f = formulaOf.get(versionId);
    const l = f ? latest.get(f) : undefined;
    return l && l.id !== versionId ? l.id : null;
  };

  let changed = 0;

  // 1) 진행 중 세션의 컴포넌트 행
  const sel = await supabase
    .from("work_session_formula_versions")
    .select("id, formula_version_id, work_sessions!inner(status, orders(status, dietary_build_id))")
    .is("parent_selection_id", null);
  if (sel.error) throw sel.error;
  type Sel = {
    id: string;
    formula_version_id: string;
    work_sessions: {
      status: string;
      orders: { status: string; dietary_build_id: string | null } | null;
    } | null;
  };
  for (const r of (sel.data ?? []) as unknown as Sel[]) {
    const ws = r.work_sessions;
    if (!ws || ["COMPLETED", "CANCELLED"].includes(ws.status)) continue;
    if (ws.orders && ["COMPLETED", "CANCELLED"].includes(ws.orders.status)) continue;
    if (ws.orders?.dietary_build_id) continue; // 식이 Build가 버전을 지정하므로 건드리지 않는다
    const next = target(r.formula_version_id);
    if (!next) continue;
    const { error } = await supabase
      .from("work_session_formula_versions")
      .update({ formula_version_id: next, version_pinned: false })
      .eq("id", r.id);
    if (error) continue;
    changed += 1;
    await remapLines(r.id, r.formula_version_id, next);
  }

  // 2) 제품의 하위 컴포넌트(고정된 버전)
  const pcs = await supabase
    .from("product_components")
    .select("id, formula_version_id")
    .not("formula_version_id", "is", null);
  if (pcs.error) throw pcs.error;
  for (const pc of pcs.data ?? []) {
    const next = target(pc.formula_version_id);
    if (!next) continue;
    const { error } = await supabase
      .from("product_components")
      .update({ formula_version_id: next })
      .eq("id", pc.id);
    if (!error) changed += 1;
  }
  return changed;
}

/** 옛 버전 재료 줄에 걸려 있던 계량 진행/작업 재료 연결을 같은 재료의 새 버전 줄로 옮긴다(실패해도 무시). */
async function remapLines(selectionId: string, oldVersion: string, newVersion: string) {
  try {
    const [oldLines, newLines] = await Promise.all([
      supabase
        .from("formula_version_ingredients")
        .select("id, ingredient_id")
        .eq("formula_version_id", oldVersion),
      supabase
        .from("formula_version_ingredients")
        .select("id, ingredient_id")
        .eq("formula_version_id", newVersion),
    ]);
    const byIng = new Map<string, string>();
    for (const l of newLines.data ?? [])
      if (!byIng.has(l.ingredient_id)) byIng.set(l.ingredient_id, l.id);
    const map = new Map<string, string>();
    for (const l of oldLines.data ?? []) {
      const to = byIng.get(l.ingredient_id);
      if (to) map.set(l.id, to);
    }
    if (map.size === 0) return;
    const prog = await supabase
      .from("work_session_progress")
      .select("id, formula_version_ingredient_id")
      .eq("work_session_formula_version_id", selectionId);
    for (const p of prog.data ?? []) {
      const to = map.get(p.formula_version_ingredient_id);
      if (to)
        await supabase
          .from("work_session_progress")
          .update({ formula_version_ingredient_id: to })
          .eq("id", p.id);
    }
    const sess = await supabase
      .from("work_session_formula_versions")
      .select("work_session_id")
      .eq("id", selectionId)
      .single();
    if (!sess.data) return;
    const ti = await supabase
      .from("work_session_task_ingredients")
      .select("id, formula_version_ingredient_id")
      .eq("work_session_id", sess.data.work_session_id)
      .in("formula_version_ingredient_id", [...map.keys()]);
    for (const t of ti.data ?? []) {
      const to = map.get(t.formula_version_ingredient_id);
      if (to)
        await supabase
          .from("work_session_task_ingredients")
          .update({ formula_version_ingredient_id: to })
          .eq("id", t.id);
    }
  } catch {
    /* best-effort */
  }
}
