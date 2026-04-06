/**
 * 레시피 요구량 기준으로 투입량 프리셋 버튼 값 3개를 생성한다.
 *
 * 규칙:
 *   qty <= 3  → [1, 2, 3]
 *   qty <= 10 → [qty, qty×2, qty×3]
 *   qty > 10  → [Math.round(qty/2), qty, Math.round(qty*1.5)]
 *
 * fallback (qty가 0이하 또는 NaN): [1, 2, 3]
 */
export function generatePresets(recipeQuantity: number): [number, number, number] {
  if (!recipeQuantity || recipeQuantity <= 0 || Number.isNaN(recipeQuantity)) {
    return [1, 2, 3];
  }
  if (recipeQuantity <= 3) return [1, 2, 3];
  if (recipeQuantity <= 10) {
    return [recipeQuantity, recipeQuantity * 2, recipeQuantity * 3];
  }
  return [
    Math.round(recipeQuantity / 2),
    recipeQuantity,
    Math.round(recipeQuantity * 1.5),
  ];
}
