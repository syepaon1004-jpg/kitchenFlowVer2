import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FIXTURE_MENU_BUNDLE } from '../../practice/fixtures';
import { bootstrapEngineState } from '../../practice/engine';
import { computeDerivedData } from '../../practice/runtime';
import type { PracticeSession } from '../../../types/practice';

// ——— Mocks (DB boundary only) ———

vi.mock('../../supabase', () => ({ supabase: {} }));
vi.mock('../../practice/queries', () => ({
  fetchPracticeMenuBundle: vi.fn(),
  createPracticeSession: vi.fn(),
  fetchPracticeSession: vi.fn(),
  fetchPracticeIngredientInstances: vi.fn(),
  fetchPracticeNodeProgress: vi.fn(),
  upsertPracticeIngredientInstances: vi.fn().mockResolvedValue(undefined),
  upsertPracticeNodeProgress: vi.fn().mockResolvedValue(undefined),
  updatePracticeSessionStatus: vi.fn(),
}));

let createPracticeModeAdapter: typeof import('../createPracticeModeAdapter').createPracticeModeAdapter;
let usePracticeStore: typeof import('../../../stores/practiceStore').usePracticeStore;

const STORE_ID = '00000000-0000-0000-0000-000000000001';
const MENU_ID = '10000000-0000-0000-0000-000000000001';
const SESSION_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const USER_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

const LOC_FRIDGE = '20000000-0000-0000-0000-00000000000a';
const LOC_PANTRY = '20000000-0000-0000-0000-00000000000b';
const LOC_HAND = '20000000-0000-0000-0000-00000000000c';
const LOC_WOK = '20000000-0000-0000-0000-00000000000d';
const LOC_PLATE = '20000000-0000-0000-0000-00000000000e';

const LK_FRIDGE = 'fridge';
const LK_PANTRY = 'pantry';
const LK_HAND = 'hand';
const LK_WOK = 'wok_1';
const LK_PLATE = 'plate_1';

const ING_RICE = '40000000-0000-0000-0000-000000000001';
const ING_EGG = '40000000-0000-0000-0000-000000000002';
const ING_SESAME = '40000000-0000-0000-0000-000000000003';

function fakeSession(): PracticeSession {
  return {
    id: SESSION_ID,
    menu_id: MENU_ID,
    store_id: STORE_ID,
    store_user_id: USER_ID,
    status: 'active',
    started_at: '2026-04-22T00:00:00.000Z',
    completed_at: null,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  const adapterMod = await import('../createPracticeModeAdapter');
  createPracticeModeAdapter = adapterMod.createPracticeModeAdapter;
  const storeMod = await import('../../../stores/practiceStore');
  usePracticeStore = storeMod.usePracticeStore;
  storeMod.resetPersistQueue();
  const engineState = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
  const derived = computeDerivedData(engineState);
  usePracticeStore.setState({
    phase: 'active',
    session: fakeSession(),
    error: null,
    engineState,
    derived,
    persistInFlight: false,
    persistError: null,
  });
});

function setEngineState(overrides: {
  node_progress?: typeof FIXTURE_MENU_BUNDLE.ingredient_nodes extends unknown ? unknown : never;
}): void {
  // simple mutation helper via setState
  void overrides;
}

