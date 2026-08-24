import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { aromaTagUsageQuery } from "@/lib/queries";
import { aromaTagCandidates } from "@/lib/pilot";
import { inputClass } from "./ui";

/**
 * 아로마 태그 멀티 콤보박스.
 * 후보 = 코드 하드코딩 기본 어휘 24종 + 사용자가 실제 쓴 태그(DB 집계).
 * 후보 클릭으로 추가, 후보에 없는 단어는 엔터로 자유 태그 추가.
 */
export function AromaTagsInput({
  value,
  onSave,
}: {
  value: string[];
  onSave: (next: string[]) => void;
}) {
  const usage = useQuery(aromaTagUsageQuery());
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const candidates = useMemo(
    () => aromaTagCandidates((usage.data ?? []).map((u) => u.tag)),
    [usage.data]
  );

  const term = draft.trim().toLowerCase();
  const pool = candidates.filter((c) => !value.includes(c.value));
  const filtered = term
    ? pool.filter(
        (c) =>
          c.value.toLowerCase().includes(term) ||
          (c.en ?? "").toLowerCase().includes(term)
      )
    : pool;
  const exact = candidates.some((c) => c.value.toLowerCase() === term);
  const showFreeAdd = Boolean(term) && !exact;

  const add = (tag: string) => {
    const next = tag.trim();
    if (next && !value.includes(next)) onSave([...value, next]);
    setDraft("");
    inputRef.current?.focus();
  };

  const onEnter = () => {
    if (!term) return;
    // 정확히 일치하는 후보가 있으면 그 후보의 정규 표기로, 없으면 자유 태그로 추가
    const match = candidates.find((c) => c.value.toLowerCase() === term);
    add(match ? match.value : draft);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {value.length === 0 && (
          <span className="font-mono text-xs uppercase text-muted-foreground">
            NO AROMA NOTES
          </span>
        )}
        {value.map((tag) => (
          <button
            key={tag}
            type="button"
            title="REMOVE"
            onClick={() => onSave(value.filter((t) => t !== tag))}
            className="label-caps border border-foreground bg-foreground px-2 py-1 text-[11px] text-background"
          >
            {tag} ×
          </button>
        ))}
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          className={inputClass}
          placeholder="SEARCH OR ADD AROMA…"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {open && (filtered.length > 0 || showFreeAdd) && (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto border border-border bg-background">
            {filtered.map((candidate) => (
              <button
                key={candidate.value}
                type="button"
                // blur보다 먼저 선택이 발생하도록
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(candidate.value)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-secondary"
              >
                <span className="text-sm">{candidate.value}</span>
                {candidate.en && (
                  <span className="font-mono text-xs uppercase text-muted-foreground">
                    {candidate.en}
                  </span>
                )}
              </button>
            ))}
            {showFreeAdd && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(draft)}
                className="flex min-h-[44px] w-full items-center gap-2 border-t border-dashed border-border px-3 py-2 text-left hover:bg-secondary"
              >
                <span className="label-caps text-xs text-muted-foreground">
                  + ADD
                </span>
                <span className="text-sm">{draft.trim()}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
