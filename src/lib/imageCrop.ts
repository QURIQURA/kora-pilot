/**
 * react-easy-crop가 돌려주는 픽셀 단위 크롭 영역(area)을 실제로 캔버스에 그려
 * 정사각형 JPEG Blob으로 잘라내는 유틸.
 * ProductImagesSection의 크롭 모달에서 "적용" 시 사용한다(2026-09-22).
 */
export interface CropPixelArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", (e) => reject(e));
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

/** 출력 크기(px) — 저장 용량을 위해 과도하게 큰 원본을 이 한도로 축소한다. */
const OUTPUT_SIZE = 1200;

export async function cropImageToBlob(
  imageSrc: string,
  area: CropPixelArea,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context를 만들 수 없습니다.");

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("이미지를 자르는 데 실패했습니다."));
      },
      "image/jpeg",
      0.9,
    );
  });
}
