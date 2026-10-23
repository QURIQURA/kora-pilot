/** Exact-ID links only. Neither names nor nominal inch labels identify dimensions. */
export interface SizeGeometry {
  shape: string | null;
  diameter_mm: number | null;
  width_mm: number | null;
  length_mm: number | null;
  height_mm: number | null;
}
export interface SizeLink extends SizeGeometry {
  id: string;
  product_id: string;
  cake_size_id: string | null;
}

export function completeGeometry(size: SizeGeometry): SizeGeometry | null {
  const positive = (n: number | null) => n != null && Number.isFinite(n) && n > 0;
  if (!positive(size.height_mm)) return null;
  if (size.shape === "ROUND" && positive(size.diameter_mm))
    return {
      shape: "ROUND",
      diameter_mm: size.diameter_mm,
      width_mm: null,
      length_mm: null,
      height_mm: size.height_mm,
    };
  if (
    (size.shape === "SQUARE" || size.shape === "RECTANGLE") &&
    positive(size.width_mm) &&
    positive(size.length_mm)
  ) {
    if (size.shape === "SQUARE" && size.width_mm !== size.length_mm) return null;
    return {
      shape: "RECTANGLE",
      diameter_mm: null,
      width_mm: size.width_mm,
      length_mm: size.length_mm,
      height_mm: size.height_mm,
    };
  }
  return null;
}

export function sameGeometry(a: SizeGeometry, b: SizeGeometry): boolean {
  const x = completeGeometry(a),
    y = completeGeometry(b);
  return x != null && y != null && JSON.stringify(x) === JSON.stringify(y);
}

export function sizeLinkIssue(
  productSize: SizeLink,
  cakeSize: (SizeGeometry & { id: string }) | undefined,
): string | null {
  if (!productSize.cake_size_id) return "공용 규격 미연결 — 제품 전용 치수";
  if (!cakeSize || cakeSize.id !== productSize.cake_size_id)
    return "연결된 공용 규격을 찾을 수 없습니다.";
  if (!completeGeometry(cakeSize))
    return "공용 규격의 실제 치수가 비어 있거나 형태와 맞지 않습니다.";
  return sameGeometry(productSize, cakeSize)
    ? null
    : "제품 치수와 연결된 공용 규격의 치수가 다릅니다.";
}

export function selectionIssue(
  productId: string | null,
  productSizeId: string | null,
  cakeSizeId: string | null,
  productSize: SizeLink | undefined,
  cakeSize: (SizeGeometry & { id: string }) | undefined,
): string | null {
  if (!productSizeId) return null; // Preserve legacy orders; never infer a product mapping.
  if (!productSize || productSize.id !== productSizeId || productSize.product_id !== productId)
    return "선택한 사이즈가 이 제품에 속하지 않습니다.";
  if (!completeGeometry(productSize)) return "제품 사이즈의 실제 치수를 확인하세요.";
  if (productSize.cake_size_id !== cakeSizeId)
    return "제품 사이즈와 공용 규격 연결이 다릅니다. 제품 사이즈를 다시 선택하세요.";
  return productSize.cake_size_id ? sizeLinkIssue(productSize, cakeSize) : null;
}
