import type {
  PracticeEngineInstance,
  PracticeEngineProgress,
  PracticeEngineState,
} from './types';
import { findInstance, findProgress } from './types';

export function advanceLocation(
  locationId: string,
  state: PracticeEngineState,
): PracticeEngineState {
  const ingsAtL = state.bundle.ingredient_nodes.filter((ing) => {
    if (findProgress(ing.node.id, state)?.is_satisfied === true) return false;
    const inst = findInstance(ing.node.id, state);
    const required = inst
      ? inst.current_required_location_id
      : ing.location_path[0]?.location_id;
    return required === locationId;
  });

  const actsAtL = state.bundle.action_nodes.filter((act) => {
    if (findProgress(act.node.id, state)?.is_satisfied === true) return false;
    return act.action.location_id === locationId;
  });

  if (ingsAtL.length === 0 && actsAtL.length === 0) return state;

  const steps: number[] = [];
  for (const ing of ingsAtL) steps.push(ing.node.step_no);
  for (const act of actsAtL) steps.push(act.node.step_no);
  const minStep = Math.min(...steps);

  const groupIngs = ingsAtL.filter((ing) => ing.node.step_no === minStep);
  const groupActs = actsAtL.filter((act) => act.node.step_no === minStep);

  if (groupActs.length > 0) return state;

  const allIngSatisfied = groupIngs.every((ing) => {
    const inst = findInstance(ing.node.id, state);
    return inst?.is_satisfied === true;
  });
  if (!allIngSatisfied) return state;

  const nowIso = new Date().toISOString();
  const groupIngIds = new Set(groupIngs.map((g) => g.node.id));

  const newInstances: PracticeEngineInstance[] = state.ingredient_instances.map(
    (inst) => {
      if (!groupIngIds.has(inst.node_id)) return inst;
      const ing = groupIngs.find((g) => g.node.id === inst.node_id);
      if (!ing) return inst;
      const curSeq = ing.location_path.findIndex(
        (p) => p.location_id === inst.current_required_location_id,
      );
      const nextPath =
        curSeq >= 0 ? ing.location_path[curSeq + 1] : undefined;
      if (!nextPath) return inst;
      return {
        ...inst,
        current_required_location_id: nextPath.location_id,
        is_satisfied: false,
      };
    },
  );

  const newProgress: PracticeEngineProgress[] = state.node_progress.map((p) => {
    if (!groupIngIds.has(p.node_id)) return p;
    const ing = groupIngs.find((g) => g.node.id === p.node_id);
    if (!ing) return p;
    const inst = state.ingredient_instances.find((i) => i.node_id === p.node_id);
    if (!inst) return p;
    const curSeq = ing.location_path.findIndex(
      (pp) => pp.location_id === inst.current_required_location_id,
    );
    const nextPath =
      curSeq >= 0 ? ing.location_path[curSeq + 1] : undefined;
    if (!nextPath) {
      return { ...p, is_satisfied: true, satisfied_at: nowIso };
    }
    return p;
  });

  return {
    ...state,
    ingredient_instances: newInstances,
    node_progress: newProgress,
  };
}

export const runAdvance = advanceLocation;
