// Practice runtime adapter — DB row ↔ engine state 변환 + derived 사전계산.
// Supabase/React/Zustand import 금지. 순수 함수만.

import type {
  PracticeMenuBundle,
  PracticeIngredientInstance,
  PracticeNodeProgress,
} from '../../types/practice';
import type {
  PracticeEngineState,
  PracticeEngineInstance,
  PracticeEngineProgress,
  LegalAction,
} from './engine';
import { computeLegalActions } from './engine';

// ——— Persistable row types (DB upsert용, id 없음) ———

export interface PersistableInstanceRow {
  session_id: string;
  node_id: string;
  actual_location_id: string;
  current_required_location_id: string;
  is_satisfied: boolean;
}

export interface PersistableProgressRow {
  session_id: string;
  node_id: string;
  is_satisfied: boolean;
  satisfied_at: string | null;
}

// ——— Derived data (store state에 저장, selector 계산 금지) ———

export interface PracticeDerivedData {
  legalActions: readonly LegalAction[];
  totalNodes: number;
  satisfiedNodes: number;
  isComplete: boolean;
}

// ——— Hydration: DB rows → engine state ———

export function hydrateEngineState(
  bundle: PracticeMenuBundle,
  dbInstances: readonly PracticeIngredientInstance[],
  dbProgress: readonly PracticeNodeProgress[],
): PracticeEngineState {
  // Strip id/session_id from DB rows → engine-compatible shapes
  const ingredient_instances: PracticeEngineInstance[] = dbInstances.map((row) => ({
    node_id: row.node_id,
    actual_location_id: row.actual_location_id,
    current_required_location_id: row.current_required_location_id,
    is_satisfied: row.is_satisfied,
  }));

  // Build progress map from DB rows
  const progressByNodeId = new Map<string, PracticeEngineProgress>();
  for (const row of dbProgress) {
    progressByNodeId.set(row.node_id, {
      node_id: row.node_id,
      is_satisfied: row.is_satisfied,
      satisfied_at: row.satisfied_at,
    });
  }

  // Fill missing progress entries for all bundle nodes
  const node_progress: PracticeEngineProgress[] = [];
  for (const ing of bundle.ingredient_nodes) {
    const existing = progressByNodeId.get(ing.node.id);
    node_progress.push(
      existing ?? { node_id: ing.node.id, is_satisfied: false, satisfied_at: null },
    );
  }
  for (const act of bundle.action_nodes) {
    const existing = progressByNodeId.get(act.node.id);
    node_progress.push(
      existing ?? { node_id: act.node.id, is_satisfied: false, satisfied_at: null },
    );
  }

  return { bundle, ingredient_instances, node_progress };
}

// ——— Dehydration: engine state → DB-writable rows ———

export function dehydrateInstances(
  sessionId: string,
  engineInstances: readonly PracticeEngineInstance[],
): PersistableInstanceRow[] {
  return engineInstances.map((inst) => ({
    session_id: sessionId,
    node_id: inst.node_id,
    actual_location_id: inst.actual_location_id,
    current_required_location_id: inst.current_required_location_id,
    is_satisfied: inst.is_satisfied,
  }));
}

export function dehydrateProgress(
  sessionId: string,
  engineProgress: readonly PracticeEngineProgress[],
): PersistableProgressRow[] {
  return engineProgress.map((prog) => ({
    session_id: sessionId,
    node_id: prog.node_id,
    is_satisfied: prog.is_satisfied,
    satisfied_at: prog.satisfied_at,
  }));
}

// ——— Derived data computation ———

export function computeDerivedData(
  state: PracticeEngineState,
): PracticeDerivedData {
  const legalActions = computeLegalActions(state);
  const totalNodes = state.node_progress.length;
  let satisfiedNodes = 0;
  for (const p of state.node_progress) {
    if (p.is_satisfied) satisfiedNodes++;
  }
  return {
    legalActions,
    totalNodes,
    satisfiedNodes,
    isComplete: totalNodes > 0 && satisfiedNodes === totalNodes,
  };
}
