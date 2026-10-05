import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import { Field, buttonClass, inputClass, primaryButtonClass } from "./ui";

/**
 * 공용 고객 생성 폼. CustomerSelect("+ NEW CUSTOMER")와 /customers 목록이 공유한다.
 * 이름 외 전부 선택 — DM에서 이름만 확인되고 연락처가 아직 없는 경우가 흔하다.
 */
export function CustomerCreateForm({
  onCreated,
  onCancel,
  initialName = "",
}: {
  onCreated?: (id: string) => void;
  onCancel?: () => void;
  initialName?: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [instagramHandle, setInstagramHandle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const user_id = await currentUserId();
      const { data, error } = await supabase
        .from("customers")
        .insert({
          user_id,
          name: name.trim() || null,
          instagram_handle: instagramHandle.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          notes: notes.trim() || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      onCreated?.(id);
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Field label="NAME">
        <input
          className={inputClass}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field label="INSTAGRAM (OPTIONAL)">
        <input
          className={inputClass}
          placeholder="@handle"
          value={instagramHandle}
          onChange={(e) => setInstagramHandle(e.target.value)}
        />
      </Field>
      <Field label="PHONE (OPTIONAL)">
        <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="EMAIL (OPTIONAL)">
        <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="NOTES (OPTIONAL)">
        <textarea rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      {create.isError && (
        <p className="font-mono text-xs uppercase text-destructive">{(create.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
          CREATE
        </button>
        {onCancel && (
          <button type="button" className={buttonClass} onClick={onCancel}>
            CANCEL
          </button>
        )}
      </div>
    </form>
  );
}
