import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, pilotSettingsQuery } from "@/lib/queries";
import { buttonClass, inputClass, primaryButtonClass } from "@/components/pilot/ui";
import {
  CARE_AUTO_EMAIL_OPTIONS,
  CARE_PLACEHOLDERS,
  DEFAULT_CARE_STEPS,
  careStepsFromSettings,
  careValues,
  fillCareTemplate,
  newCareStepKey,
  type CareAutoEmail,
  type CareStep,
} from "@/lib/customer-care";
import type { Json } from "@/integrations/supabase/types";

/**
 * SETTINGS — CUSTOMER CARE (2026-11-06 사용자 요청: "custom care 카테고리와 내용 통일해서 관리하는 설정")
 * 주문 화면 CUSTOMER CARE 체크표의 단계(카테고리)와 문자/이메일 문구를 한 곳에서 관리한다.
 * 저장: pilot_settings.customer_care_steps. 단계 key는 체크 기록(order_cs_checks.step)과 연결되므로
 * 이름을 바꿔도 key는 그대로 유지된다.
 */
const SAMPLE = careValues({
  customerName: "Brianna Thomas",
  recipient: "Margaret",
  pickupAt: "2026-11-24T07:00:00Z",
  address: "98 Bacchus Cct Kambah ACT",
  price: 160,
  orderNumber: "SH-014.1",
  requestNumber: "REQ-0002",
});

export function CustomerCareSettings() {
  const qc = useQueryClient();
  const settings = useQuery(pilotSettingsQuery());
  const saved = careStepsFromSettings(settings.data?.customer_care_steps);
  const [draft, setDraft] = useState<CareStep[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const steps = draft ?? saved;
  const dirty = draft !== null;

  useEffect(() => {
    // 저장 후 서버 값이 바뀌면 초안을 비운다.
    setDraft(null);
  }, [settings.data?.customer_care_steps]);

  const save = useMutation({
    mutationFn: async (next: CareStep[]) => {
      const user_id = await currentUserId();
      const { error } = await supabase.from("pilot_settings").upsert({
        user_id,
        customer_care_steps: next as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pilot_settings"] }),
  });

  const update = (key: string, patch: Partial<CareStep>) =>
    setDraft(steps.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setDraft(next);
  };
  const add = () => {
    const key = newCareStepKey(steps);
    setDraft([
      ...steps,
      {
        key,
        label: "New step",
        hint: "",
        auto_email: "",
        text: "",
        email_subject: "",
        email_body: "",
      },
    ]);
    setOpenKey(key);
  };
  const remove = (key: string) => {
    setDraft(steps.filter((s) => s.key !== key));
  };

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-muted-foreground">
        These steps and messages appear in every order&apos;s ORDER DETAIL &gt; CUSTOMER CARE. Words
        in curly brackets are filled in from the order. Removing a step hides it from orders; its
        past ticks are kept.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {CARE_PLACEHOLDERS.map((p) => (
          <span
            key={p.key}
            title={p.label}
            className="border border-border bg-card px-1.5 py-0.5 font-mono text-[11px]"
          >
            {`{${p.key}}`}
            <span className="text-muted-foreground"> {p.label}</span>
          </span>
        ))}
      </div>

      <ul className="divide-y divide-border border border-border bg-card">
        {steps.map((s, i) => {
          const open = openKey === s.key;
          return (
            <li key={s.key} className="space-y-3 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="w-5 font-mono text-xs tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={open}
                  onClick={() => setOpenKey(open ? null : s.key)}
                >
                  <span className="block truncate text-sm">{s.label || "(no name)"}</span>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {s.hint}
                    {s.auto_email ? " · AUTO EMAIL ON WEB ORDERS" : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => move(i, 1)}
                  disabled={i === steps.length - 1}
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={buttonClass}
                  onClick={() => setOpenKey(open ? null : s.key)}
                >
                  {open ? "CLOSE" : "EDIT"}
                </button>
              </div>

              {open && (
                <div className="space-y-3 pb-2">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="label-caps block text-xs text-muted-foreground">
                        STEP NAME
                      </span>
                      <input
                        className={inputClass}
                        value={s.label}
                        onChange={(e) => update(s.key, { label: e.target.value })}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="label-caps block text-xs text-muted-foreground">
                        WHEN / SHORT NOTE
                      </span>
                      <input
                        className={inputClass}
                        value={s.hint}
                        onChange={(e) => update(s.key, { hint: e.target.value })}
                      />
                    </label>
                    <label className="block space-y-1 md:col-span-2">
                      <span className="label-caps block text-xs text-muted-foreground">
                        AUTOMATIC EMAIL
                      </span>
                      <select
                        className={inputClass}
                        value={s.auto_email}
                        onChange={(e) =>
                          update(s.key, { auto_email: e.target.value as CareAutoEmail })
                        }
                      >
                        {CARE_AUTO_EMAIL_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="block space-y-1">
                        <span className="label-caps block text-xs text-muted-foreground">TEXT</span>
                        <textarea
                          rows={5}
                          className={inputClass}
                          value={s.text}
                          onChange={(e) => update(s.key, { text: e.target.value })}
                        />
                      </label>
                      <Preview body={fillCareTemplate(s.text, SAMPLE)} />
                    </div>
                    <div className="space-y-2">
                      <label className="block space-y-1">
                        <span className="label-caps block text-xs text-muted-foreground">
                          EMAIL SUBJECT
                        </span>
                        <input
                          className={inputClass}
                          value={s.email_subject}
                          onChange={(e) => update(s.key, { email_subject: e.target.value })}
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="label-caps block text-xs text-muted-foreground">
                          EMAIL BODY
                        </span>
                        <textarea
                          rows={8}
                          className={inputClass}
                          value={s.email_body}
                          onChange={(e) => update(s.key, { email_body: e.target.value })}
                        />
                      </label>
                      <Preview
                        subject={fillCareTemplate(s.email_subject, SAMPLE)}
                        body={fillCareTemplate(s.email_body, SAMPLE)}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="label-caps text-[10px] text-destructive hover:underline"
                    onClick={() => remove(s.key)}
                  >
                    ✕ REMOVE THIS STEP
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass} onClick={add}>
          + ADD STEP
        </button>
        <button
          type="button"
          className={primaryButtonClass}
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(steps)}
        >
          {save.isPending ? "SAVING…" : "SAVE"}
        </button>
        {dirty && (
          <button type="button" className={buttonClass} onClick={() => setDraft(null)}>
            REVERT
          </button>
        )}
        <button
          type="button"
          className="label-caps text-[10px] text-muted-foreground hover:text-foreground"
          onClick={() => setDraft(DEFAULT_CARE_STEPS)}
        >
          RESET TO DEFAULT WORDING
        </button>
        <span className="label-caps text-[10px] text-muted-foreground">
          {dirty ? "UNSAVED CHANGES" : "✓ SAVED"}
        </span>
      </div>
      {save.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}

function Preview({ subject, body }: { subject?: string; body: string }) {
  return (
    <div className="space-y-1 border border-dashed border-border bg-background p-2">
      <span className="label-caps block text-[10px] text-muted-foreground">
        PREVIEW (SAMPLE ORDER)
      </span>
      {subject !== undefined && (
        <p className="font-mono text-[12px]">
          <span className="text-muted-foreground">Subject: </span>
          {subject}
        </p>
      )}
      <p className="whitespace-pre-line text-sm leading-relaxed">{body || "—"}</p>
    </div>
  );
}