describe('createPracticeModeAdapter — basic lifecycle', () => {
  it('boot returns resolved promise and clears rejection', async () => {
    const adapter = createPracticeModeAdapter();
    await expect(
      adapter.boot({ store_id: STORE_ID, user_id: USER_ID, mode: 'practice' }),
    ).resolves.toBeUndefined();
    expect(adapter.getRejectionModel()).toBeNull();
    expect(adapter.mode).toBe('practice');
  });

  it('getHudModel reflects current progress', () => {
    const adapter = createPracticeModeAdapter();
    const hud = adapter.getHudModel();
    expect(hud.mode).toBe('practice');
    expect(hud.title).toBe('가정식 볶음밥');
    expect(hud.progress?.total).toBeGreaterThan(0);
  });

  it('getOpenStep resolves location_key → engine openNumber', () => {
    const adapter = createPracticeModeAdapter();
    // pantry: openNumber = step 1 (rice)
    expect(adapter.getOpenStep(LK_PANTRY)).toBe(1);
    // wok: openNumber = step 3 (fry)
    expect(adapter.getOpenStep(LK_WOK)).toBe(3);
    // unknown key → null
    expect(adapter.getOpenStep('nonexistent')).toBeNull();
  });

  it('onRuntimeTick is a no-op (practice)', () => {
    const adapter = createPracticeModeAdapter();
    expect(() => adapter.onRuntimeTick()).not.toThrow();
  });

  it('getGhostGuide returns null (Phase 5 scope)', () => {
    const adapter = createPracticeModeAdapter();
    expect(adapter.getGhostGuide()).toBeNull();
  });
});

