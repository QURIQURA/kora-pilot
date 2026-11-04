import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const nameRef = useRef<HTMLInputElement>(null);

  // 2026-11-04 버그 리포트: "order detail new product 이름 타이핑이 안 돼" — 드롭다운(select)에서 + NEW PRODUCT를
  // 고르는 순간 select가 닫히면서 포커스를 되가져가 autoFocus가 무시되고, 키 입력이 select로 들어갔다.
  // 모달이 뜬 뒤(select가 닫힌 뒤)에 입력칸에 직접 포커스를 준다.
  useEffect(() => {
    if (!creating) return;
    const t = window.setTimeout(() => nameRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [creating]);

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
            e.target.blur();
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

      {creating &&
        createPortal(
          // 2026-10-12: MouldSelect/BaseWeightSelect와 같은 버그 — ORDER 폼처럼 바깥쪽 <form> 안에서
          // 쓰일 때 이 모달이 같은 DOM 트리에 있으면 <form> 중첩으로 CREATE가 바깥쪽 폼을 제출해버린다
          // (페이지 새로고침 + 화면 이탈). document.body로 포탈링해서 방지.
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 sm:items-center sm:p-4"
            // 포털이어도 React 트리상 부모(<label>/폼)로 이벤트가 올라가므로, 입력 이벤트는 여기서 끊는다.
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
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
                  ref={nameRef}
                  className={inputClass}
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
                    {create.isPending ? "CREATING…" : "CREATE"}
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
          </div>,
          document.body,
        )}
    </>
  );
}
