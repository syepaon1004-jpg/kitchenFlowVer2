import { describe, it, expect } from 'vitest';
import { FIXTURE_MENU_BUNDLE } from '../../fixtures';
import { bootstrapEngineState, tryPlaceIngredient, findProgress } from '..';

const LOC_FRIDGE = '20000000-0000-0000-0000-00000000000a';
const LOC_PANTRY = '20000000-0000-0000-0000-00000000000b';
const LOC_HAND = '20000000-0000-0000-0000-00000000000c';
const LOC_WOK = '20000000-0000-0000-0000-00000000000d';
const LOC_PLATE = '20000000-0000-0000-0000-00000000000e';

const NODE_RICE = '30000000-0000-0000-0000-000000000001';
const NODE_EGG_A = '30000000-0000-0000-0000-000000000002';

const ING_RICE = '40000000-0000-0000-0000-000000000001';
const ING_EGG = '40000000-0000-0000-0000-000000000002';

describe('tryPlaceIngredient', () => {
  it('(5) bootstrap 직후 ingredient_instances는 빈 배열', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    expect(state.ingredient_instances).toHaveLength(0);
  });

  it('(6) 첫 place(rice, pantry) 성공 시 instance 생성 + 즉시 advance로 required=hand', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.boundNodeId).toBe(NODE_RICE);
    expect(r.newState.ingredient_instances).toHaveLength(1);
    const inst = r.newState.ingredient_instances[0];
    expect(inst.node_id).toBe(NODE_RICE);
    expect(inst.actual_location_id).toBe(LOC_PANTRY);
    expect(inst.current_required_location_id).toBe(LOC_HAND);
    expect(inst.is_satisfied).toBe(false);
  });

  it('(7) 같은 place 직후 node_progress[rice]는 아직 is_satisfied=false (path 미완)', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    const progress = findProgress(NODE_RICE, r.newState);
    expect(progress?.is_satisfied).toBe(false);
    expect(progress?.satisfied_at).toBeNull();
  });

  it('(8) openNumber 존재 + ingredient id 일치 없음 → no-candidate-node (state 불변)', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPlaceIngredient(ING_RICE, LOC_WOK, state);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('no-candidate-node');
    expect(state.ingredient_instances).toHaveLength(0);
  });

  it('(8b) step_no + id 일치하지만 모두 satisfied → duplicate-phase-entry', () => {
    // 커스텀 bundle: egg_A 자리 + action step 2 fridge 추가해서 openNumber(fridge)=2 유지.
    // egg_A만 step 2 ingredient이므로 satisfied 처리 후 재시도하면 unsatisfied 집합 빔.
    const NODE_EGG_A_ID = '30000000-0000-0000-0000-000000000002';
    const customBundle = {
      ...FIXTURE_MENU_BUNDLE,
      action_nodes: [
        ...FIXTURE_MENU_BUNDLE.action_nodes,
        {
          node: { id: 'fake-act-step2', menu_id: FIXTURE_MENU_BUNDLE.menu.id, node_type: 'action' as const, step_no: 2 },
          action: {
            node_id: 'fake-act-step2',
            action_type: 'boil' as const,
            location_id: LOC_FRIDGE,
            duration_sec: 10,
          },
        },
      ],
    };
    const base = bootstrapEngineState(customBundle);
    // egg_A progress satisfied 처리 → fridge openNumber: fake-act-step2 unsatisfied at step 2 → 2.
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        if (p.node_id === NODE_EGG_A_ID) {
          return { ...p, is_satisfied: true, satisfied_at: '2026-04-22T00:00:00.000Z' };
        }
        return p;
      }),
    };
    const r = tryPlaceIngredient(ING_EGG, LOC_FRIDGE, fake);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('duplicate-phase-entry');
  });

  it('(8c) step_no + id 일치하지만 current_required 불일치 → location-mismatch', () => {
    // 자연 fixture flow로는 rice의 current_required가 target과 다른 채 openNumber를 target에 유지하기
    // 어려우므로, action node step_no를 1로 덮은 커스텀 bundle로 openNumber(wok)=1을 강제.
    // rice(step 1, path pantry→hand→wok)의 default current_required=pantry → target wok 불일치.
    const LOC_FRIDGE_X = '20000000-0000-0000-0000-00000000000a';
    const customBundle = {
      ...FIXTURE_MENU_BUNDLE,
      action_nodes: [
        // fry를 step 1로 덮어 openNumber(wok)=1을 자연스럽게 만든다.
        {
          node: { id: 'fake-fry-step1', menu_id: FIXTURE_MENU_BUNDLE.menu.id, node_type: 'action' as const, step_no: 1 },
          action: {
            node_id: 'fake-fry-step1',
            action_type: 'fry' as const,
            location_id: LOC_WOK,
            duration_sec: 30,
          },
        },
      ],
    };
    const state = bootstrapEngineState(customBundle);
    void LOC_FRIDGE_X;
    const r = tryPlaceIngredient(ING_RICE, LOC_WOK, state);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('location-mismatch');
  });

  it('(8d) deco terminal에 base 없으면 deco-requires-base', () => {
    // sesame의 location_path: pantry → hand → plate. terminal=plate, is_deco=true.
    // 먼저 rice/sesame을 pantry에 place, 그리고 sesame을 hand까지 이동시킨 뒤 plate에 place 시도.
    // plate에는 아직 egg_B(base, non-deco)가 도달하지 않았으므로 deco-requires-base.
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    // rice step 1 and sesame step 6을 동시에 pantry 에 놓으려면 openNumber가 1인 동안 rice만 가능.
    // rice를 완전히 wok까지 보내고 egg_A도 wok에 놓은 후 fry, 이어서 stir 등. 전체 시퀀스 복잡하므로
    // 직접 state mutation helper 대신 fake state 사용.
    const NODE_SESAME = '30000000-0000-0000-0000-000000000006';
    const fake: typeof state = {
      ...state,
      // sesame instance를 plate에 current_required=plate로 놓고 openNumber(plate)가 sesame step=6이 되게 만든다.
      ingredient_instances: [
        // rice, egg_A, egg_B 모두 satisfied로 시퀀스 마무리 가정
        // 단 egg_B는 wok에 머물러 plate 도달 전 → plate에 non-deco base 없음
        { node_id: '30000000-0000-0000-0000-000000000001', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000002', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000004', actual_location_id: LOC_WOK, current_required_location_id: LOC_WOK, is_satisfied: true },
        { node_id: NODE_SESAME, actual_location_id: LOC_HAND, current_required_location_id: LOC_PLATE, is_satisfied: false },
      ],
      node_progress: state.node_progress.map((p) => {
        const satisfiedIds = new Set([
          '30000000-0000-0000-0000-000000000001',
          '30000000-0000-0000-0000-000000000002',
          '30000000-0000-0000-0000-000000000003', // fry
          '30000000-0000-0000-0000-000000000004', // egg_B
          '30000000-0000-0000-0000-000000000005', // stir
        ]);
        if (satisfiedIds.has(p.node_id)) {
          return { ...p, is_satisfied: true, satisfied_at: '2026-04-22T00:00:00.000Z' };
        }
        return p;
      }),
    };
    const r = tryPlaceIngredient('40000000-0000-0000-0000-000000000003', LOC_PLATE, fake);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('deco-requires-base');
  });

  it('(9) 중복 노드 결정적 바인딩: 초기 place(egg, fridge)는 egg_A(step2)에만 바인딩', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPlaceIngredient(ING_EGG, LOC_FRIDGE, state);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.boundNodeId).toBe(NODE_EGG_A);
    expect(r.newState.ingredient_instances).toHaveLength(1);
    expect(r.newState.ingredient_instances[0].node_id).toBe(NODE_EGG_A);
  });

  it('(10) 원본 state 불변: 새 state는 다른 참조, 원본 배열·progress는 변경 없음', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const originalInstancesRef = state.ingredient_instances;
    const originalProgressRef = state.node_progress;
    const riceProgressBefore = findProgress(NODE_RICE, state);
    const riceProgressSnapshot = riceProgressBefore
      ? { ...riceProgressBefore }
      : null;

    const r = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;

    expect(r.newState).not.toBe(state);
    expect(state.ingredient_instances).toBe(originalInstancesRef);
    expect(state.ingredient_instances).toHaveLength(0);
    expect(state.node_progress).toBe(originalProgressRef);
    expect(findProgress(NODE_RICE, state)).toEqual(riceProgressSnapshot);
  });
});
