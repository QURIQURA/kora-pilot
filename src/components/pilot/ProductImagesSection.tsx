import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId } from "@/lib/queries";
import type { Product } from "@/lib/pilot";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { ImageCropModal } from "@/components/pilot/ImageCropModal";

/**
 * PRODUCT 상세 최상단 이미지 2단 그리드(2개) — 순서 고정(2026-09-22 사용자 지정):
 * 1행: 구상 이미지(스케치/레퍼런스) · 완성 사진(실제 완성작)
 * 2행: 단면 배치도 · 단면 실제 사진
 * Supabase Storage "product-images" 버킷(공개 읽기, 소유자만 쓰기)에 업로드하고
 * public URL을 products.image_* 컬럼에 저장한다. 재료/배합과 무관한 순수 참고 이미지.
 * 박스는 1:1 정사각형(2026-09-22) — 파일 선택 직후 크롭 모달(ImageCropModal)에서
 * 드래그/줌으로 영역을 조정한 뒤, 잘라낸 결과만 업로드한다.
 */
type ImageSlot =
  | "image_imagination_url"
  | "image_actual_url"
  | "image_cross_section_layout_url"
  | "image_cross_section_actual_url";

const ROW_1: { slot: ImageSlot; label: string }[] = [
  { slot: "image_imagination_url", label: "구상 이미지" },
  { slot: "image_actual_url", label: "완성 사진" },
];
const ROW_2: { slot: ImageSlot; label: string }[] = [
  { slot: "image_cross_section_layout_url", label: "단면 배치도" },
  { slot: "image_cross_section_actual_url", label: "단면 실제 사진" },
];

export function ProductImagesSection({
  productId,
  product,
}: {
  productId: string;
  product: Product;
}) {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["products", productId] });
    await queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const upload = useMutation({
    mutationFn: async ({ slot, file }: { slot: ImageSlot; file: File }) => {
      const userId = await currentUserId();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${userId}/${productId}/${slot}-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file, file.type ? { upsert: true, contentType: file.type } : { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      const patch = { [slot]: data.publicUrl } as TablesUpdate<"products">;
      const { error } = await supabase.from("products").update(patch).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (slot: ImageSlot) => {
      const patch = { [slot]: null } as TablesUpdate<"products">;
      const { error } = await supabase.from("products").update(patch).eq("id", productId);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROW_1.map(({ slot, label }) => (
          <ImageSlotBox
            key={slot}
            label={label}
            url={product[slot]}
            uploading={upload.isPending && upload.variables?.slot === slot}
            onUpload={(file) => upload.mutate({ slot, file })}
            onRemove={() => remove.mutate(slot)}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {ROW_2.map(({ slot, label }) => (
          <ImageSlotBox
            key={slot}
            label={label}
            url={product[slot]}
            uploading={upload.isPending && upload.variables?.slot === slot}
            onUpload={(file) => upload.mutate({ slot, file })}
            onRemove={() => remove.mutate(slot)}
          />
        ))}
      </div>
      {upload.isError && (
        <p className="font-mono text-xs uppercase text-destructive">
          {(upload.error as Error).message}
        </p>
      )}
    </div>
  );
}

function ImageSlotBox({
  label,
  url,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [pendingName, setPendingName] = useState("photo.jpg");

  const closeCrop = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  return (
    <div
      className="group relative aspect-square w-full overflow-hidden border border-border bg-secondary"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            setPendingName(file.name);
            setCropSrc(URL.createObjectURL(file));
          }
          e.target.value = "";
        }}
      />
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          label={label}
          onCancel={closeCrop}
          onApply={(blob) => {
            const ext = pendingName.split(".").pop()?.toLowerCase();
            const name = ext && ext !== "jpg" && ext !== "jpeg" ? pendingName.replace(/\.[^.]+$/, ".jpg") : pendingName;
            onUpload(new File([blob], name, { type: "image/jpeg" }));
            closeCrop();
          }}
        />
      )}
      {url ? (
        <>
          <img src={url} alt={label} className="h-full w-full object-cover" />
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center gap-2 bg-foreground/50 opacity-0 transition-opacity",
              hover && "opacity-100",
            )}
          >
            <button
              type="button"
              className="label-caps border border-background px-2 py-1 text-[11px] text-background hover:bg-background hover:text-foreground"
              onClick={() => inputRef.current?.click()}
            >
              교체
            </button>
            <button
              type="button"
              className="border border-background p-1.5 text-background hover:bg-background hover:text-foreground"
              onClick={onRemove}
              title="삭제"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={uploading}
          className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground hover:bg-secondary/60 disabled:opacity-50"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="h-5 w-5" />
          <span className="label-caps text-[11px]">
            {uploading ? "업로드 중…" : `+ ${label}`}
          </span>
        </button>
      )}
      {url && (
        <span className="label-caps pointer-events-none absolute bottom-1 left-1.5 bg-foreground/60 px-1.5 py-0.5 text-[10px] text-background">
          {label}
        </span>
      )}
    </div>
  );
}
