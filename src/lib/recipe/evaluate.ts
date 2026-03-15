import type { GameIngredientInstance, RecipeIngredient, Recipe } from '../../types/db';
import type { RecipeEvaluationResult, RecipeError } from '../../types/game';

export function evaluateContainer(
  inContainer: GameIngredientInstance[],
  recipeIngredients: RecipeIngredient[],
  recipe: Recipe,
  containerTypeId: string,
): RecipeEvaluationResult {
  const errors: RecipeError[] = [];

  // 1. 이 container에 해당하는 recipe_ingredients만 필터
  const filtered = recipeIngredients.filter((ri) => {
    if (ri.target_container_id != null) {
      return ri.target_container_id === containerTypeId;
    }
    // ri.target_container_id === null → fallback
    return (
      recipe.target_container_id === containerTypeId ||
      recipe.target_container_id === null
    );
  });

  if (filtered.length === 0) {
    errors.push({
      type: 'wrong_container',
      details: { got: containerTypeId, expected: recipe.target_container_id },
    });
    return { isComplete: false, errors, checkedUpToPlateOrder: 0 };
  }

  // 비데코 재료만 분리
  const nonDeco = filtered.filter((r) => !r.is_deco);

  // currentMaxPlateOrder: 그릇 안 비데코 재료 중 가장 높은 plate_order
  const currentMaxPlateOrder =
    inContainer.length > 0
      ? Math.max(
          0,
          ...inContainer
            .filter((i) => {
              const ri = filtered.find((r) => r.ingredient_id === i.ingredient_id);
              return !ri?.is_deco;
            })
            .map((i) => i.plate_order ?? 0),
        )
      : 0;

  // 레시피의 최대 plate_order (비데코만)
  const maxRecipePlateOrder =
    nonDeco.length > 0
      ? Math.max(...nonDeco.map((r) => r.plate_order))
      : 0;

  // 2. unexpected_ingredient 검사 (즉시 — 레시피에 없는 재료)
  for (const inst of inContainer) {
    const inRecipe = filtered.some((r) => r.ingredient_id === inst.ingredient_id);
    if (!inRecipe) {
      errors.push({
        type: 'unexpected_ingredient',
        ingredient_id: inst.ingredient_id,
        details: {},
      });
    }
  }

  // 3. plate_order_mismatch 검사 (즉시 — 데코 재료는 면제)
  for (const inst of inContainer) {
    const ri = filtered.find((r) => r.ingredient_id === inst.ingredient_id);
    if (ri && !ri.is_deco && inst.plate_order !== ri.plate_order) {
      errors.push({
        type: 'plate_order_mismatch',
        ingredient_id: inst.ingredient_id,
        details: { got: inst.plate_order, expected: ri.plate_order },
      });
    }
  }

  // checkedUpToPlateOrder 결정 (비데코 기준):
  // plate_order N+1 재료가 있으면 N까지 확정 검증
  // 같은 plate_order 그룹 내 누락은 아직 확정하지 않음 (N+1 진입 시 N 확정)
  // 단, 레시피 최대 plate_order에 도달했으면 해당 단계까지 확정
  const confirmedPlateOrder =
    currentMaxPlateOrder >= maxRecipePlateOrder
      ? maxRecipePlateOrder
      : currentMaxPlateOrder - 1;

  // confirmedPlateOrder까지의 레시피 재료만 검증
  // 비데코: plate_order <= confirmedPlateOrder
  // 데코: 비데코가 전부 확정된 후(confirmedPlateOrder >= maxRecipePlateOrder)에만 포함
  const expectedByNow = filtered.filter((r) => {
    if (r.is_deco) return confirmedPlateOrder >= maxRecipePlateOrder;
    return r.plate_order <= confirmedPlateOrder;
  });

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

    // 5. quantity 검사 (부동소수점 안전장치: Math.abs < 0.001)
    if (Math.abs(found.quantity - ri.quantity) >= 0.001) {
      errors.push({
        type: 'quantity_error',
        ingredient_id: ri.ingredient_id,
        details: { got: found.quantity, expected: ri.quantity },
      });
    }

    // 6. action 검사 (다중 액션)
    if (ri.required_actions && ri.required_actions.length > 0) {
      for (const req of ri.required_actions) {
        const action = found.action_history.find(
          (a) => a.actionType === req.action_type,
        );
        if (!action) {
          errors.push({
            type: 'action_insufficient',
            ingredient_id: ri.ingredient_id,
            details: { action_type: req.action_type, required: req.action_type },
          });
        } else {
          if (req.duration_min != null && action.seconds < req.duration_min) {
            errors.push({
              type: 'action_insufficient',
              ingredient_id: ri.ingredient_id,
              details: { action_type: req.action_type, seconds: action.seconds, min: req.duration_min },
            });
          }
          if (req.duration_max != null && action.seconds > req.duration_max) {
            errors.push({
              type: 'action_excessive',
              ingredient_id: ri.ingredient_id,
              details: { action_type: req.action_type, seconds: action.seconds, max: req.duration_max },
            });
          }
        }
      }
    }
  }

  // 7. 전체 완성 판정
  // 모든 recipeIngredients(데코 포함)가 매칭되고 오류가 0개여야 isComplete
  const allIngredientsPresent = filtered.every((ri) =>
    inContainer.some((inst) => inst.ingredient_id === ri.ingredient_id),
  );
  const isComplete =
    confirmedPlateOrder >= maxRecipePlateOrder &&
    errors.length === 0 &&
    allIngredientsPresent;

  return { isComplete, errors, checkedUpToPlateOrder: confirmedPlateOrder };
}
