import { useState } from "react";
import { removePopupCategory, type PopupPlan } from "@/lib/popup";
import { SectionCard, buttonClass, inputClass, selectClass } from "./ui";

export function PopupChecklistSection({
  plan,
  onChange,
}: {
  plan: PopupPlan;
  onChange: (patch: Partial<PopupPlan>) => void;
}) {
  const [managing, setManaging] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const categories = plan.check_categories;
  const addCategory = () => {
    const label = name.trim();
    if (!label || label.length > 80) {
      setError("카테고리 이름은 1–80자로 입력하세요");
      return;
    }
    if (categories.some((c) => c.label.trim().toLowerCase() === label.toLowerCase())) {
      setError("같은 이름의 카테고리가 있습니다");
      return;
    }
    if (categories.length >= 30) {
      setError("카테고리는 30개까지 추가할 수 있습니다");
      return;
    }
    onChange({ check_categories: [...categories, { id: crypto.randomUUID(), label }] });
    setName("");
    setError("");
  };
  const remove = (id: string, destination?: string) => {
    try {
      const next = removePopupCategory(plan, id, destination);
      onChange({ check_categories: next.check_categories, checklist: next.checklist });
      setDeleting(null);
      setTarget("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const move = (index: number, direction: number) => {
    const next = [...categories];
    const to = index + direction;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to]!, next[index]!];
    onChange({ check_categories: next });
  };
  return (
    <SectionCard
      title={`준비 체크리스트 · ${plan.checklist.filter((c) => c.done).length}/${plan.checklist.length}`}
      action={
        <button
          type="button"
          className={buttonClass}
          aria-expanded={managing}
          onClick={() => {
            setManaging((v) => !v);
            setDeleting(null);
            setTarget("");
          }}
        >
          {managing ? "관리 닫기" : "카테고리 관리"}
        </button>
      }
    >
      {managing && (
        <div className="mb-4 space-y-3 border border-border p-3">
          <p className="text-xs text-muted-foreground">
            이 팝업의 카테고리 이름·순서를 관리합니다. 항목이 있는 카테고리는 다른 카테고리로 옮긴
            뒤 삭제할 수 있습니다. 변경 후 SAVE POP UP을 눌러 저장하세요.
          </p>
          {categories.map((category, index) => {
            const count = plan.checklist.filter((c) => c.group === category.id).length;
            return (
              <div key={category.id} className="space-y-2">
                <div className="flex items-center gap-1">
                  <input
                    aria-label={`${category.label || "카테고리"} 이름`}
                    className={inputClass}
                    value={category.label}
                    maxLength={80}
                    onChange={(e) =>
                      onChange({
                        check_categories: categories.map((c) =>
                          c.id === category.id ? { ...c, label: e.target.value } : c,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`${category.label} 위로`}
                    className={buttonClass}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`${category.label} 아래로`}
                    className={buttonClass}
                    disabled={index === categories.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`${category.label} 카테고리 삭제`}
                    className={buttonClass}
                    disabled={count > 0 && categories.length === 1}
                    title={
                      count > 0 && categories.length === 1
                        ? "항목을 옮길 다른 카테고리를 먼저 추가하세요"
                        : undefined
                    }
                    onClick={() => {
                      if (!count) remove(category.id);
                      else {
                        setDeleting(category.id);
                        setTarget("");
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
                {deleting === category.id && (
                  <div className="space-y-2 border border-dashed border-border p-2 text-xs">
                    <p>
                      {category.label}의 항목 {count}개를 어디로 옮길까요? 체크 상태도 함께
                      유지됩니다.
                    </p>
                    <select
                      aria-label="항목을 옮길 카테고리"
                      className={selectClass}
                      value={target}
                      onChange={(e) => setTarget(e.target.value)}
                    >
                      <option value="">이동할 카테고리 선택</option>
                      {categories
                        .filter((c) => c.id !== category.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={buttonClass}
                        disabled={!target}
                        onClick={() => remove(category.id, target)}
                      >
                        항목 이동 후 삭제
                      </button>
                      <button
                        type="button"
                        className={buttonClass}
                        onClick={() => setDeleting(null)}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex gap-2">
            <input
              aria-label="새 카테고리 이름"
              className={inputClass}
              placeholder="예: 장비 준비 / 운반 / 홍보"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
                setError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCategory();
                }
              }}
            />
            <button
              type="button"
              className={buttonClass}
              disabled={categories.length >= 30}
              onClick={addCategory}
            >
              + 카테고리
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        {categories.map((category) => {
          const checks = plan.checklist.filter((c) => c.group === category.id);
          return (
            <div key={category.id} className="space-y-2">
              <div className="flex justify-between gap-2">
                <h3 className="label-caps text-xs">
                  {category.label}{" "}
                  <span className="text-muted-foreground">
                    {checks.filter((c) => c.done).length}/{checks.length}
                  </span>
                </h3>
                <button
                  type="button"
                  className="text-xs underline"
                  disabled={plan.checklist.length >= 300}
                  onClick={() =>
                    onChange({
                      checklist: [
                        ...plan.checklist,
                        { id: crypto.randomUUID(), group: category.id, label: "", done: false },
                      ],
                    })
                  }
                >
                  + 항목
                </button>
              </div>
              {checks.map((check) => (
                <div key={check.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={`${check.label || category.label} 구비 완료`}
                    checked={check.done}
                    onChange={(e) =>
                      onChange({
                        checklist: plan.checklist.map((c) =>
                          c.id === check.id ? { ...c, done: e.target.checked } : c,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={`${category.label} 내용`}
                    className={`${inputClass} ${check.done ? "text-muted-foreground line-through" : ""}`}
                    value={check.label}
                    maxLength={1000}
                    placeholder="준비할 내용과 수량"
                    onChange={(e) =>
                      onChange({
                        checklist: plan.checklist.map((c) =>
                          c.id === check.id ? { ...c, label: e.target.value } : c,
                        ),
                      })
                    }
                  />
                  {managing && (
                    <select
                      aria-label={`${check.label || "항목"} 카테고리`}
                      className={`${selectClass} !w-32`}
                      value={check.group}
                      onChange={(e) =>
                        onChange({
                          checklist: plan.checklist.map((c) =>
                            c.id === check.id ? { ...c, group: e.target.value } : c,
                          ),
                        })
                      }
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    aria-label={`${check.label || "준비 항목"} 제거`}
                    className="px-1 text-xs"
                    onClick={() =>
                      onChange({ checklist: plan.checklist.filter((c) => c.id !== check.id) })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              {!checks.length && (
                <p className="text-xs text-muted-foreground">준비 항목을 추가하세요.</p>
              )}
            </div>
          );
        })}
      </div>
      {!categories.length && (
        <p className="text-xs text-muted-foreground">카테고리 관리에서 카테고리를 추가하세요.</p>
      )}
    </SectionCard>
  );
}
