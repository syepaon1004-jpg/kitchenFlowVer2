import type { PracticeEngineState } from './types';
import {
  findInstance,
  findProgress,
  getCurrentRequiredLocation,
} from './types';

export function computeOpenNumber(
  locationId: string,
  state: PracticeEngineState,
): number | null {
  let min: number | null = null;

  for (const ing of state.bundle.ingredient_nodes) {
    if (findProgress(ing.node.id, state)?.is_satisfied === true) continue;
    const required = getCurrentRequiredLocation(ing.node.id, state);
    if (required !== locationId) continue;
    const inst = findInstance(ing.node.id, state);
    if (inst && inst.is_satisfied) continue;
    if (min === null || ing.node.step_no < min) min = ing.node.step_no;
  }

  for (const act of state.bundle.action_nodes) {
    if (findProgress(act.node.id, state)?.is_satisfied === true) continue;
    if (act.action.location_id !== locationId) continue;
    if (min === null || act.node.step_no < min) min = act.node.step_no;
  }

  return min;
}
