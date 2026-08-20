import { useState } from "react";
import { buttonClass, inputClass } from "./ui";

export function FunctionPicker({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
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
              {name}
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
