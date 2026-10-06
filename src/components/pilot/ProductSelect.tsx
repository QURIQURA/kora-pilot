import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, productsQuery } from "@/lib/queries";
import { inputClass, selectClass, buttonClass, primaryButtonClass } from "./ui";

const NEW_VALUE = "__new_product__";

/** 2026-10-06 사용자 요청: ORDER의 PRODUCT 선택칸이 "이미 생성된 PRODUCT만" 보여줘서, 아직
 * 없는 신규 PRODUCT를 연결하려면 PRODUCTS 화면으로 나가서 먼저 만들고 와야 했다 —
 * MouldSelect/BaseWeightSelect와 동일한 패턴으로 "+ NEW PRODUCT"를 추가해서 그 자리에서 바로
 * 만들고 즉시 선택되게 한다. */
export function ProductSelect({
  value,
  onChange,
  emptyLabel = "NO PRODUCT",
  className,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const products = useQuery(productsQuery());
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("products")
        .insert({ user_id, name: name.trim() })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setCreating(false);
      setName("");
      onChange(id);
    },
  });

  return (
    <>
      <select
        className={className ?? selectClass}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          if (e.target.value === NEW_VALUE) {
            setCreating(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="">{emptyLabel}</option>
        {(products.data ?? []).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
        <option value={NEW_VALUE}>+ NEW PRODUCT</option>
      </select>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4">
          <div className="w-full max-w-md border border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="label-caps">NEW PRODUCT</span>
              <button
                type="button"
                className="label-caps px-2 py-2"
                onClick={() => {
                  setCreating(false);
                  setName("");
                }}
              >
                CLOSE
              </button>
            </div>
            <form
              className="space-y-3 p-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) create.mutate();
              }}
            >
              <input
                className={inputClass}
                autoFocus
                required
                placeholder="PRODUCT NAME"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              {create.isError && (
                <p className="font-mono text-xs uppercase text-destructive">
                  {(create.error as Error).message}
                </p>
              )}
              <div className="flex gap-2">
                <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
                  {create.isPending ? "생성 중…" : "CREATE"}
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => {
                    setCreating(false);
                    setName("");
                  }}
                >
                  CANCEL
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
