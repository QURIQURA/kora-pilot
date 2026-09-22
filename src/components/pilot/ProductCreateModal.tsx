import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CategorySelect } from "@/components/pilot/CategorySelect";
import { currentUserId } from "@/lib/queries";
import {
  Field,
  buttonClass,
  inputClass,
  primaryButtonClass,
  selectClass,
} from "./ui";

/**
 * + CREATE PRODUCT 공용 모달.
 * 이름 + 카테고리만 받고 생성 즉시 Product Detail로 이동.
 * (STATUS 구분은 2026-09-22부로 폐지 — 만들 때 바로 입력하는 워크플로우라 IDEA/ACTIVE/…
 * 단계 구분이 실사용에 불필요하다는 판단. DB 컬럼/기본값(IDEA)은 그대로 두고 UI에서만 뺐다.)
 */
export function ProductCreateModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { data, error } = await supabase
        .from("products")
        .insert({
          user_id: userId,
          name: name.trim(),
          category_id: categoryId || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
      void navigate({ to: "/products/$productId", params: { productId: id } });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW PRODUCT</span>
          <button type="button" className="label-caps px-2 py-2" onClick={onClose}>
            CLOSE
          </button>
        </div>
        <form
          className="space-y-4 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <Field label="NAME">
            <input
              className={inputClass}
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
          <Field label="CATEGORY">
            <CategorySelect
              className={selectClass}
              value={categoryId}
              onChange={setCategoryId}
              emptyLabel="—"
            />
          </Field>
          {create.isError && (
            <p className="font-mono text-xs uppercase text-destructive">
              {(create.error as Error).message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className={primaryButtonClass}
              disabled={create.isPending}
            >
              CREATE
            </button>
            <button type="button" className={buttonClass} onClick={onClose}>
              CANCEL
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
