import type { GameIngredientInstance, RecipeIngredient, Recipe } from '../../types/db';
import type { RecipeEvaluationResult, RecipeError } from '../../types/game';

export function evaluateContainer(
  inContainer: GameIngredientInstance[],
  recipeIngredients: RecipeIngredient[],
  recipe: Recipe,
  containerTypeId: string,
): RecipeEvaluationResult {
  const errors: RecipeError[] = [];

  // 1. 그릇 타입 검사 (즉시)
  if (containerTypeId !== recipe.target_container_id) {
    errors.push({
      type: 'wrong_container',
      details: { got: containerTypeId, expected: recipe.target_container_id },
    });
    return { isComplete: false, errors, checkedUpToPlateOrder: 0 };
  }

  if (recipeIngredients.length === 0) {
    return { isComplete: false, errors: [], checkedUpToPlateOrder: 0 };
  }

  // currentMaxPlateOrder: 그릇 안 재료 중 가장 높은 plate_order
  const currentMaxPlateOrder =
    inContainer.length > 0
      ? Math.max(...inContainer.map((i) => i.plate_order ?? 0))
      : 0;

  // 레시피의 최대 plate_order
  const maxRecipePlateOrder = Math.max(...recipeIngredients.map((r) => r.plate_order));

  // 2. unexpected_ingredient 검사 (즉시 — 레시피에 없는 재료)
  for (const inst of inContainer) {
    const inRecipe = recipeIngredients.some((r) => r.ingredient_id === inst.ingredient_id);
    if (!inRecipe) {
      errors.push({
        type: 'unexpected_ingredient',
        ingredient_id: inst.ingredient_id,
        details: {},
      });
    }
  }

  // 3. plate_order_mismatch 검사 (즉시 — 레시피에 있지만 할당된 plate_order가 불일치)
  for (const inst of inContainer) {
    const ri = recipeIngredients.find((r) => r.ingredient_id === inst.ingredient_id);
    if (ri && inst.plate_order !== ri.plate_order) {
      errors.push({
        type: 'plate_order_mismatch',
        ingredient_id: inst.ingredient_id,
        details: { got: inst.plate_order, expected: ri.plate_order },
      });
    }
  }

  // checkedUpToPlateOrder 결정:
  // plate_order N+1 재료가 있으면 N까지 확정 검증
  // 같은 plate_order 그룹 내 누락은 아직 확정하지 않음 (N+1 진입 시 N 확정)
  // 단, 레시피 최대 plate_order에 도달했으면 해당 단계까지 확정
  const confirmedPlateOrder =
    currentMaxPlateOrder >= maxRecipePlateOrder
      ? maxRecipePlateOrder
      : currentMaxPlateOrder - 1;

  // confirmedPlateOrder까지의 레시피 재료만 검증
  const expectedByNow = recipeIngredients.filter(
    (r) => r.plate_order <= confirmedPlateOrder,
  );

  for (const ri of expectedByNow) {
    const found = inContainer.find((inst) => inst.ingredient_id === ri.ingredient_id);

    // 4. missing_ingredient 검사 (confirmedPlateOrder까지만)
    if (!found) {
      errors.push({
        type: 'missing_ingredient',
        ingredient_id: ri.ingredient_id,
        details: { plate_order: ri.plate_order },
      });
      continue;
    }

    // 5. quantity 검사
    const qtyMin = ri.quantity * (1 - ri.quantity_tolerance);
    const qtyMax = ri.quantity * (1 + ri.quantity_tolerance);
    if (found.quantity < qtyMin || found.quantity > qtyMax) {
      errors.push({
        type: 'quantity_error',
        ingredient_id: ri.ingredient_id,
        details: { got: found.quantity, min: qtyMin, max: qtyMax },
      });
    }

    // 6. action 검사
    if (ri.required_action_type) {
      const action = found.action_history.find(
        (a) => a.actionType === ri.required_action_type,
      );
      if (!action) {
        errors.push({
          type: 'action_insufficient',
          ingredient_id: ri.ingredient_id,
          details: { required: ri.required_action_type },
        });
      } else {
        if (ri.required_duration_min != null && action.seconds < ri.required_duration_min) {
          errors.push({
            type: 'action_insufficient',
            ingredient_id: ri.ingredient_id,
            details: { seconds: action.seconds, min: ri.required_duration_min },
          });
        }
        if (ri.required_duration_max != null && action.seconds > ri.required_duration_max) {
          errors.push({
            type: 'action_excessive',
            ingredient_id: ri.ingredient_id,
            details: { seconds: action.seconds, max: ri.required_duration_max },
          });
        }
      }
    }
  }

  // 7. 전체 완성 판정
  // 모든 recipeIngredients가 매칭되고 오류가 0개여야 isComplete
  const allIngredientsPresent = recipeIngredients.every((ri) =>
    inContainer.some((inst) => inst.ingredient_id === ri.ingredient_id),
  );
  const isComplete =
    confirmedPlateOrder >= maxRecipePlateOrder &&
    errors.length === 0 &&
    allIngredientsPresent;

  return { isComplete, errors, checkedUpToPlateOrder: confirmedPlateOrder };
}
