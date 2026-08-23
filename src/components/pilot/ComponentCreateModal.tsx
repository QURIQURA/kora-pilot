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
 * + CREATE COMPONENT 공용 모달.
 * 이름 + 카테고리만 받고 생성 즉시 Component Detail로 이동.
 * 제품 연결은 필수가 아니다 (독립 컴포넌트도 정상 상태).
 */
export function ComponentCreateModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const userId = await currentUserId();
      const { data, error } = await supabase
        .from("components")
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
      await queryClient.invalidateQueries({ queryKey: ["components"] });
      onClose();
      void navigate({
        to: "/components/$componentId",
        params: { componentId: id },
      });
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="label-caps">NEW COMPONENT</span>
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
