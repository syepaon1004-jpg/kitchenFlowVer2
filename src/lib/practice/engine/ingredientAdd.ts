import type {
  PracticeEngineInstance,
  PracticeEngineState,
  PlaceResult,
} from './types';
import {
  findInstance,
  findProgress,
  getCurrentRequiredLocation,
  getLocationPathTerminalId,
  hasNonDecoBaseAt,
} from './types';
import { computeOpenNumber } from './openStep';
import { runAdvance } from './phaseAdvance';

export function tryPlaceIngredient(
  ingredientId: string,
  targetLocationId: string,
  state: PracticeEngineState,
): PlaceResult {
  const openNumber = computeOpenNumber(targetLocationId, state);
  if (openNumber === null) {
    return { allowed: false, reason: 'no-open-number' };
  }

  const ingAtStep = state.bundle.ingredient_nodes.filter(
    (ing) => ing.node.step_no === openNumber,
  );

  const idMatches = ingAtStep.filter(
    (ing) => ing.ingredient.ingredient_id === ingredientId,
  );
  if (idMatches.length === 0) {
    return { allowed: false, reason: 'no-candidate-node' };
  }

  const unsatisfied = idMatches.filter(
    (ing) => findProgress(ing.node.id, state)?.is_satisfied !== true,
  );
  if (unsatisfied.length === 0) {
    return { allowed: false, reason: 'duplicate-phase-entry' };
  }

  const bindable = unsatisfied.filter((ing) => {
    const required = getCurrentRequiredLocation(ing.node.id, state);
    if (required !== targetLocationId) return false;
    const inst = findInstance(ing.node.id, state);
    return !(inst && inst.is_satisfied);
  });

  if (bindable.length === 0) {
    return { allowed: false, reason: 'location-mismatch' };
  }

  const bundleOrder = state.bundle.ingredient_nodes;
  bindable.sort((a, b) => {
    if (a.node.step_no !== b.node.step_no) {
      return a.node.step_no - b.node.step_no;
    }
    return bundleOrder.indexOf(a) - bundleOrder.indexOf(b);
  });
  const bound = bindable[0];

  if (bound.ingredient.is_deco) {
    const terminal = getLocationPathTerminalId(bound.node.id, state);
    if (
      terminal === targetLocationId &&
      !hasNonDecoBaseAt(targetLocationId, state)
    ) {
      return { allowed: false, reason: 'deco-requires-base' };
    }
  }

  const existingIdx = state.ingredient_instances.findIndex(
    (i) => i.node_id === bound.node.id,
  );
  let newInstances: PracticeEngineInstance[];
  if (existingIdx >= 0) {
    newInstances = state.ingredient_instances.map((inst, idx) => {
      if (idx !== existingIdx) return inst;
      return {
        ...inst,
        actual_location_id: targetLocationId,
        is_satisfied: true,
      };
    });
  } else {
    newInstances = [
      ...state.ingredient_instances,
      {
        node_id: bound.node.id,
        actual_location_id: targetLocationId,
        current_required_location_id: targetLocationId,
        is_satisfied: true,
      },
    ];
  }

  const placedState: PracticeEngineState = {
    ...state,
    ingredient_instances: newInstances,
  };
  const advancedState = runAdvance(targetLocationId, placedState);

  return {
    allowed: true,
    boundNodeId: bound.node.id,
    newState: advancedState,
  };
}

// Adapter / legalActions 공용 helper — try*와 동일 규칙으로 "이 (ingredientId, target) place에
// 최종 bind될 node"를 식별한다. null이면 legal하지 않음.
export function resolvePlaceBinding(
  ingredientId: string,
  targetLocationId: string,
  state: PracticeEngineState,
): { nodeId: string; stepNo: number } | null {
  const openNumber = computeOpenNumber(targetLocationId, state);
  if (openNumber === null) return null;

  const ingAtStep = state.bundle.ingredient_nodes.filter(
    (ing) => ing.node.step_no === openNumber,
  );
  const idMatches = ingAtStep.filter(
    (ing) => ing.ingredient.ingredient_id === ingredientId,
  );
  if (idMatches.length === 0) return null;

  const unsatisfied = idMatches.filter(
    (ing) => findProgress(ing.node.id, state)?.is_satisfied !== true,
  );
  if (unsatisfied.length === 0) return null;

  const bindable = unsatisfied.filter((ing) => {
    const required = getCurrentRequiredLocation(ing.node.id, state);
    if (required !== targetLocationId) return false;
    const inst = findInstance(ing.node.id, state);
    return !(inst && inst.is_satisfied);
  });
  if (bindable.length === 0) return null;

  const bundleOrder = state.bundle.ingredient_nodes;
  bindable.sort((a, b) => {
    if (a.node.step_no !== b.node.step_no) {
      return a.node.step_no - b.node.step_no;
    }
    return bundleOrder.indexOf(a) - bundleOrder.indexOf(b);
  });
  const bound = bindable[0];

  if (bound.ingredient.is_deco) {
    const terminal = getLocationPathTerminalId(bound.node.id, state);
    if (
      terminal === targetLocationId &&
      !hasNonDecoBaseAt(targetLocationId, state)
    ) {
      return null;
    }
  }

  return { nodeId: bound.node.id, stepNo: bound.node.step_no };
}
