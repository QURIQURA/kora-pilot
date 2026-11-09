// 2026-11-05 사용자 요청: "order detail에서 customer detail이랑 CS단계체크 넣어줘. 문자/이메일을 열로
// 구분해서 표기해줘" — ORDER DETAIL 탭에 고객 연락처(폰/이메일)와 CS 단계 체크표(TEXT / EMAIL 열)를 둔다.
// 체크는 SAVE 바와 별개로 누르는 즉시 저장된다(order_cs_checks). 웹 주문의 자동 메일(접수/수락)은
// shco_email_log에서 읽어 AUTO로 표시한다.
// 2026-11-06: 단계와 문구는 SETTINGS > CUSTOMER CARE에서 관리. 단계를 누르면 그 주문 정보로 채운
// 문자/이메일 문구가 펼쳐지고 COPY로 복사한다.
import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, inputClass } from "@/components/pilot/ui";
import { pilotSettingsQuery } from "@/lib/queries";
import {
  careStepsFromSettings,
  careValues,
  fillCareTemplate,
  type CareOrderInfo,
} from "@/lib/customer-care";

type Channel = "TEXT" | "EMAIL";

const CHANNELS: Channel[] = ["TEXT", "EMAIL"];

function shortDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: "Australia/Sydney" })
    .toUpperCase();
}

function phoneKey(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.startsWith("61") ? "0" + d.slice(2) : d;
}

