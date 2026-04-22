// Practice mode adapter — Phase 3 실동 thin adapter.
// 책임 (Gate B Axis 1):
//   - LocationKey ↔ engine locationId 매핑 (bundle.locations.loc_key → id)
//   - engine reason → spec rejection_code 번역 (Gate B §4)
//   - computeLegalActions → adapter LegalAction[] 번역 (payload_node_ids는 공용 helper 사용)
//   - sessionView VM → StepGroupViewModel 래핑
//   - intent → practiceStore action dispatch
// 비책임:
//   - session persistence / DB write (store 소유)
//   - React 렌더 / 텍스트 생성 (sessionTextFormat은 import 금지 — Gate B Axis 3)
//   - physical tick 반응 (practice는 onRuntimeTick no-op)

import type {
  ActionIntent,
  ActionResult,
  GhostGuideModel,
  HudModel,
  KitchenModeAdapter,
  LegalAction as AdapterLegalAction,
  LocationKey,
  OverlayModel,
  PlaceIntent,
  PourIntent,
  RejectionModel,
  StepGroupViewModel,
} from './KitchenModeAdapter';
import { usePracticeStore } from '../../stores/practiceStore';
import {
  collectPourCandidateEntries,
  computeLegalActions,
  computeOpenNumber,
  resolvePlaceBinding,
} from '../practice/engine';
import type {
  LegalAction as EngineLegalAction,
  PlaceBlockReason,
  ActionBlockReason,
  PourBlockReason,
  PracticeEngineState,
} from '../practice/engine';
import type { PracticeMenuBundle, PracticeActionType } from '../../types/practice';
import {
  getCurrentStepGroup,
  getNextStepGroup,
} from '../practice/sessionView';

function translatePlaceReason(reason: PlaceBlockReason | 'not-active'): string {
  switch (reason) {
    case 'no-open-number':
      return 'step_not_open';
    case 'no-candidate-node':
      return 'no_candidate_node';
    case 'duplicate-phase-entry':
      return 'duplicate_phase_entry';
    case 'location-mismatch':
      return 'wrong_required_location';
    case 'deco-requires-base':
      return 'deco_requires_base';
    case 'not-active':
      return 'session_not_active';
  }
}

function translateActionReason(
  reason: ActionBlockReason | 'not-active',
): string {
  switch (reason) {
    case 'no-open-number':
      return 'action_not_open';
    case 'no-candidate-action':
      return 'no_candidate_action';
    case 'not-active':
      return 'session_not_active';
  }
}

// pour reason 중 source-not-clean / dry-run-blocked는 engine-internal — user-facing 미노출 (Gate B §3.5 / §4).
// null 반환 = rejection_code undefined + lastRejection clear.
function translatePourReason(
  reason: PourBlockReason | 'not-active',
): string | null {
  switch (reason) {
    case 'source-not-clean':
      return null;
    case 'pour-step-not-open':
      return 'pour_step_not_open';
    case 'pour-no-movable-instances':
      return 'pour_no_movable_instances';
    case 'pour-deco-requires-base':
      return 'pour_deco_requires_base';
    case 'dry-run-blocked':
      return null;
    case 'not-active':
      return 'session_not_active';
  }
}

function buildLocationIndex(
  bundle: PracticeMenuBundle,
): Map<LocationKey, string> {
  const map = new Map<LocationKey, string>();
  for (const loc of bundle.locations) {
    map.set(loc.loc_key, loc.id);
  }
  return map;
}

function buildReverseLocationIndex(
  bundle: PracticeMenuBundle,
): Map<string, LocationKey> {
  const map = new Map<string, LocationKey>();
  for (const loc of bundle.locations) {
    map.set(loc.id, loc.loc_key);
  }
  return map;
}

