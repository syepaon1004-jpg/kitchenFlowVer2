import type { PourResult, PracticeEngineState } from './types';
import {
  findInstance,
  findProgress,
  getCurrentRequiredLocation,
  getLocationPathTerminalId,
  hasNonDecoBaseAt,
} from './types';
import { computeOpenNumber } from './openStep';
import { tryPlaceIngredient } from './ingredientAdd';

function sourceHasOpenIngredient(
  sourceLocationId: string,
  state: PracticeEngineState,
): boolean {
  for (const ing of state.bundle.ingredient_nodes) {
    if (findProgress(ing.node.id, state)?.is_satisfied === true) continue;
    const required = getCurrentRequiredLocation(ing.node.id, state);
    if (required !== sourceLocationId) continue;
    const inst = findInstance(ing.node.id, state);
    if (inst && inst.is_satisfied) continue;
    return true;
  }
  return false;
}

export type PourCandidateEntry = {
  nodeId: string;
  ingredientId: string;
  stepNo: number;
};

// try* + legalActions + adapter payload 계산 공용 helper.
// tryPour 내부 dry-run iteration과 adapter의 payload_node_ids 계산이 같은 순서로 움직이게 한다.
export function collectPourCandidateEntries(
  sourceLocationId: string,
  targetLocationId: string,
  state: PracticeEngineState,
): PourCandidateEntry[] {
  const entries: PourCandidateEntry[] = [];
  for (const inst of state.ingredient_instances) {
    if (inst.actual_location_id !== sourceLocationId) continue;
    if (inst.current_required_location_id !== targetLocationId) continue;
    if (inst.is_satisfied) continue;
    const ing = state.bundle.ingredient_nodes.find(
      (n) => n.node.id === inst.node_id,
    );
    if (!ing) continue;
    entries.push({
      nodeId: inst.node_id,
      ingredientId: ing.ingredient.ingredient_id,
      stepNo: ing.node.step_no,
    });
  }
  entries.sort((a, b) => a.stepNo - b.stepNo);
  return entries;
}

// §14.4: source에 physical payload (is_satisfied=true) 인스턴스가 하나 이상 있는지.
// empty-payload pour 허용 여부 판정에 사용.
export function hasPhysicalPayloadAt(
  sourceLocationId: string,
  state: PracticeEngineState,
): boolean {
  for (const inst of state.ingredient_instances) {
    if (inst.actual_location_id !== sourceLocationId) continue;
    if (inst.is_satisfied === true) return true;
  }
  return false;
}

export function tryPour(
  sourceLocationId: string,
  targetLocationId: string,
  state: PracticeEngineState,
): PourResult {
  if (sourceHasOpenIngredient(sourceLocationId, state)) {
    return { allowed: false, reason: 'source-not-clean' };
  }

  if (computeOpenNumber(targetLocationId, state) === null) {
    return { allowed: false, reason: 'pour-step-not-open' };
  }

  const entries = collectPourCandidateEntries(
    sourceLocationId,
    targetLocationId,
    state,
  );

  if (entries.length === 0) {
    // §14.4 empty-payload branch:
    //   source에 physical payload (is_satisfied=true 인스턴스)가 있으면
    //   destination legality 판정 없이 success. state mutation 없음.
    if (hasPhysicalPayloadAt(sourceLocationId, state)) {
      return { allowed: true, committedNodeIds: [], newState: state };
    }
    return { allowed: false, reason: 'pour-no-movable-instances' };
  }

  for (const entry of entries) {
    const ing = state.bundle.ingredient_nodes.find(
      (n) => n.node.id === entry.nodeId,
    );
    if (!ing) continue;
    if (!ing.ingredient.is_deco) continue;
    const terminal = getLocationPathTerminalId(entry.nodeId, state);
    if (terminal !== targetLocationId) continue;
    if (!hasNonDecoBaseAt(targetLocationId, state)) {
      return { allowed: false, reason: 'pour-deco-requires-base' };
    }
  }

  let simState: PracticeEngineState = state;
  const committedNodeIds: string[] = [];
  for (const entry of entries) {
    const result = tryPlaceIngredient(
      entry.ingredientId,
      targetLocationId,
      simState,
    );
    if (!result.allowed) {
      return { allowed: false, reason: 'dry-run-blocked' };
    }
    if (result.boundNodeId !== entry.nodeId) {
      return { allowed: false, reason: 'dry-run-blocked' };
    }
    simState = result.newState;
    committedNodeIds.push(entry.nodeId);
  }

  return { allowed: true, committedNodeIds, newState: simState };
}