function CopyButton({ value, label = "COPY" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="label-caps shrink-0 border border-input bg-background px-2 text-[10px] hover:bg-secondary disabled:opacity-40"
      disabled={!value}
      onClick={() => {
        void navigator.clipboard?.writeText(value).finally(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? "COPIED" : label}
    </button>
  );
}

/** PHONE / EMAIL from the customer card, with a note when the web form had something different. */
export function OrderCustomerContact({
  customerId,
  requestPhone,
  requestEmail,
}: {
  customerId: string;
  requestPhone?: string | null | undefined;
  requestEmail?: string | null | undefined;
}) {
  const customer = useQuery({
    queryKey: ["customer-contact", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, phone, email")
        .eq("id", customerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const phone = customer.data?.phone ?? "";
  const email = customer.data?.email ?? "";
  const phoneDiffers = !!requestPhone && phoneKey(requestPhone) !== phoneKey(phone);
  const emailDiffers =
    !!requestEmail && requestEmail.trim().toLowerCase() !== email.trim().toLowerCase();

  const field = (
    label: string,
    value: string,
    webValue: string | null | undefined,
    differs: boolean,
  ) => (
    <div className="block space-y-1">
      <span className="label-caps block text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-1.5">
        <input className={inputClass} readOnly value={value} placeholder="—" aria-label={label} />
        <CopyButton value={value} />
      </div>
      {differs && (
        <p className="font-mono text-[11px] text-destructive">
          WEB FORM: {webValue} <CopyButton value={webValue ?? ""} />
        </p>
      )}
    </div>
  );

  return (
    <>
      {field("PHONE", phone, requestPhone, phoneDiffers)}
      {field("EMAIL", email, requestEmail, emailDiffers)}
      {customerId && (
        <p className="font-mono text-[11px] text-muted-foreground md:col-span-2">
          From the customer card.{" "}
          <Link
            to="/customers/$customerId"
            params={{ customerId }}
            className="underline hover:text-foreground"
          >
            Edit customer
          </Link>
        </p>
      )}
    </>
  );
}

/** CS step checklist: rows = steps (from SETTINGS > CUSTOMER CARE), columns = TEXT / EMAIL. */
export function OrderCustomerCareSection({
  orderId,
  requestId,
  info,
}: {
  orderId: string;
  requestId?: string | null | undefined;
  info: CareOrderInfo;
}) {
  const qc = useQueryClient();
  const settings = useQuery(pilotSettingsQuery());
  const steps = careStepsFromSettings(settings.data?.customer_care_steps);
  const values = careValues(info);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const checksKey = ["order-cs-checks", orderId];
  const checks = useQuery({
    queryKey: checksKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_cs_checks")
        .select("id, step, channel, done_at")
        .eq("order_id", orderId);
      if (error) throw error;
      return data;
    },
    retry: false,
  });
  const autoMail = useQuery({
    queryKey: ["order-cs-auto-mail", requestId],
    enabled: !!requestId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shco_email_log")
        .select("kind, status, created_at")
        .eq("request_id", requestId!)
        .eq("status", "SENT")
        .order("created_at");
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async ({
      step,
      channel,
      id,
    }: {
      step: string;
      channel: Channel;
      id?: string | undefined;
    }) => {
      if (id) {
        const { error } = await supabase.from("order_cs_checks").delete().eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("order_cs_checks")
          .insert({ order_id: orderId, step, channel });
        if (error) throw error;
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: checksKey }),
  });

  const findCheck = (step: string, channel: Channel) =>
    (checks.data ?? []).find((c) => c.step === step && c.channel === channel);
  const findAuto = (kind?: string) =>
    kind ? (autoMail.data ?? []).find((l) => l.kind === kind) : undefined;

  const stepDone = (s: (typeof steps)[number]) =>
    CHANNELS.some((ch) => findCheck(s.key, ch)) || !!findAuto(s.auto_email);
  const doneCount = steps.filter(stepDone).length;

  const dayBefore = info.pickupAt
    ? shortDate(new Date(new Date(info.pickupAt).getTime() - 86400000).toISOString())
    : null;

  const missingTable = checks.isError;

  return (
    <SectionCard
      title="CUSTOMER CARE"
      action={
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {doneCount} / {steps.length}
        </span>
      }
    >
      {missingTable && (
        <p className="mb-2 font-mono text-[11px] text-destructive">
          Checklist storage is not set up yet (run order_cs_checks.sql in the Supabase SQL Editor).
        </p>
      )}
      <p className="mb-2 font-mono text-[11px] text-muted-foreground">
        Tap a step to see its message for this customer. Edit steps and wording in SETTINGS &gt;
        CUSTOMER CARE.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="label-caps py-1.5 pr-2 text-left text-[11px] font-normal text-muted-foreground">
                STEP
              </th>
              {CHANNELS.map((ch) => (
                <th
                  key={ch}
                  className="label-caps w-[7.5rem] px-1 py-1.5 text-center text-[11px] font-normal text-muted-foreground"
                >
                  {ch}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => {
              const done = stepDone(s);
              const open = openKey === s.key;
              const text = fillCareTemplate(s.text, values);
              const subject = fillCareTemplate(s.email_subject, values);
              const emailBody = fillCareTemplate(s.email_body, values);
              return (
                <Fragment key={s.key}>
                  <tr className={"border-b border-border " + (open ? "bg-secondary/40" : "")}>
                    <td className="py-2 pr-2 align-top">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setOpenKey(open ? null : s.key)}
                        className="flex w-full items-start gap-2 text-left"
                      >
                        <span
                          className={
                            "mt-1 h-2.5 w-2.5 shrink-0 rounded-full border " +
                            (done ? "border-foreground bg-foreground" : "border-muted-foreground")
                          }
                          aria-hidden
                        />
                        <span className="min-w-0">
                          <span className="block">
                            {s.label}{" "}
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {open ? "▲ HIDE" : "▼ MESSAGE"}
                            </span>
                          </span>
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {s.key === "day_before" && dayBefore ? `Due ${dayBefore} · ` : ""}
                            {s.hint}
                          </span>
                        </span>
                      </button>
                    </td>
                    {CHANNELS.map((ch) => {
                      const auto = ch === "EMAIL" ? findAuto(s.auto_email) : undefined;
                      const check = findCheck(s.key, ch);
                      if (auto && !check) {
                        return (
                          <td key={ch} className="px-1 py-2 text-center align-top">
                            <span
                              className="label-caps inline-flex min-h-[28px] w-full items-center justify-center border border-foreground/40 bg-secondary px-1 text-[10px]"
                              title="Sent automatically by the web order system"
                            >
                              AUTO ✓ {shortDate(auto.created_at)}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={ch} className="px-1 py-2 text-center align-top">
                          <button
                            type="button"
                            disabled={missingTable || toggle.isPending}
                            aria-pressed={!!check}
                            aria-label={`${s.label} ${ch}`}
                            onClick={() =>
                              toggle.mutate({ step: s.key, channel: ch, id: check?.id })
                            }
                            className={
                              "label-caps inline-flex min-h-[28px] w-full items-center justify-center border px-1 text-[10px] disabled:opacity-40 " +
                              (check
                                ? "border-foreground bg-foreground text-background"
                                : "border-input bg-background text-muted-foreground hover:border-foreground hover:text-foreground")
                            }
                          >
                            {check ? `✓ ${shortDate(check.done_at)}` : "MARK SENT"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {open && (
                    <tr className="border-b border-border bg-secondary/40">
                      <td colSpan={3} className="px-2 pb-3 pt-1">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <MessageBox label="TEXT" body={text} />
                          <MessageBox label="EMAIL" subject={subject} body={emailBody} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {toggle.isError && (
        <p className="mt-2 font-mono text-xs uppercase text-destructive">
          {(toggle.error as Error).message}
        </p>
      )}
    </SectionCard>
  );
}

function MessageBox({ label, subject, body }: { label: string; subject?: string; body: string }) {
  const missing = /\[\w+\]/.test((subject ?? "") + body);
  return (
    <div className="min-w-0 space-y-1.5 border border-border bg-background p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="label-caps text-[11px] text-muted-foreground">{label}</span>
        <div className="flex gap-1.5">
          {subject !== undefined && <CopyButton value={subject} label="COPY SUBJECT" />}
          <CopyButton value={body} />
        </div>
      </div>
      {subject !== undefined && (
        <p className="font-mono text-[12px]">
          <span className="text-muted-foreground">Subject: </span>
          {subject || "—"}
        </p>
      )}
      <p className="whitespace-pre-line text-sm leading-relaxed">{body || "—"}</p>
      {missing && (
        <p className="font-mono text-[11px] text-destructive">
          [ ] = missing on this order. Fill it in above or edit before sending.
        </p>
      )}
    </div>
  );
}