function translateEngineLegalAction(
  engine: EngineLegalAction,
  state: PracticeEngineState,
  reverseIndex: Map<string, LocationKey>,
): AdapterLegalAction | null {
  switch (engine.type) {
    case 'place': {
      const binding = resolvePlaceBinding(
        engine.ingredientId,
        engine.targetLocationId,
        state,
      );
      if (!binding) return null;
      const key = reverseIndex.get(engine.targetLocationId);
      if (!key) return null;
      return {
        kind: 'place',
        ingredient_id: engine.ingredientId,
        location_key: key,
        step_no: binding.stepNo,
        node_id: binding.nodeId,
      };
    }
    case 'action': {
      const open = computeOpenNumber(engine.locationId, state);
      if (open === null) return null;
      const match = state.bundle.action_nodes.find(
        (a) =>
          a.node.step_no === open &&
          a.action.action_type === engine.actionType &&
          a.action.location_id === engine.locationId,
      );
      if (!match) return null;
      const key = reverseIndex.get(engine.locationId);
      if (!key) return null;
      return {
        kind: 'action',
        action_type: engine.actionType,
        location_key: key,
        step_no: match.node.step_no,
        node_id: match.node.id,
      };
    }
    case 'pour': {
      const tgtKey = reverseIndex.get(engine.targetLocationId);
      if (!tgtKey) return null;
      const entries = collectPourCandidateEntries(
        engine.sourceLocationId,
        engine.targetLocationId,
        state,
      );
      const payloadNodeIds = entries.length > 0
        ? entries.map((e) => e.nodeId)
        : state.ingredient_instances
            .filter(
              (inst) =>
                inst.actual_location_id === engine.sourceLocationId &&
                inst.is_satisfied === true,
            )
            .map((inst) => inst.node_id);
      return {
        kind: 'pour',
        source_location_ref: { kind: 'container', container_instance_id: engine.sourceLocationId },
        destination_location_key: tgtKey,
        payload_node_ids: payloadNodeIds,
      };
    }
  }
}

