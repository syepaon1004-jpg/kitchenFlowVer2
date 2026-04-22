import type {
  PracticeMenuBundle,
  PracticeActionType,
} from '../../../types/practice';

export interface PracticeEngineInstance {
  node_id: string;
  actual_location_id: string;
  current_required_location_id: string;
  is_satisfied: boolean;
}

export interface PracticeEngineProgress {
  node_id: string;
  is_satisfied: boolean;
  satisfied_at: string | null;
}

export interface PracticeEngineState {
  bundle: PracticeMenuBundle;
  ingredient_instances: PracticeEngineInstance[];
  node_progress: PracticeEngineProgress[];
}

export type PlaceBlockReason =
  | 'no-open-number'
  | 'no-candidate-node'
  | 'duplicate-phase-entry'
  | 'location-mismatch'
  | 'deco-requires-base';
export type ActionBlockReason = 'no-open-number' | 'no-candidate-action';
export type PourBlockReason =
  | 'source-not-clean'
  | 'pour-step-not-open'
  | 'pour-no-movable-instances'
  | 'pour-deco-requires-base'
  | 'dry-run-blocked';

export interface PlaceSuccess {
  allowed: true;
  boundNodeId: string;
  newState: PracticeEngineState;
}
export interface PlaceBlocked {
  allowed: false;
  reason: PlaceBlockReason;
}
export type PlaceResult = PlaceSuccess | PlaceBlocked;

export interface ActionSuccess {
  allowed: true;
  executedNodeId: string;
  newState: PracticeEngineState;
}
export interface ActionBlocked {
  allowed: false;
  reason: ActionBlockReason;
}
export type ActionResult = ActionSuccess | ActionBlocked;

export interface PourSuccess {
  allowed: true;
  committedNodeIds: string[];
  newState: PracticeEngineState;
}
export interface PourBlocked {
  allowed: false;
  reason: PourBlockReason;
}
export type PourResult = PourSuccess | PourBlocked;

export type LegalAction =
  | { type: 'place'; ingredientId: string; targetLocationId: string }
  | { type: 'action'; actionType: PracticeActionType; locationId: string }
  | { type: 'pour'; sourceLocationId: string; targetLocationId: string };

export function bootstrapEngineState(
  bundle: PracticeMenuBundle,
): PracticeEngineState {
  const node_progress: PracticeEngineProgress[] = [];
  for (const ing of bundle.ingredient_nodes) {
    node_progress.push({
      node_id: ing.node.id,
      is_satisfied: false,
      satisfied_at: null,
    });
  }
  for (const act of bundle.action_nodes) {
    node_progress.push({
      node_id: act.node.id,
      is_satisfied: false,
      satisfied_at: null,
    });
  }
  return {
    bundle,
    ingredient_instances: [],
    node_progress,
  };
}

export function findInstance(
  nodeId: string,
  state: PracticeEngineState,
): PracticeEngineInstance | undefined {
  return state.ingredient_instances.find((inst) => inst.node_id === nodeId);
}

export function findProgress(
  nodeId: string,
  state: PracticeEngineState,
): PracticeEngineProgress | undefined {
  return state.node_progress.find((p) => p.node_id === nodeId);
}

export function isNodeProgressDone(
  nodeId: string,
  state: PracticeEngineState,
): boolean {
  return findProgress(nodeId, state)?.is_satisfied === true;
}

export function getCurrentRequiredLocation(
  nodeId: string,
  state: PracticeEngineState,
): string | null {
  const inst = findInstance(nodeId, state);
  if (inst) return inst.current_required_location_id;
  const ing = state.bundle.ingredient_nodes.find((n) => n.node.id === nodeId);
  if (!ing) return null;
  const first = ing.location_path[0];
  return first ? first.location_id : null;
}

// deco-first rule helper: base instance가 대상 location에 물리적으로 존재하는지.
// actual_location_id만 본다 — is_satisfied는 필터하지 않음 (base가 placed 후 advance로 상태가
// 변해도 물리적 자리에 계속 남아있다고 본다).
export function hasNonDecoBaseAt(
  locationId: string,
  state: PracticeEngineState,
): boolean {
  for (const inst of state.ingredient_instances) {
    if (inst.actual_location_id !== locationId) continue;
    const ing = state.bundle.ingredient_nodes.find(
      (n) => n.node.id === inst.node_id,
    );
    if (ing && !ing.ingredient.is_deco) return true;
  }
  return false;
}

// ingredient node의 location_path 마지막 원소 — deco terminal 판정용.
export function getLocationPathTerminalId(
  nodeId: string,
  state: PracticeEngineState,
): string | null {
  const ing = state.bundle.ingredient_nodes.find((n) => n.node.id === nodeId);
  if (!ing) return null;
  const last = ing.location_path[ing.location_path.length - 1];
  return last ? last.location_id : null;
}
