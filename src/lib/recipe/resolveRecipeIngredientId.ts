import type { GameIngredientInstance, RecipeIngredient, Recipe } from '../../types/db';

export interface ResolveArgs {
  ingredientId: string;
  containerTypeId: string;
  recipe: Recipe;
  recipeIngredients: RecipeIngredient[];
  /** 이번 투입 직전 container 안에 있는 인스턴스들 */
  inContainer: GameIngredientInstance[];
  /**
   * 같은 액션에서 이미 다른 인스턴스가 특정 ri에 qty를 배정했다면 그 누적.
   * pour처럼 여러 인스턴스가 한 번에 들어오는 경로에서 각 호출 사이 상태를 전달.
   * key = recipe_ingredient.id, value = 누적 qty
   */
  pendingBindings?: Map<string, number>;
}

/**
 * 이번 투입을 어떤 recipe_ingredients row에 귀속시킬지 결정한다.
 *
 * 정책:
 *   1. 대상 container type에 해당하는 ri만 추림(target_container_id 매칭 + recipe 기본값 fallback)
 *   2. 같은 ingredient_id인 ri만 후보
 *   3. (is_deco 오름차순, plate_order 오름차순) 으로 정렬 — 비데코 낮은 단계 먼저 채우고 데코 마지막
 *   4. 순차 순회하며 "이미 그 ri에 귀속된 qty + pending 누적 + 이번 pendingQuantity" 가
 *      ri.quantity 초과하기 전까지는 해당 ri 반환
 *   5. 모든 ri 포화되었거나 후보가 없으면 null (= 레시피 요구 초과, 런타임이 unexpected로 감지)
 */
export function resolveRecipeIngredientId(args: ResolveArgs): string | null {
  const { ingredientId, containerTypeId, recipe, recipeIngredients, inContainer, pendingBindings } = args;

  const containerRis = recipeIngredients.filter((ri) => {
    if (ri.target_container_id != null) return ri.target_container_id === containerTypeId;
    return recipe.target_container_id === containerTypeId || recipe.target_container_id === null;
  });

  const candidates = containerRis
    .filter((ri) => ri.ingredient_id === ingredientId)
    .slice()
    .sort((a, b) => {
      if (a.is_deco !== b.is_deco) return a.is_deco ? 1 : -1;
      return a.plate_order - b.plate_order;
    });

  for (const ri of candidates) {
    const boundQty = inContainer
      .filter((i) => i.recipe_ingredient_id === ri.id)
      .reduce((sum, i) => sum + i.quantity, 0);
    const pendingBound = pendingBindings?.get(ri.id) ?? 0;
    const remaining = ri.quantity - boundQty - pendingBound;
    if (remaining > 0.001) {
      return ri.id;
    }
  }
  return null;
}
