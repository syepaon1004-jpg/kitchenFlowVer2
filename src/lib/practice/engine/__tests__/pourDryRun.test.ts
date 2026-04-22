import { describe, it, expect } from 'vitest';
import { FIXTURE_MENU_BUNDLE } from '../../fixtures';
import {
  bootstrapEngineState,
  findInstance,
  findProgress,
  tryPlaceIngredient,
  tryPour,
} from '..';

const LOC_PANTRY = '20000000-0000-0000-0000-00000000000b';
const LOC_HAND = '20000000-0000-0000-0000-00000000000c';
const LOC_WOK = '20000000-0000-0000-0000-00000000000d';
const LOC_PLATE = '20000000-0000-0000-0000-00000000000e';

const NODE_RICE = '30000000-0000-0000-0000-000000000001';
const NODE_SESAME = '30000000-0000-0000-0000-000000000006';

const ING_RICE = '40000000-0000-0000-0000-000000000001';
const ING_SESAME = '40000000-0000-0000-0000-000000000003';

describe('tryPour', () => {
  it('(11) source 미완료 블록: 초기 pour(pantry, hand)는 source-not-clean', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPour(LOC_PANTRY, LOC_HAND, state);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('source-not-clean');
  });

  it('(12) source clean + 후보 없음 + destination open: pour(plate, wok)는 pour-no-movable-instances', () => {
    // plate는 source로 clean (unsatisfied 없음). wok는 fry step 3 openNumber=3.
    // plate에 instance 없음 → candidates 0 + physical payload 0 → pour-no-movable-instances.
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPour(LOC_PLATE, LOC_WOK, state);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('pour-no-movable-instances');
  });

  it('(12b) destination openNumber=null → pour-step-not-open', () => {
    // pantry는 clean(초기 상태), plate는 openNumber=null (sesame current_required=pantry, egg_B=fridge).
    // 단 초기 pantry는 rice/sesame current_required=pantry → source-not-clean이 먼저 발동.
    // fake state: pantry clean + plate에 target될 node 없음.
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => ({
        ...p,
        is_satisfied: true,
        satisfied_at: '2026-04-22T00:00:00.000Z',
      })),
      ingredient_instances: [
        // satisfied 인스턴스 하나도 plate에 없음, pantry에도 없음 (pantry가 source, clean)
      ],
    };
    // pantry: 모든 node satisfied → sourceHasOpenIngredient=false.
    // plate: computeOpenNumber → 모든 node satisfied → null.
    // candidates(pantry→plate) = 0 → hasPhysicalPayloadAt(pantry)=false → pour-no-movable-instances.
    // → step-not-open이 먼저 firing되게: node_progress에서 일부를 비 satisfied로 두고 plate를 null로 유지.
    // pour-step-not-open 정밀 노출을 위해 instance를 pantry에 두되 plate 타겟 node는 모두 satisfied로.
    const fake2: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        // egg_B(step 4, path ending at plate)와 sesame(step 6, path ending at plate)을 satisfied로.
        const plateEndingNodeIds = new Set([
          '30000000-0000-0000-0000-000000000004', // egg_B
          '30000000-0000-0000-0000-000000000006', // sesame
        ]);
        if (plateEndingNodeIds.has(p.node_id)) {
          return { ...p, is_satisfied: true, satisfied_at: '2026-04-22T00:00:00.000Z' };
        }
        return p;
      }),
      ingredient_instances: [
        // pantry에 satisfied physical payload 하나(egg_B satisfied) — pour-no-movable-instances 대신
        // physical payload 있음 → §14.4 success로 간다. 따라서 plate에 physical 없이 남긴다.
      ],
    };
    // pantry: sesame current_required=pantry but satisfied=true → skip → sourceHasOpenIngredient=false.
    // rice still unsatisfied current_required=pantry → sourceHasOpenIngredient=true → source-not-clean.
    void fake;
    void fake2;
    // 간소화: rice까지 모두 satisfied 처리 + instance 하나도 plate 아닌 location에 둠 → plate openNumber=null.
    const fake3: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => ({
        ...p,
        is_satisfied: true,
        satisfied_at: '2026-04-22T00:00:00.000Z',
      })),
      ingredient_instances: [
        // unsatisfied 인스턴스 하나를 wok에 둠 (actual=wok, current_required=wok, is_satisfied=false)
        // → wok가 source, wok의 sourceHasOpenIngredient 체크: required === wok AND instance !satisfied → true.
        // → source-not-clean이 먼저 firing. 이를 회피하려면 instance의 current_required를 wok이 아닌 곳으로.
        {
          node_id: '30000000-0000-0000-0000-000000000001',
          actual_location_id: LOC_WOK,
          current_required_location_id: LOC_PLATE,
          is_satisfied: false,
        },
      ],
    };
    // wok: sourceHasOpenIngredient → rice node progress is_satisfied=true → skip. → false. OK.
    // plate: computeOpenNumber: rice current_required=plate (instance) is_satisfied(progress)=true → skip.
    //  다른 node current_required=plate 없음 → null.
    // candidates(wok→plate): rice instance actual=wok, current_required=plate, !is_satisfied → 1 candidate.
    // → step 4: step_not_open 먼저 체크됨. null → pour-step-not-open.
    const r = tryPour(LOC_WOK, LOC_PLATE, fake3);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('pour-step-not-open');
  });

  it('(12c) §14.4 empty-payload pour: source에 satisfied physical payload만 있을 때 success + state 불변', () => {
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    // 모든 node를 satisfied로 처리 + rice instance를 pantry에 physical(satisfied) 상태로 둠.
    // target=hand: openNumber(hand)=null이면 pour-step-not-open. openNumber을 non-null로 만들려면
    // hand에 unsatisfied node가 있어야 함. fixture 제약으로 모두 satisfied이면 openNumber=null.
    // 대안: target=wok (fry step 3은 unsatisfied로 유지) + source=pantry(rice satisfied physical).
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        // rice(step 1)는 satisfied 유지 (path 마지막까지 소비), egg_A/egg_B/sesame도 satisfied.
        // fry/stir은 unsatisfied로 남겨 wok의 openNumber 열어둠.
        const unsatisfiedActionIds = new Set([
          '30000000-0000-0000-0000-000000000003', // fry
          '30000000-0000-0000-0000-000000000005', // stir
        ]);
        if (unsatisfiedActionIds.has(p.node_id)) return p;
        return { ...p, is_satisfied: true, satisfied_at: '2026-04-22T00:00:00.000Z' };
      }),
      ingredient_instances: [
        // rice: actual=pantry, current_required=pantry(= last seq 2 location wok이지만 단순화),
        // is_satisfied=true → pantry에 physical payload 확보.
        {
          node_id: '30000000-0000-0000-0000-000000000001',
          actual_location_id: LOC_PANTRY,
          current_required_location_id: LOC_WOK,
          is_satisfied: true,
        },
      ],
    };
    // source=pantry: rice instance satisfied → sourceHasOpenIngredient: progress rice=satisfied → skip. → false.
    //   sesame progress satisfied → skip. rice is_satisfied 통해 path 종료된 것으로 간주.
    //   결론 source-not-clean 미발생.
    // target=wok: fry unsatisfied action_node location=wok step 3 → openNumber=3. non-null.
    // candidates(pantry→wok): rice instance current_required=wok, actual=pantry, !is_satisfied=false → 제외.
    //   → candidates.length = 0.
    // hasPhysicalPayloadAt(pantry): rice satisfied → true. → §14.4 success.
    const r = tryPour(LOC_PANTRY, LOC_WOK, fake);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.committedNodeIds).toEqual([]);
    expect(r.newState).toBe(fake);  // state 불변 (동일 참조)
  });

  it('(12d) pour-deco-requires-base: deco를 terminal에 pour할 때 base 없으면 거절', () => {
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    // sesame(is_deco=true, terminal=plate)을 hand → plate로 pour 시도.
    // plate에 non-deco base(예: egg_B)가 없어야 거절.
    const NODE_SESAME = '30000000-0000-0000-0000-000000000006';
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        // rice/egg_A/fry/egg_B/stir satisfied 처리 (egg_B는 wok에 머무름, plate 미도달)
        const satIds = new Set([
          '30000000-0000-0000-0000-000000000001', // rice
          '30000000-0000-0000-0000-000000000002', // egg_A
          '30000000-0000-0000-0000-000000000003', // fry
          '30000000-0000-0000-0000-000000000004', // egg_B
          '30000000-0000-0000-0000-000000000005', // stir
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
        // sesame at hand, current_required=plate, unsatisfied
        { node_id: NODE_SESAME, actual_location_id: LOC_HAND, current_required_location_id: LOC_PLATE, is_satisfied: false },
      ],
    };
    // source=hand: sourceHasOpenIngredient: sesame current_required=plate(not hand), skip. → false.
    // target=plate: sesame current_required=plate progress unsatisfied → openNumber(plate)=6. non-null.
    // candidates(hand→plate): sesame 1 candidate.
    // deco 체크: sesame is_deco=true. terminal(sesame)=plate. target=plate. hasNonDecoBaseAt(plate) = ?
    //   plate에 instance 하나도 없음 → false. → pour-deco-requires-base.
    const r = tryPour(LOC_HAND, LOC_PLATE, fake);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('pour-deco-requires-base');
  });

  it('(13) 정상 pour: rice+sesame을 pantry 정리 후 pour(pantry, hand)로 연속 판정', () => {
    let state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r1 = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r1.allowed).toBe(true);
    if (!r1.allowed) return;
    state = r1.newState;
    const r2 = tryPlaceIngredient(ING_SESAME, LOC_PANTRY, state);
    expect(r2.allowed).toBe(true);
    if (!r2.allowed) return;
    state = r2.newState;

    const pour = tryPour(LOC_PANTRY, LOC_HAND, state);
    expect(pour.allowed).toBe(true);
    if (!pour.allowed) return;
    expect(pour.committedNodeIds).toEqual([NODE_RICE, NODE_SESAME]);

    const riceInst = findInstance(NODE_RICE, pour.newState);
    expect(riceInst?.actual_location_id).toBe(LOC_HAND);
    expect(riceInst?.current_required_location_id).toBe(LOC_WOK);
    expect(riceInst?.is_satisfied).toBe(false);

    const sesameInst = findInstance(NODE_SESAME, pour.newState);
    expect(sesameInst?.actual_location_id).toBe(LOC_HAND);
    expect(sesameInst?.current_required_location_id).toBe(LOC_PLATE);
    expect(sesameInst?.is_satisfied).toBe(false);

    expect(findProgress(NODE_RICE, pour.newState)?.is_satisfied).toBe(false);
    expect(findProgress(NODE_SESAME, pour.newState)?.is_satisfied).toBe(false);
  });
});
