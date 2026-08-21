import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  currentUserId,
  formulasByComponentQuery,
  productComponentsQuery,
  type FormulaListRow,
} from "@/lib/queries";
import { versionLabel } from "@/lib/formula";
import { formatDateTime } from "@/lib/datetime";
import { Field, SectionCard, StatusBadge, buttonClass, inputClass, primaryButtonClass } from "./ui";

function currentVersion(formula: FormulaListRow) {
  const versions = formula.formula_versions ?? [];
  return (
    versions.find((v) => v.status === "CURRENT") ??
    [...versions].sort((a, b) => b.version_number - a.version_number)[0] ??
    null
  );
}

function FormulaRow({ formula }: { formula: FormulaListRow }) {
  const version = currentVersion(formula);
  return (
    <li className="flex flex-wrap items-center gap-2 px-3 py-3">
      <Link
        to="/formulas/$formulaId"
        params={{ formulaId: formula.id }}
        className="flex-1 text-sm hover:underline"
      >
        {formula.name}
      </Link>
      {version && (
        <span className="label-caps text-xs text-muted-foreground">
          {versionLabel(version.version_number)}
        </span>
      )}
      {version && <StatusBadge status={version.status} />}
      <span className="font-mono text-xs text-muted-foreground">
        {formatDateTime(formula.updated_at)}
      </span>
    </li>
  );
}

/** COMPONENT DETAIL — CURRENT FORMULA 요약 + FORMULA HISTORY + 새 FORMULA(컴포넌트 자동 연결) */
export function ComponentFormulasSection({
  componentId,
}: {
  componentId: string;
}) {
  const formulas = useQuery(formulasByComponentQuery(componentId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("formulas")
        .insert({ user_id, name: name.trim(), component_id: componentId })
        .select("id")
        .single();
      if (error) throw error;
      const { error: versionError } = await supabase
        .from("formula_versions")
        .insert({
          user_id,
          formula_id: data.id,
          version_number: 1,
          status: "DRAFT",
        });
      if (versionError) throw versionError;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["formulas"] });
      await queryClient.invalidateQueries({
        queryKey: ["formulas_by_component", componentId],
      });
      setCreating(false);
      setName("");
      void navigate({ to: "/formulas/$formulaId", params: { formulaId: id } });
    },
  });

  const rows = formulas.data ?? [];

  return (
    <SectionCard
      title="FORMULAS"
      action={
        <button
          type="button"
          className="label-caps px-2 py-2 text-xs hover:bg-secondary"
          onClick={() => setCreating((v) => !v)}
        >
          {creating ? "CANCEL" : "+ NEW FORMULA"}
        </button>
      }
    >
      {creating && (
        <form
          className="mb-4 space-y-3 border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field label="FORMULA NAME">
            <input
              className={inputClass}
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={create.isPending}
            >
              CREATE
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() => setCreating(false)}
            >
              CANCEL
            </button>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          NO FORMULAS YET
        </p>
      ) : (
        <ul className="divide-y divide-border border border-border">
          {rows.map((formula) => (
            <FormulaRow key={formula.id} formula={formula} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function ComponentFormulaGroup({
  componentId,
  componentName,
}: {
  componentId: string;
  componentName: string;
}) {
  const formulas = useQuery(formulasByComponentQuery(componentId));
  const rows = formulas.data ?? [];
  return (
    <div className="border border-border">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <Link
          to="/components/$componentId"
          params={{ componentId }}
          className="label-caps text-xs hover:underline"
        >
          {componentName}
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="px-3 py-3 font-mono text-xs uppercase text-muted-foreground">
          NO FORMULA
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((formula) => (
            <FormulaRow key={formula.id} formula={formula} />
          ))}
        </ul>
      )}
    </div>
  );
}

/** PRODUCT DETAIL — 연결된 component들의 current formula 요약 */
export function ProductFormulasSection({ productId }: { productId: string }) {
  const links = useQuery(productComponentsQuery(productId));
  const rows = links.data ?? [];
  return (
    <SectionCard title="FORMULAS">
      {rows.length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          LINK A COMPONENT TO SEE ITS FORMULAS
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <ComponentFormulaGroup
              key={row.id}
              componentId={row.component_id}
              componentName={row.components?.name ?? "—"}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
