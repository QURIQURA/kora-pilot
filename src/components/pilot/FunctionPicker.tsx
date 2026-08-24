import { useState } from "react";
import type { FunctionDisplayParts } from "@/lib/pilot";
import { buttonClass, inputClass } from "./ui";

export function FunctionPicker({
  options,
  selected,
  onChange,
  labels,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** 옵션 name → 영문 우선 표시 라벨. 없으면 name 그대로 표시 */
  labels?: Record<string, FunctionDisplayParts>;
}) {
  const [custom, setCustom] = useState("");

  const toggle = (name: string) => {
    onChange(
      selected.includes(name)
        ? selected.filter((n) => n !== name)
        : [...selected, name]
    );
  };

  const all = [...options, ...selected.filter((s) => !options.includes(s))];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {all.map((name) => {
          const active = selected.includes(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={
                "label-caps border px-2 py-2 text-[11px] " +
                (active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground")
              }
            >
              {labels?.[name] ? (
                <>
                  <span>{labels[name].primary}</span>
                  {labels[name].secondary && (
                    <span className="ml-1 text-[9px] opacity-70">
                      ({labels[name].secondary})
                    </span>
                  )}
                </>
              ) : (
                name
              )}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2">
        <input
          className={inputClass}
          placeholder="CUSTOM FUNCTION"
          value={custom}
          onChange={(e) => setCustom(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const name = custom.trim();
              if (name && !selected.includes(name)) onChange([...selected, name]);
              setCustom("");
            }
          }}
        />
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            const name = custom.trim();
            if (name && !selected.includes(name)) onChange([...selected, name]);
            setCustom("");
          }}
        >
          ADD
        </button>
      </div>
    </div>
  );
}
