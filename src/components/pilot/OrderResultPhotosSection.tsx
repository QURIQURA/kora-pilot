import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentUserId, orderResultPhotosQuery } from "@/lib/queries";
import { SectionCard, buttonClass } from "@/components/pilot/ui";

/**
 * ORDER 상세 VISUALS 탭 — 결과물(완성작) 사진 갤러리(2026-10-15 사용자 요청: "무드보드 아래에
 * 결과물사진 업로드할수있게 이미지 박스만들어줘"). 구상 단계용 무드보드와는 성격이 달라 — 여러 장
 * 자유롭게 업로드해서 모아두는 단순한 그리드일 뿐, 좌표/회전 같은 무드보드의 자유 배치 기능은
 * 없음("복잡해지니까" 사용자 요청대로 단순하게 유지). 여러 장을 한 번에 선택해 업로드할 수 있고,
 * 호버하면 삭제 버튼이 뜨며, 클릭하면 새 탭에서 원본 크기로 열람한다.
 * Storage는 새 버킷을 또 만들지 않고 무드보드와 같은 "order-moodboards" 버킷을
 * "<user>/<order>/result/" 경로로 구분해서 같이 쓴다(버킷 단위 소유자 정책이라 공유 가능).
 */
export function OrderResultPhotosSection({ orderId }: { orderId: string }) {
  const queryClient = useQueryClient();
  const photos = useQuery(orderResultPhotosQuery(orderId));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["order_result_photos", orderId] });

  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      const userId = await currentUserId();
      const maxSort = (photos.data ?? []).reduce((acc, p) => Math.max(acc, p.sort_order), -1);
      let nextSort = maxSort + 1;
      for (const file of files) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${userId}/${orderId}/result/${Date.now()}-${nextSort}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("order-moodboards")
          .upload(
            path,
            file,
            file.type ? { upsert: true, contentType: file.type } : { upsert: true },
          );
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("order-moodboards").getPublicUrl(path);
        const { error } = await supabase
          .from("order_result_photos")
          .insert({ order_id: orderId, image_url: data.publicUrl, sort_order: nextSort });
        if (error) throw error;
        nextSort += 1;
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_result_photos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <SectionCard
      title="RESULT PHOTOS"
      action={
        <button
          type="button"
          className={buttonClass}
          disabled={upload.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={13} className="mr-1 inline" aria-hidden />
          {upload.isPending ? "UPLOADING…" : "+ ADD PHOTO"}
        </button>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) upload.mutate(files);
          e.target.value = "";
        }}
      />
      {upload.isError && (
        <p className="mb-2 font-mono text-xs uppercase text-destructive">
          {(upload.error as Error).message}
        </p>
      )}
      {(photos.data ?? []).length === 0 ? (
        <p className="font-mono text-xs uppercase text-muted-foreground">
          No result photos yet — upload with + ADD PHOTO.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {(photos.data ?? []).map((p) => (
            <div
              key={p.id}
              className="group relative aspect-square overflow-hidden border border-border bg-secondary/30"
            >
              <a href={p.image_url} target="_blank" rel="noreferrer">
                <img src={p.image_url} alt="" className="h-full w-full object-cover" />
              </a>
              <button
                type="button"
                title="Delete"
                onClick={() => remove.mutate(p.id)}
                className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground group-hover:flex"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
