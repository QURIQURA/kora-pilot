import { useCallback, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { cropImageToBlob } from "@/lib/imageCrop";
import { buttonClass, primaryButtonClass } from "@/components/pilot/ui";

/**
 * 이미지 업로드 시 1:1 정사각형으로 크롭/줌 조정하는 모달(2026-09-22).
 * 드래그로 위치 이동, 슬라이더로 확대/축소 후 "적용"하면 잘라낸 JPEG Blob을 반환한다.
 */
export function ImageCropModal({
  imageSrc,
  label,
  onCancel,
  onApply,
}: {
  imageSrc: string;
  label: string;
  onCancel: () => void;
  onApply: (blob: Blob) => void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setArea(croppedAreaPixels);
  }, []);

  const handleApply = async () => {
    if (!area) return;
    setApplying(true);
    try {
      const blob = await cropImageToBlob(imageSrc, area);
      onApply(blob);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-foreground/80 p-4">
      <div className="flex items-center justify-between pb-3">
        <h2 className="label-caps text-background">{label} — 1:1 크롭</h2>
        <span className="font-mono text-xs uppercase text-background/70">
          드래그: 위치 이동 · 슬라이더: 확대/축소
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden bg-black">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="rect"
          showGrid
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
        />
      </div>
      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex flex-1 items-center gap-3">
          <span className="label-caps whitespace-nowrap text-xs text-background/70">ZOOM</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className={`${buttonClass} bg-background`}
            onClick={onCancel}
            disabled={applying}
          >
            취소
          </button>
          <button
            type="button"
            className={primaryButtonClass}
            onClick={handleApply}
            disabled={applying || !area}
          >
            {applying ? "적용 중…" : "적용"}
          </button>
        </div>
      </div>
    </div>
  );
}
