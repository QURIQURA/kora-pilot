import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Move, RotateCw, StickyNote, X } from "lucide-react";
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
 * - 메모(NOTE) 색상은 생성 시 랜덤 배정 후, 헤더의 네이티브 컬러 피커로 언제든 자유롭게
 *   바꿀 수 있다(2026-10-13 사용자 요청: "메모 컬러도 자율적으로 수정"). 2026-10-14 사용자
 *   요청으로 프리셋 스와치 버튼은 제거했다 — "기본으로 주어진 색상들이 실수로 자꾸 눌려서
 *   내가 정해둔 색상을 잃어버린다"는 피드백에 따라, 색상은 이제 컬러 피커로만 바꾼다
 *   (NOTE_COLORS 배열은 생성 시 랜덤 초기값 용도로만 남아있고 더 이상 클릭 가능한 버튼이 아님).
 * - 메모(NOTE) 카드 모양(셰입)도 사각형/정사각형/원형/삼각형 중 헤더에서 언제든 바꿀 수 있다
 *   (2026-10-14 사용자 요청: "메모 카드에 셰입 선택 옵션 추가" → "사각 하나를 정사각으로 바꾸고
 *   삼각형도 추가"). 이미지 카드는 대상 아님. 정사각형 선택 시 현재 폭/높이 중 작은 쪽으로
 *   맞춰 즉시 1:1 비율로 리사이즈한다(그래야 "정사각"이라는 이름이 실제와 맞음).
 * - 메모 색상에 두 번째 컬러(color2)를 추가하면 단색 대신 135deg 그라데이션으로 표시된다
 *   (2026-10-14 사용자 요청: "메모 컬러 그라데이션 기능도 추가"). color2를 다시 비우면 단색으로 복귀.
 * - 삼각형 등 셰입이 clip-path로 모서리를 잘라내면, 그 영역은 브라우저가 포인터 히트테스트
 *   대상에서도 제외해버려서 헤더(이동 트리거)가 거기 있으면 드래그가 먹통이 된다(2026-10-14
 *   사용자 리포트: "셰입에 따라 잘리면 활성화가 안 돼서 못 움직임"). 대책 C안(A+B 결합) 적용:
 *   (A) 셰입으로 잘리는 박스 "뒤"에 잘리지 않는 전체 사각형 투명 레이어를 깔아 바운딩 박스
 *       어디를 눌러도 최소한 이동은 되게 한다(보이는 부분은 그 위의 실제 콘텐츠가 그대로 받음).
 *   (B) 회전 핸들처럼 셰입 밖(좌상단)에 항상 보이는 전용 "이동" 그립 아이콘을 추가해 셰입과
 *       무관하게 확실한 그랩 지점을 제공한다.
 * - 드래그/리사이즈/회전 중에는 로컬 상태(livePos)만 갱신하고, 포인터를 뗄 때(pointerup)만 DB에
 *   커밋한다 — WorkflowTimeline.tsx의 드래그 패턴과 동일한 방식(과도한 쓰기 방지).
 */
const BOARD_HEIGHT = 440;
const DEFAULT_IMAGE_WIDTH = 200;
const DEFAULT_NOTE_SIZE = { width: 180, height: 140 };
const NOTE_COLORS = ["#fde68a", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff"];

/**
 * 메모 카드 셰입(모양) 옵션(2026-10-14 사용자 요청: "고정된 사각형 말고 동그라미 등 다른 shape
 * 선택" → "사각 하나를 정사각으로 바꾸고 삼각형도 추가"). radiusClass는 둥근 모서리용, clipPath는
 * border-radius로 표현 안 되는 모양(삼각형)용 — 적용 시 둘 중 하나만 의미를 가진다.
 */
const NOTE_SHAPES = [
  {
    value: "rect",
    label: "사각형",
    radiusClass: "rounded-none",
    clipPath: null,
    forceSquare: false,
  },
  {
    value: "square",
    label: "정사각형",
    radiusClass: "rounded-none",
    clipPath: null,
    forceSquare: true,
  },
  {
    value: "circle",
    label: "원형",
    radiusClass: "rounded-full",
    clipPath: null,
    forceSquare: false,
  },
  {
    value: "triangle",
    label: "삼각형",
    radiusClass: "rounded-none",
    clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)",
    forceSquare: false,
  },
] as const;

function shapeRadiusClass(shape: string | null | undefined): string {
  return NOTE_SHAPES.find((s) => s.value === shape)?.radiusClass ?? "rounded-none";
}

function shapeClipPath(shape: string | null | undefined): string | undefined {
  return NOTE_SHAPES.find((s) => s.value === shape)?.clipPath ?? undefined;
}

/**
 * 메모 배경 — color2가 있으면 그라데이션, 없으면 단색(2026-10-14 사용자 요청: "메모 컬러
 * 그라데이션 기능도 추가"). `background` 단축 속성은 단색에도 그대로 쓸 수 있어 분기 없이 적용.
 */
function noteBackground(item: Pick<OrderMoodboardItem, "color" | "color2">): string {
  const c1 = item.color ?? "#fde68a";
  if (item.color2) return `linear-gradient(135deg, ${c1} 0%, ${item.color2} 100%)`;
  return c1;
}

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

type LivePos = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
};

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
          await supabase.storage
            .from("order-moodboards")
            .remove([item.image_url.slice(idx + marker.length)]);
        }
      }
      const { error: deleteError } = await supabase
        .from("order_moodboard_items")
        .delete()
        .eq("id", item.id);
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
      orig: {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
      },
      centerX: 0,
      centerY: 0,
      startAngle: 0,
    };
    setLivePos({
      id: item.id,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    });
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
      orig: {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
      },
      centerX,
      centerY,
      startAngle,
    };
    setLivePos({
      id: item.id,
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      rotation: item.rotation,
    });
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
        const currentAngle =
          (Math.atan2(e.clientY - s.centerY, e.clientX - s.centerX) * 180) / Math.PI;
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
          <button
            type="button"
            className={buttonClass}
            onClick={() => fileInputRef.current?.click()}
          >
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
              {/* (A) 셰입 클리핑 사각지대 대책 — 잘리지 않는 전체 박스 투명 이동 레이어를
                  셰입 박스보다 먼저(= 아래에) 둔다. 셰입이 그려진 부분은 그 위의 실제 헤더/
                  텍스트가 클릭을 받고, clip-path로 잘려나간 모서리만 이 레이어가 받아 이동으로
                  처리한다(2026-10-14 사용자 리포트 대응, C안). 이미지는 셰입 클리핑이 없어 불필요. */}
              {item.kind === "note" && (
                <div
                  className="absolute inset-0 cursor-move"
                  onPointerDown={(e) => beginDrag(e, item, "move")}
                />
              )}
              <div
                className={cn(
                  "absolute inset-0 overflow-hidden border border-border bg-background shadow-sm",
                  item.kind === "note" && shapeRadiusClass(item.shape),
                )}
                style={
                  item.kind === "note" && shapeClipPath(item.shape)
                    ? { clipPath: shapeClipPath(item.shape) }
                    : undefined
                }
              >
                {item.kind === "image" ? (
                  <img
                    src={item.image_url ?? ""}
                    alt=""
                    draggable={false}
                    className="h-full w-full cursor-move object-cover"
                    onPointerDown={(e) => beginDrag(e, item, "move")}
                  />
                ) : (
                  <div
                    className="flex h-full flex-col"
                    style={{ background: noteBackground(item) }}
                  >
                    <div
                      className="flex shrink-0 cursor-move flex-wrap items-center justify-between gap-1 px-1 py-0.5"
                      onPointerDown={(e) => beginDrag(e, item, "move")}
                    >
                      {/* 셰입(모양) 선택 — 2026-10-14 사용자 요청: "메모 카드 모양을 동그라미 등으로 바꿀 수 있게" */}
                      <div
                        className="flex items-center gap-1"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {NOTE_SHAPES.map((s) => (
                          <button
                            key={s.value}
                            type="button"
                            title={s.label}
                            onClick={() => {
                              // 정사각형은 이름값대로 실제 1:1 비율이어야 하므로 선택 즉시
                              // 현재 폭/높이 중 작은 쪽으로 맞춰 리사이즈한다.
                              if (s.forceSquare) {
                                const side = Math.min(item.width, item.height);
                                update.mutate({
                                  id: item.id,
                                  patch: { shape: s.value, width: side, height: side },
                                });
                              } else {
                                update.mutate({ id: item.id, patch: { shape: s.value } });
                              }
                            }}
                            className={cn(
                              "flex h-3.5 w-3.5 shrink-0 items-center justify-center border",
                              (item.shape ?? "rect") === s.value
                                ? "border-foreground"
                                : "border-black/20",
                            )}
                          >
                            <span
                              className={cn("block h-2 w-2 bg-foreground/70", s.radiusClass)}
                              style={s.clipPath ? { clipPath: s.clipPath } : undefined}
                            />
                          </button>
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
                          onChange={(e) =>
                            update.mutate({ id: item.id, patch: { color: e.target.value } })
                          }
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        />
                      </label>
                      {/* 그라데이션 — 2026-10-14 사용자 요청: "메모 컬러 그라데이션 기능도 추가".
                          원형 스와치 클릭으로 on/off 토글, 켜지면 2번째 색상 피커가 나타난다. */}
                      <div
                        className="flex items-center gap-1"
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          title={item.color2 ? "그라데이션 끄기(단색으로)" : "그라데이션 켜기"}
                          onClick={() =>
                            update.mutate({
                              id: item.id,
                              patch: { color2: item.color2 ? null : "#ffffff" },
                            })
                          }
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 rounded-full border",
                            item.color2 ? "border-foreground" : "border-black/30",
                          )}
                          style={{
                            background: `linear-gradient(135deg, ${item.color ?? "#fde68a"} 0%, ${
                              item.color2 ?? "#ffffff"
                            } 100%)`,
                          }}
                        />
                        {item.color2 && (
                          <label
                            className="relative h-3.5 w-3.5 shrink-0 cursor-pointer rounded-full border border-black/30"
                            style={{ backgroundColor: item.color2 }}
                            title="그라데이션 2번째 색상"
                          >
                            <input
                              type="color"
                              value={item.color2}
                              onChange={(e) =>
                                update.mutate({ id: item.id, patch: { color2: e.target.value } })
                              }
                              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                          </label>
                        )}
                      </div>
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
              {/* (B) 전용 이동 그립 — 셰입(삼각형 등) 클리핑과 무관하게 항상 확실히 눌리는
                  그랩 지점(2026-10-14 사용자 리포트 대응, C안). 메모 카드만 대상. */}
              {item.kind === "note" && (
                <div
                  className="absolute -top-2 -left-2 hidden h-5 w-5 cursor-move items-center justify-center rounded-full border border-border bg-background text-muted-foreground group-hover:flex"
                  onPointerDown={(e) => beginDrag(e, item, "move")}
                  title="이동"
                >
                  <Move className="h-3 w-3" />
                </div>
              )}
              <div
                className="absolute -right-1 -bottom-1 h-3 w-3 cursor-nwse-resize border border-border bg-background opacity-0 group-hover:opacity-100"
                onPointerDown={(e) => beginDrag(e, item, "resize")}
              />
            </div>
          );
        })}
      </div>
      {error && <p className={cn("mt-2 font-mono text-xs uppercase text-destructive")}>{error}</p>}
    </SectionCard>
  );
}
