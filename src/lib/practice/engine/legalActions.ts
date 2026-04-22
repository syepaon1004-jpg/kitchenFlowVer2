import type { LegalAction, PracticeEngineState } from './types';
import {
  findInstance,
  findProgress,
  getLocationPathTerminalId,
  hasNonDecoBaseAt,
} from './types';
import { computeOpenNumber } from './openStep';
import { tryPour } from './pourDryRun';

export function computeLegalActions(
  state: PracticeEngineState,
): LegalAction[] {
  const out: LegalAction[] = [];
  const placeSeen = new Set<string>();
  const actionSeen = new Set<string>();

  for (const loc of state.bundle.locations) {
    const locId = loc.id;
    const openNumber = computeOpenNumber(locId, state);
    if (openNumber === null) continue;

    for (const ing of state.bundle.ingredient_nodes) {
      if (ing.node.step_no !== openNumber) continue;
      if (findProgress(ing.node.id, state)?.is_satisfied === true) continue;
      const inst = findInstance(ing.node.id, state);
      const required = inst
        ? inst.current_required_location_id
        : ing.location_path[0]?.location_id;
      if (required !== locId) continue;
      if (inst && inst.is_satisfied) continue;
      if (ing.ingredient.is_deco) {
        const terminal = getLocationPathTerminalId(ing.node.id, state);
        if (terminal === locId && !hasNonDecoBaseAt(locId, state)) continue;
      }
      const key = `${ing.ingredient.ingredient_id}|${locId}`;
      if (placeSeen.has(key)) continue;
      placeSeen.add(key);
      out.push({
        type: 'place',
        ingredientId: ing.ingredient.ingredient_id,
        targetLocationId: locId,
      });
    }

    for (const act of state.bundle.action_nodes) {
      if (act.node.step_no !== openNumber) continue;
      if (act.action.location_id !== locId) continue;
      if (findProgress(act.node.id, state)?.is_satisfied === true) continue;
      const key = `${act.action.action_type}|${locId}`;
      if (actionSeen.has(key)) continue;
      actionSeen.add(key);
      out.push({
        type: 'action',
        actionType: act.action.action_type,
        locationId: locId,
      });
    }
  }

  // Pour enumeration: iterate (source, target) pairs over sources with any instance
  // (satisfied or unsatisfied) so §14.4 empty-payload pour surfaces consistently with tryPour.
  const sources = new Set<string>();
  for (const inst of state.ingredient_instances) {
    sources.add(inst.actual_location_id);
  }
  const pourSeen = new Set<string>();
  for (const src of sources) {
    for (const loc of state.bundle.locations) {
      if (loc.id === src) continue;
      const key = `${src}->${loc.id}`;
      if (pourSeen.has(key)) continue;
      pourSeen.add(key);
      const result = tryPour(src, loc.id, state);
      if (!result.allowed) continue;
      out.push({
        type: 'pour',
        sourceLocationId: src,
        targetLocationId: loc.id,
      });
    }
  }

  return out;
}
