import type {
  PracticeActionType,
} from '../../../types/practice';
import type {
  ActionResult,
  PracticeEngineProgress,
  PracticeEngineState,
} from './types';
import { findProgress } from './types';
import { computeOpenNumber } from './openStep';
import { runAdvance } from './phaseAdvance';

export function tryExecuteAction(
  actionType: PracticeActionType,
  locationId: string,
  state: PracticeEngineState,
): ActionResult {
  const openNumber = computeOpenNumber(locationId, state);
  if (openNumber === null) {
    return { allowed: false, reason: 'no-open-number' };
  }

  const match = state.bundle.action_nodes.find((act) => {
    if (act.node.step_no !== openNumber) return false;
    if (act.action.action_type !== actionType) return false;
    if (act.action.location_id !== locationId) return false;
    return findProgress(act.node.id, state)?.is_satisfied !== true;
  });

  if (!match) {
    return { allowed: false, reason: 'no-candidate-action' };
  }

  const nowIso = new Date().toISOString();
  const newProgress: PracticeEngineProgress[] = state.node_progress.map((p) => {
    if (p.node_id !== match.node.id) return p;
    return { ...p, is_satisfied: true, satisfied_at: nowIso };
  });

  const executedState: PracticeEngineState = {
    ...state,
    node_progress: newProgress,
  };
  const advancedState = runAdvance(locationId, executedState);

  return {
    allowed: true,
    executedNodeId: match.node.id,
    newState: advancedState,
  };
}
