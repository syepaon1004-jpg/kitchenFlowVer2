import type { GameIngredientInstance, RecipeIngredient, Recipe } from '../../types/db';

export interface EvalResult {
  isComplete: boolean;
  score: number;
  unmatchedReasons?: string[];
}

export function evaluateContainer(
  inContainer: GameIngredientInstance[],
  recipeIngredients: RecipeIngredient[],
  recipe: Recipe,
  containerTypeId: string,
): EvalResult {
  if (recipeIngredients.length === 0) {
    return { isComplete: false, score: 0, unmatchedReasons: ['No recipe ingredients defined'] };
  }

  const unmatchedReasons: string[] = [];

  // e. 그릇 타입 검사 (불일치 시 즉시 리턴)
  const containerPassed = containerTypeId === recipe.target_container_id;
  if (!containerPassed) {
    unmatchedReasons.push(
      `Container type mismatch: got ${containerTypeId}, expected ${recipe.target_container_id}`,
    );
    return { isComplete: false, score: 0, unmatchedReasons };
  }

  let matchedCount = 0;

  for (const ri of recipeIngredients) {
    // a. ingredient_id 일치
    const found = inContainer.find((inst) => inst.ingredient_id === ri.ingredient_id);
    if (!found) {
      unmatchedReasons.push(`Missing ingredient: ${ri.ingredient_id}`);
      continue;
    }

    let thisMatched = true;

    // b. quantity ± quantity_tolerance
    const qtyMin = ri.quantity * (1 - ri.quantity_tolerance);
    const qtyMax = ri.quantity * (1 + ri.quantity_tolerance);
    const qtyPassed = found.quantity >= qtyMin && found.quantity <= qtyMax;
    if (!qtyPassed) {
      unmatchedReasons.push(
        `Ingredient ${ri.ingredient_id} qty ${found.quantity} not in [${qtyMin}, ${qtyMax}]`,
      );
      thisMatched = false;
    }

    // c. required_action_type 검사
    if (ri.required_action_type) {
      const action = found.action_history.find((a) => a.actionType === ri.required_action_type);
      if (!action) {
        unmatchedReasons.push(
          `Ingredient ${ri.ingredient_id} missing action: ${ri.required_action_type}`,
        );
        thisMatched = false;
      } else {
        if (ri.required_duration_min != null && action.seconds < ri.required_duration_min) {
          unmatchedReasons.push(
            `Ingredient ${ri.ingredient_id} action ${ri.required_action_type}: ${action.seconds}s < min ${ri.required_duration_min}s`,
          );
          thisMatched = false;
        }
        if (ri.required_duration_max != null && action.seconds > ri.required_duration_max) {
          unmatchedReasons.push(
            `Ingredient ${ri.ingredient_id} action ${ri.required_action_type}: ${action.seconds}s > max ${ri.required_duration_max}s`,
          );
          thisMatched = false;
        }
      }
    }

    // d. plate_order 일치
    const platePassed = found.plate_order === ri.plate_order;
    if (!platePassed) {
      unmatchedReasons.push(
        `Ingredient ${ri.ingredient_id} plate_order: got ${found.plate_order}, expected ${ri.plate_order}`,
      );
      thisMatched = false;
    }

    if (thisMatched) matchedCount++;
  }

  const score = matchedCount / recipeIngredients.length;
  return {
    isComplete: score === 1,
    score,
    unmatchedReasons: unmatchedReasons.length > 0 ? unmatchedReasons : undefined,
  };
}
