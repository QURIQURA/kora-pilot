import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, RotateCw, StickyNote, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, orderMoodboardItemsQuery, type OrderMoodboardItem } from "@/lib/queries";
import { SectionCard, buttonClass } from "@/components/pilot/ui";
import { cn } from "@/lib/utils";

/**
 * ORDER 상세 맨 위 MOOD BOARD(2026-10-13 사용자 요청).
 * "피그마/PPT처럼 이미지를 스크랩해서 바로 붙여넣기할 수 있는 보드" — 고정 그리드가 아니라
 * 자유 좌표(x/y, px) 캔버스에 이미지/텍스트 메모를 흩뿌려 놓는 디자인 구상용 보드.
 * - 보드 영역 클릭(포커스) 후 Ctrl+V로 클립보드 이미지를 바로 붙여넣기(Clipboard API, paste 이벤트)
 * - + IMAGE로 파일 선택 업로드도 지원(Supabase Storage "order-moodboards" 버킷, product-images와
 *   동일한 공개읽기/소유자쓰기 패턴)
 * - + NOTE로 포스트잇 스타일 텍스트 메모 추가
 * - 각 아이템은 드래그로 이동, 우하단 핸들로 리사이즈, 상단 중앙 핸들로 회전(틸트), 호버 시
 *   우상단 X로 삭제 — 2026-10-13 사용자 요청: "이미지 틸트 내가 조정할 수 있도록"(생성 시 랜덤으로
 *   주던 각도를 드래그로 직접 조절 가능하게).
 * - 메모(NOTE) 색상도 생성 시 랜덤 배정에서 끝나지 않고, 헤더의 프리셋 스와치 + 네이티브 컬러
 *   피커로 언제든 자유롭게 바꿀 수 있다(2026-10-13 사용자 요청: "메모 컬러도 자율적으로 수정").
 * - 드래그/리사이즈/회전 중에는 로컬 상태(livePos)만 갱신하고, 포인터를 뗄 때(pointerup)만 DB에
 *   커밋한다 — WorkflowTimeline.tsx의 드래그 패턴과 동일한 방식(과도한 쓰기 방지).
 */
const BOARD_HEIGHT = 440;
const DEFAULT_IMAGE_WIDTH = 200;
const DEFAULT_NOTE_SIZE = { width: 180, height: 140 };
const NOTE_COLORS = ["#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff"];

function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: DEFAULT_IMAGE_WIDTH, height: DEFAULT_IMAGE_WIDTH });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

type LivePos = { id: string; x: number; y: number; width: number; height: number; rotation: number };