describe('createPracticeModeAdapter — place rejection_code translation', () => {
  it('no-open-number → step_not_open', () => {
    const adapter = createPracticeModeAdapter();
    // plate에 openNumber=null → place(rice, plate) → no-open-number
    const r = adapter.tryPlaceIngredient({
      ingredient_id: ING_RICE,
      location_key: LK_PLATE,
      location_ref: { kind: 'container', container_instance_id: LOC_PLATE },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('step_not_open');
    expect(adapter.getRejectionModel()?.rejection_code).toBe('step_not_open');
  });

  it('no-candidate-node → no_candidate_node', () => {
    const adapter = createPracticeModeAdapter();
    // wok openNumber=3 (fry action), rice not candidate → no-candidate-node
    const r = adapter.tryPlaceIngredient({
      ingredient_id: ING_RICE,
      location_key: LK_WOK,
      location_ref: { kind: 'container', container_instance_id: LOC_WOK },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('no_candidate_node');
  });

  it('successful place → ok=true + rejection cleared', () => {
    const adapter = createPracticeModeAdapter();
    // pantry → rice place → success
    const r = adapter.tryPlaceIngredient({
      ingredient_id: ING_RICE,
      location_key: LK_PANTRY,
      location_ref: { kind: 'container', container_instance_id: LOC_PANTRY },
    });
    expect(r.ok).toBe(true);
    expect(adapter.getRejectionModel()).toBeNull();
  });

  it('unknown_location when location_key is invalid', () => {
    const adapter = createPracticeModeAdapter();
    const r = adapter.tryPlaceIngredient({
      ingredient_id: ING_RICE,
      location_key: 'nonexistent',
      location_ref: { kind: 'container', container_instance_id: 'x' },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('unknown_location');
  });
});

describe('createPracticeModeAdapter — action rejection_code translation', () => {
  it('no-open-number → action_not_open', () => {
    const adapter = createPracticeModeAdapter();
    // plate openNumber=null → action_not_open
    const r = adapter.tryPerformAction({
      action_type: 'fry',
      location_key: LK_PLATE,
      location_ref: { kind: 'container', container_instance_id: LOC_PLATE },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('action_not_open');
  });

  it('no-candidate-action → no_candidate_action', () => {
    const adapter = createPracticeModeAdapter();
    // wok openNumber=3 (fry). stir at wok is step 5 → no-candidate-action at openNumber=3.
    const r = adapter.tryPerformAction({
      action_type: 'stir',
      location_key: LK_WOK,
      location_ref: { kind: 'container', container_instance_id: LOC_WOK },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('no_candidate_action');
  });
});

describe('createPracticeModeAdapter — pour rejection_code translation', () => {
  it('source-not-clean → undefined rejection_code (engine-internal, Gate B)', () => {
    const adapter = createPracticeModeAdapter();
    // bootstrap pantry has rice unsatisfied current_required=pantry → sourceHasOpenIngredient(pantry) = true.
    const r = adapter.tryPour({
      source_location_key: LK_PANTRY,
      source_location_ref: { kind: 'container', container_instance_id: LOC_PANTRY },
      destination_location_key: LK_HAND,
      destination_location_ref: { kind: 'container', container_instance_id: LOC_HAND },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBeUndefined();
    expect(adapter.getRejectionModel()).toBeNull();
  });

  it('pour-no-movable-instances → pour_no_movable_instances', () => {
    const adapter = createPracticeModeAdapter();
    // plate(source) clean + no instance at plate → pour-no-movable-instances.
    const r = adapter.tryPour({
      source_location_key: LK_PLATE,
      source_location_ref: { kind: 'container', container_instance_id: LOC_PLATE },
      destination_location_key: LK_WOK,
      destination_location_ref: { kind: 'container', container_instance_id: LOC_WOK },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('pour_no_movable_instances');
  });

  it('§14.4 empty-payload pour success', () => {
    // 직접 engineState 구성: pantry에 satisfied physical rice, wok open.
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        const unsatActionIds = new Set([
          '30000000-0000-0000-0000-000000000003',
          '30000000-0000-0000-0000-000000000005',
        ]);
        if (unsatActionIds.has(p.node_id)) return p;
        return { ...p, is_satisfied: true, satisfied_at: '2026-04-22T00:00:00.000Z' };
      }),
      ingredient_instances: [
        {
          node_id: '30000000-0000-0000-0000-000000000001',
          actual_location_id: LOC_PANTRY,
          current_required_location_id: LOC_WOK,
          is_satisfied: true,
        },
      ],
    };
    usePracticeStore.setState({
      engineState: fake,
      derived: computeDerivedData(fake),
    });
    const adapter = createPracticeModeAdapter();
    const r = adapter.tryPour({
      source_location_key: LK_PANTRY,
      source_location_ref: { kind: 'container', container_instance_id: LOC_PANTRY },
      destination_location_key: LK_WOK,
      destination_location_ref: { kind: 'container', container_instance_id: LOC_WOK },
    });
    expect(r.ok).toBe(true);
  });

  it('pour-deco-requires-base → pour_deco_requires_base', () => {
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const NODE_SESAME = '30000000-0000-0000-0000-000000000006';
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        const satIds = new Set([
          '30000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000002',
          '30000000-0000-0000-0000-000000000003',
          '30000000-0000-0000-0000-000000000004',
          '30000000-0000-0000-0000-000000000005',
        ]);
        if (satIds.has(p.node_id)) {
          return { ...p, is_satisfied: true, satisfied_at: '2026-04-22T00:00:00.000Z' };
        }
        return p;
      }),
      ingredient_instances: [
        { node_id: '30000000-0000-0000-0000-000000000001', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000002', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000004', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: NODE_SESAME, actual_location_id: LOC_HAND, current_required_location_id: LOC_PLATE, is_satisfied: false },
      ],
    };
    usePracticeStore.setState({
      engineState: fake,
      derived: computeDerivedData(fake),
    });
    const adapter = createPracticeModeAdapter();
    const r = adapter.tryPour({
      source_location_key: LK_HAND,
      source_location_ref: { kind: 'container', container_instance_id: LOC_HAND },
      destination_location_key: LK_PLATE,
      destination_location_ref: { kind: 'container', container_instance_id: LOC_PLATE },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('pour_deco_requires_base');
  });
});

describe('createPracticeModeAdapter — deco-first + terminal place', () => {
  it('deco place at terminal without base → deco_requires_base', () => {
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const NODE_SESAME = '30000000-0000-0000-0000-000000000006';
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        const satIds = new Set([
          '30000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000002',
          '30000000-0000-0000-0000-000000000003',
          '30000000-0000-0000-0000-000000000004',
          '30000000-0000-0000-0000-000000000005',
        ]);
        if (satIds.has(p.node_id)) {
          return { ...p, is_satisfied: true, satisfied_at: '2026-04-22T00:00:00.000Z' };
        }
        return p;
      }),
      ingredient_instances: [
        { node_id: '30000000-0000-0000-0000-000000000001', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000002', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000004', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: NODE_SESAME, actual_location_id: LOC_HAND, current_required_location_id: LOC_PLATE, is_satisfied: false },
      ],
    };
    usePracticeStore.setState({
      engineState: fake,
      derived: computeDerivedData(fake),
    });
    const adapter = createPracticeModeAdapter();
    const r = adapter.tryPlaceIngredient({
      ingredient_id: ING_SESAME,
      location_key: LK_PLATE,
      location_ref: { kind: 'container', container_instance_id: LOC_PLATE },
    });
    expect(r.ok).toBe(false);
    expect(r.rejection_code).toBe('deco_requires_base');
  });
});

describe('createPracticeModeAdapter — enumerate/try* consistency', () => {
  it('every enumerated action is accepted by the corresponding try* (bootstrap)', () => {
    const adapter = createPracticeModeAdapter();
    const legals = adapter.enumerateLegalActions();
    expect(legals.length).toBeGreaterThan(0);
    for (const la of legals) {
      let result;
      if (la.kind === 'place') {
        result = adapter.tryPlaceIngredient({
          ingredient_id: la.ingredient_id,
          location_key: la.location_key,
          location_ref: { kind: 'container', container_instance_id: 'unused' },
        });
      } else if (la.kind === 'action') {
        result = adapter.tryPerformAction({
          action_type: la.action_type,
          location_key: la.location_key,
          location_ref: { kind: 'container', container_instance_id: 'unused' },
        });
      } else {
        // For pour consistency check we reconstruct from enumerated la.
        // Source key reverse-mapping isn't directly exposed; iterate to find matching source loc_key.
        const srcKey = FIXTURE_MENU_BUNDLE.locations.find(
          (l) => ('container_instance_id' in la.source_location_ref &&
            l.id === la.source_location_ref.container_instance_id),
        )?.loc_key;
        if (!srcKey) continue;
        result = adapter.tryPour({
          source_location_key: srcKey,
          source_location_ref: la.source_location_ref,
          destination_location_key: la.destination_location_key,
          destination_location_ref: null,
        });
      }
      expect(result.ok).toBe(true);
    }
  });
});

describe('createPracticeModeAdapter — rejection lifecycle', () => {
  it('clears lastRejection after successful call', () => {
    const adapter = createPracticeModeAdapter();
    const rejected = adapter.tryPlaceIngredient({
      ingredient_id: ING_RICE,
      location_key: LK_WOK,
      location_ref: { kind: 'container', container_instance_id: LOC_WOK },
    });
    expect(rejected.ok).toBe(false);
    expect(adapter.getRejectionModel()).not.toBeNull();

    const success = adapter.tryPlaceIngredient({
      ingredient_id: ING_RICE,
      location_key: LK_PANTRY,
      location_ref: { kind: 'container', container_instance_id: LOC_PANTRY },
    });
    expect(success.ok).toBe(true);
    expect(adapter.getRejectionModel()).toBeNull();
  });

  it('boot clears lastRejection', async () => {
    const adapter = createPracticeModeAdapter();
    adapter.tryPlaceIngredient({
      ingredient_id: ING_RICE,
      location_key: LK_WOK,
      location_ref: { kind: 'container', container_instance_id: LOC_WOK },
    });
    expect(adapter.getRejectionModel()).not.toBeNull();
    await adapter.boot({ store_id: STORE_ID, user_id: USER_ID, mode: 'practice' });
    expect(adapter.getRejectionModel()).toBeNull();
  });
});

// silence lint on unused helper
void setEngineState;
void LOC_FRIDGE;
void LOC_HAND;
void ING_EGG;
void LK_FRIDGE;