export function createPracticeModeAdapter(): KitchenModeAdapter {
  let locationIndex: Map<LocationKey, string> | null = null;
  let reverseIndex: Map<string, LocationKey> | null = null;
  let indexedBundle: PracticeMenuBundle | null = null;
  let lastRejection: RejectionModel | null = null;

  function ensureIndex(): {
    fwd: Map<LocationKey, string>;
    rev: Map<string, LocationKey>;
    state: PracticeEngineState;
  } | null {
    const state = usePracticeStore.getState().engineState;
    if (!state) {
      locationIndex = null;
      reverseIndex = null;
      indexedBundle = null;
      return null;
    }
    if (indexedBundle !== state.bundle || !locationIndex || !reverseIndex) {
      locationIndex = buildLocationIndex(state.bundle);
      reverseIndex = buildReverseLocationIndex(state.bundle);
      indexedBundle = state.bundle;
    }
    return { fwd: locationIndex, rev: reverseIndex, state };
  }

  function setRejection(
    rejection_code: string,
    at_location_key?: LocationKey,
    attempted_node_id?: string,
  ): void {
    lastRejection = {
      rejection_code,
      ...(at_location_key !== undefined ? { at_location_key } : {}),
      ...(attempted_node_id !== undefined ? { attempted_node_id } : {}),
    };
  }

  function finishAllow(): ActionResult {
    lastRejection = null;
    return { ok: true, effects: [] };
  }

  function finishUserReject(
    code: string,
    at_location_key?: LocationKey,
  ): ActionResult {
    setRejection(code, at_location_key);
    return { ok: false, rejection_code: code, effects: [] };
  }

  function finishInternalReject(): ActionResult {
    // engine-internal reason (source-not-clean / dry-run-blocked) — user-facing 미노출.
    lastRejection = null;
    return { ok: false, effects: [] };
  }

  return {
    mode: 'practice',

    boot: (): Promise<void> => {
      locationIndex = null;
      reverseIndex = null;
      indexedBundle = null;
      lastRejection = null;
      return Promise.resolve();
    },

    getHudModel: (): HudModel => {
      const state = usePracticeStore.getState();
      const title = state.engineState?.bundle.menu.name;
      const derived = state.derived;
      return {
        mode: 'practice',
        ...(title !== undefined ? { title } : {}),
        ...(derived
          ? {
              progress: {
                completed: derived.satisfiedNodes,
                total: derived.totalNodes,
              },
            }
          : {}),
      };
    },

    getOverlayModel: (): OverlayModel => ({
      rejection: lastRejection,
      guide: null,
    }),

    getOpenStep: (locationKey: LocationKey): number | null => {
      const indexes = ensureIndex();
      if (!indexes) return null;
      const locId = indexes.fwd.get(locationKey);
      if (!locId) return null;
      return computeOpenNumber(locId, indexes.state);
    },

    enumerateLegalActions: (): AdapterLegalAction[] => {
      const indexes = ensureIndex();
      if (!indexes) return [];
      const engineLegals = computeLegalActions(indexes.state);
      const out: AdapterLegalAction[] = [];
      for (const el of engineLegals) {
        const translated = translateEngineLegalAction(el, indexes.state, indexes.rev);
        if (translated) out.push(translated);
      }
      return out;
    },

    tryPlaceIngredient: (input: PlaceIntent): ActionResult => {
      const indexes = ensureIndex();
      if (!indexes) {
        return finishUserReject('session_not_active', input.location_key);
      }
      const locId = indexes.fwd.get(input.location_key);
      if (!locId) {
        return finishUserReject('unknown_location', input.location_key);
      }
      const result = usePracticeStore
        .getState()
        .placeIngredient(input.ingredient_id, locId);
      if (result.allowed) return finishAllow();
      const code = translatePlaceReason(result.reason);
      return finishUserReject(code, input.location_key);
    },

    tryPerformAction: (input: ActionIntent): ActionResult => {
      const indexes = ensureIndex();
      if (!indexes) {
        return finishUserReject('session_not_active', input.location_key);
      }
      const locId = indexes.fwd.get(input.location_key);
      if (!locId) {
        return finishUserReject('unknown_location', input.location_key);
      }
      const result = usePracticeStore
        .getState()
        .executeAction(input.action_type as PracticeActionType, locId);
      if (result.allowed) return finishAllow();
      const code = translateActionReason(result.reason);
      return finishUserReject(code, input.location_key);
    },

    tryPour: (input: PourIntent): ActionResult => {
      const indexes = ensureIndex();
      if (!indexes) {
        return finishUserReject('session_not_active', input.destination_location_key);
      }
      const srcId = indexes.fwd.get(input.source_location_key);
      const tgtId = indexes.fwd.get(input.destination_location_key);
      if (!srcId || !tgtId) {
        return finishUserReject('unknown_location', input.destination_location_key);
      }
      const result = usePracticeStore.getState().pour(srcId, tgtId);
      if (result.allowed) return finishAllow();
      const code = translatePourReason(result.reason);
      if (code === null) return finishInternalReject();
      return finishUserReject(code, input.destination_location_key);
    },

    onRuntimeTick: (): void => {
      // practice: physical tick 반응 없음.
    },

    getCurrentStepGroups: (): StepGroupViewModel[] => {
      const state = usePracticeStore.getState().engineState;
      if (!state) return [];
      const out: StepGroupViewModel[] = [];
      const current = getCurrentStepGroup(state);
      if (current) {
        out.push({
          step_group_id: current.id,
          display_step_no: current.display_step_no,
          title: current.title,
          ...(current.summary !== null ? { summary: current.summary } : {}),
          is_primary: true,
        });
      }
      const next = getNextStepGroup(state);
      if (next) {
        out.push({
          step_group_id: next.id,
          display_step_no: next.display_step_no,
          title: next.title,
          ...(next.summary !== null ? { summary: next.summary } : {}),
          is_primary: false,
        });
      }
      return out;
    },

    getPrimaryStepGroup: (): StepGroupViewModel | null => {
      const state = usePracticeStore.getState().engineState;
      if (!state) return null;
      const current = getCurrentStepGroup(state);
      if (!current) return null;
      return {
        step_group_id: current.id,
        display_step_no: current.display_step_no,
        title: current.title,
        ...(current.summary !== null ? { summary: current.summary } : {}),
        is_primary: true,
      };
    },

    getGhostGuide: (): GhostGuideModel | null => {
      // Phase 5 scope — Phase 3은 null 유지.
      return null;
    },

    getRejectionModel: (): RejectionModel | null => lastRejection,
  };
}