export function OrderMoodboardSection({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const items = useQuery(orderMoodboardItemsQuery(orderId));
  const boardRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [livePos, setLivePos] = useState<LivePos | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["order_moodboard_items", orderId] });
  };

  const rows = items.data ?? [];
  const maxZ = rows.reduce((m, it) => Math.max(m, it.z_index), 0);

  const insertImage = useMutation({
    mutationFn: async ({ file, x, y }: { file: File; x: number; y: number }) => {
      const userId = await currentUserId();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${orderId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("order-moodboards")
        .upload(path, file, file.type ? { contentType: file.type } : undefined);
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("order-moodboards").getPublicUrl(path);
      const dims = await readImageSize(file);
      const width = Math.min(dims.width || DEFAULT_IMAGE_WIDTH, DEFAULT_IMAGE_WIDTH * 1.4);
      const height = dims.width ? (dims.height * width) / dims.width : DEFAULT_IMAGE_WIDTH;
      const { error: insertError } = await supabase.from("order_moodboard_items").insert({
        user_id: userId,
        order_id: orderId,
        kind: "image",
        image_url: data.publicUrl,
        x,
        y,
        width,
        height,
        // 2026-10-13 사용자 요청: "처음 추가할 땐 기본적으로 틸트하지 않고 정각으로" —
        // 예전엔 랜덤 각도(-3~3도)로 자연스러운 스크랩북 느낌을 줬지만, 틸트를 직접
        // 조정하는 핸들이 생겼으니 시작은 0도(정각)로 두고 조정은 사용자가 하게 한다.
        rotation: 0,
        z_index: maxZ + 1,
      });
      if (insertError) throw insertError;
    },
    onSuccess: invalidate,
    onError: (e) => setError((e as Error).message),
  });

  const insertNote = useMutation({
    mutationFn: async ({ x, y }: { x: number; y: number }) => {
      const userId = await currentUserId();
      const color = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)] ?? NOTE_COLORS[0]!;
      const { error: insertError } = await supabase.from("order_moodboard_items").insert({
        user_id: userId,
        order_id: orderId,
        kind: "note",
        content: "",
        x,
        y,
        width: DEFAULT_NOTE_SIZE.width,
        height: DEFAULT_NOTE_SIZE.height,
        rotation: 0, // 2026-10-13 사용자 요청: 처음엔 정각으로, 틸트는 핸들로 직접 조정
        z_index: maxZ + 1,
        color,
      });
      if (insertError) throw insertError;
    },
    onSuccess: invalidate,
    onError: (e) => setError((e as Error).message),
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<OrderMoodboardItem> }) => {
      const { error: updateError } = await supabase
        .from("order_moodboard_items")
        .update(patch)
        .eq("id", id);
      if (updateError) throw updateError;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (item: OrderMoodboardItem) => {
      if (item.kind === "image" && item.image_url) {
        const marker = "/order-moodboards/";
        const idx = item.image_url.indexOf(marker);
        if (idx !== -1) {
          await supabase.storage.from("order-moodboards").remove([item.image_url.slice(idx + marker.length)]);
        }
      }
      const { error: deleteError } = await supabase.from("order_moodboard_items").delete().eq("id", item.id);
      if (deleteError) throw deleteError;
    },
    onSuccess: invalidate,
  });

  const bringToFront = (item: OrderMoodboardItem) => {
    if (item.z_index === maxZ) return;
    update.mutate({ id: item.id, patch: { z_index: maxZ + 1 } });
  };

  const cascadeOffset = (i: number) => i * 24;

  const defaultDropPoint = (i = 0) => {
    const rect = boardRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 - DEFAULT_IMAGE_WIDTH / 2 : 40;
    const cy = rect ? BOARD_HEIGHT / 2 - DEFAULT_IMAGE_WIDTH / 2 : 40;
    return { x: cx + cascadeOffset(i), y: cy + cascadeOffset(i) };
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      const files = Array.from(e.clipboardData?.items ?? [])
        .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
        .map((it) => it.getAsFile())
        .filter((f): f is File => f != null);
      if (files.length === 0) return;
      e.preventDefault();
      files.forEach((file, i) => {
        const { x, y } = defaultDropPoint(i);
        insertImage.mutate({ file, x, y });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insertImage],
  );

  const handleFileInput = (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    files.forEach((file, i) => {
      const { x, y } = defaultDropPoint(i);
      insertImage.mutate({ file, x, y });
    });
  };

  // ── 드래그/리사이즈(WorkflowTimeline.tsx와 동일한 패턴: 로컬 미리보기 → pointerup에 커밋) ──
  const dragSession = useRef<{
    id: string;
    mode: "move" | "resize" | "rotate";
    startX: number;
    startY: number;
    orig: { x: number; y: number; width: number; height: number; rotation: number };
    // "rotate" 모드 전용 — 아이템 중심(뷰포트 좌표)과 드래그 시작 각도
    centerX: number;
    centerY: number;
    startAngle: number;
  } | null>(null);

  const beginDrag = (e: React.PointerEvent, item: OrderMoodboardItem, mode: "move" | "resize") => {
    e.preventDefault();
    if (mode === "move") bringToFront(item);
    dragSession.current = {
      id: item.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation },
      centerX: 0,
      centerY: 0,
      startAngle: 0,
    };
    setLivePos({ id: item.id, x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation });
  };

  /** 상단 중앙 회전 핸들 — 아이템 중심에서 포인터까지의 각도 변화만큼 rotation을 더한다. */
  const beginRotate = (e: React.PointerEvent, item: OrderMoodboardItem) => {
    e.preventDefault();
    e.stopPropagation();
    bringToFront(item);
    const rect = boardRef.current?.getBoundingClientRect();
    const centerX = (rect?.left ?? 0) + item.x + item.width / 2;
    const centerY = (rect?.top ?? 0) + item.y + item.height / 2;
    const startAngle = (Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180) / Math.PI;
    dragSession.current = {
      id: item.id,
      mode: "rotate",
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation },
      centerX,
      centerY,
      startAngle,
    };
    setLivePos({ id: item.id, x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation });
  };

  useEffect(() => {
    function onMove(e: PointerEvent) {
      const s = dragSession.current;
      if (!s) return;
      const rect = boardRef.current?.getBoundingClientRect();
      const boardWidth = rect?.width ?? 2000;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      if (s.mode === "move") {
        const maxX = Math.max(0, boardWidth - s.orig.width);
        const maxY = Math.max(0, BOARD_HEIGHT - s.orig.height);
        setLivePos({
          id: s.id,
          x: Math.min(Math.max(0, s.orig.x + dx), maxX),
          y: Math.min(Math.max(0, s.orig.y + dy), maxY),
          width: s.orig.width,
          height: s.orig.height,
          rotation: s.orig.rotation,
        });
      } else if (s.mode === "resize") {
        const maxWidth = Math.max(60, boardWidth - s.orig.x);
        const maxHeight = Math.max(60, BOARD_HEIGHT - s.orig.y);
        setLivePos({
          id: s.id,
          x: s.orig.x,
          y: s.orig.y,
          width: Math.min(Math.max(60, s.orig.width + dx), maxWidth),
          height: Math.min(Math.max(60, s.orig.height + dy), maxHeight),
          rotation: s.orig.rotation,
        });
      } else {
        const currentAngle = (Math.atan2(e.clientY - s.centerY, e.clientX - s.centerX) * 180) / Math.PI;
        setLivePos({
          id: s.id,
          x: s.orig.x,
          y: s.orig.y,
          width: s.orig.width,
          height: s.orig.height,
          rotation: s.orig.rotation + (currentAngle - s.startAngle),
        });
      }
    }
    function onUp() {
      const s = dragSession.current;
      dragSession.current = null;
      if (!s) return;
      setLivePos((lp) => {
        if (lp && lp.id === s.id) {
          update.mutate({
            id: lp.id,
            patch: { x: lp.x, y: lp.y, width: lp.width, height: lp.height, rotation: lp.rotation },
          });
        }
        return null;
      });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SectionCard
      title="MOOD BOARD"
      action={
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFileInput(e.target.files);
              e.target.value = "";
            }}
          />
          <button type="button" className={buttonClass} onClick={() => fileInputRef.current?.click()}>
            <ImagePlus className="mr-1 inline h-3.5 w-3.5" />
            IMAGE
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => insertNote.mutate(defaultDropPoint())}
          >
            <StickyNote className="mr-1 inline h-3.5 w-3.5" />
            NOTE
          </button>
        </div>
      }
    >
      <div
        ref={boardRef}
        tabIndex={0}
        onPaste={handlePaste}
        className="relative overflow-hidden border border-dashed border-border bg-secondary/30 outline-none focus:border-foreground"
        style={{ height: BOARD_HEIGHT }}
      >
        {rows.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center font-mono text-xs uppercase text-muted-foreground">
            여기를 클릭한 뒤 이미지를 붙여넣으세요(Ctrl+V) · 또는 IMAGE / NOTE 버튼
          </p>
        )}
        {rows.map((item) => {
          const pos = livePos && livePos.id === item.id ? livePos : item;
          return (
            <div
              key={item.id}
              className="group absolute"
              style={{
                left: pos.x,
                top: pos.y,
                width: pos.width,
                height: pos.height,
                transform: `rotate(${pos.rotation}deg)`,
                zIndex: item.z_index,
              }}
            >
              <div className="absolute inset-0 border border-border bg-background shadow-sm">
                {item.kind === "image" ? (
                  <img
                    src={item.image_url ?? ""}
                    alt=""
                    draggable={false}
                    className="h-full w-full cursor-move object-cover"
                    onPointerDown={(e) => beginDrag(e, item, "move")}
                  />
                ) : (
                  <div className="flex h-full flex-col" style={{ backgroundColor: item.color ?? "#fde68a" }}>
                    <div
                      className="flex h-6 shrink-0 cursor-move items-center justify-between gap-1 px-1"
                      onPointerDown={(e) => beginDrag(e, item, "move")}
                    >
                      {/* 프리셋 스와치 — 빠른 선택 */}
                      <div className="flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
                        {NOTE_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="h-3 w-3 shrink-0 rounded-full border border-black/10"
                            style={{ backgroundColor: c }}
                            title="색상 변경"
                            onClick={() => update.mutate({ id: item.id, patch: { color: c } })}
                          />
                        ))}
                      </div>
                      {/* 자유 컬러 피커 — 2026-10-13 사용자 요청: "메모 컬러도 자율적으로 수정" */}
                      <label
                        className="relative h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full border border-black/30"
                        style={{ backgroundColor: item.color ?? "#fde68a" }}
                        title="자유 색상 선택"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="color"
                          value={item.color ?? "#fde68a"}
                          onChange={(e) => update.mutate({ id: item.id, patch: { color: e.target.value } })}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </label>
                    </div>
                    <textarea
                      className="flex-1 resize-none border-0 bg-transparent p-2 text-xs font-mono text-foreground outline-none"
                      defaultValue={item.content ?? ""}
                      placeholder="메모…"
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={(e) => {
                        if (e.target.value !== (item.content ?? "")) {
                          update.mutate({ id: item.id, patch: { content: e.target.value } });
                        }
                      }}
                    />
                  </div>
                )}
              </div>
              <button
                type="button"
                className="absolute -top-2 -right-2 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground group-hover:flex hover:text-destructive"
                onClick={() => remove.mutate(item)}
                title="삭제"
              >
                <X className="h-3 w-3" />
              </button>
              {/* 회전(틸트) 핸들 — 상단 중앙, 드래그하면 아이템 중심 기준으로 회전 */}
              <div
                className="absolute -top-2 left-1/2 hidden h-5 w-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-border bg-background text-muted-foreground group-hover:flex active:cursor-grabbing"
                onPointerDown={(e) => beginRotate(e, item)}
                title="회전(틸트)"
              >
                <RotateCw className="h-3 w-3" />
              </div>
              <div
                className="absolute -right-1 -bottom-1 h-3 w-3 cursor-nwse-resize border border-border bg-background opacity-0 group-hover:opacity-100"
                onPointerDown={(e) => beginDrag(e, item, "resize")}
              />
            </div>
          );
        })}
      </div>
      {error && (
        <p className={cn("mt-2 font-mono text-xs uppercase text-destructive")}>{error}</p>
      )}
    </SectionCard>
  );
}
