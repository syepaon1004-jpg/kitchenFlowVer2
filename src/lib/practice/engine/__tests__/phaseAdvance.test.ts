import { describe, it, expect } from 'vitest';
import { FIXTURE_MENU_BUNDLE } from '../../fixtures';
import {
  advanceLocation,
  bootstrapEngineState,
  findInstance,
  findProgress,
  tryExecuteAction,
  tryPlaceIngredient,
} from '..';

const LOC_FRIDGE = '20000000-0000-0000-0000-00000000000a';
const LOC_PANTRY = '20000000-0000-0000-0000-00000000000b';
const LOC_HAND = '20000000-0000-0000-0000-00000000000c';
const LOC_WOK = '20000000-0000-0000-0000-00000000000d';
const LOC_PLATE = '20000000-0000-0000-0000-00000000000e';

const NODE_RICE = '30000000-0000-0000-0000-000000000001';
const NODE_FRY = '30000000-0000-0000-0000-000000000003';

const ING_RICE = '40000000-0000-0000-0000-000000000001';
const ING_EGG = '40000000-0000-0000-0000-000000000002';

describe('advanceLocation + tryExecuteAction', () => {
  it('(14) 단일 그룹 전진: place(rice, pantry) 후 actual=pantry, required=hand, !satisfied', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    const inst = findInstance(NODE_RICE, r.newState);
    expect(inst?.actual_location_id).toBe(LOC_PANTRY);
    expect(inst?.current_required_location_id).toBe(LOC_HAND);
    expect(inst?.is_satisfied).toBe(false);
  });

  it('(15) 최종 path 도달 시 node_progress.is_satisfied=true, satisfied_at 존재', () => {
    let state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r1 = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r1.allowed).toBe(true);
    if (!r1.allowed) return;
    state = r1.newState;
    const r2 = tryPlaceIngredient(ING_RICE, LOC_HAND, state);
    expect(r2.allowed).toBe(true);
    if (!r2.allowed) return;
    state = r2.newState;
    const r3 = tryPlaceIngredient(ING_RICE, LOC_WOK, state);
    expect(r3.allowed).toBe(true);
    if (!r3.allowed) return;
    state = r3.newState;

    const progress = findProgress(NODE_RICE, state);
    expect(progress?.is_satisfied).toBe(true);
    expect(progress?.satisfied_at).not.toBeNull();

    const inst = findInstance(NODE_RICE, state);
    expect(inst?.actual_location_id).toBe(LOC_WOK);
    expect(inst?.is_satisfied).toBe(true);
  });

  it('(16) 그룹 미완성이면 advanceLocation은 state 변경 없음 (참조 동일)', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const advWok = advanceLocation(LOC_WOK, state);
    const advHand = advanceLocation(LOC_HAND, state);
    expect(advWok).toBe(state);
    expect(advHand).toBe(state);
  });

  it('(17a) tryExecuteAction 합법: rice와 egg_A를 wok까지 완전히 이동 후 fry 실행', () => {
    let state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const steps = [
      [ING_RICE, LOC_PANTRY] as const,
      [ING_RICE, LOC_HAND] as const,
      [ING_RICE, LOC_WOK] as const,
      [ING_EGG, LOC_FRIDGE] as const,
      [ING_EGG, LOC_HAND] as const,
      [ING_EGG, LOC_WOK] as const,
    ];
    for (const [ing, loc] of steps) {
      const r = tryPlaceIngredient(ing, loc, state);
      expect(r.allowed).toBe(true);
      if (!r.allowed) return;
      state = r.newState;
    }
    const action = tryExecuteAction('fry', LOC_WOK, state);
    expect(action.allowed).toBe(true);
    if (!action.allowed) return;
    expect(action.executedNodeId).toBe(NODE_FRY);
    const fryProgress = findProgress(NODE_FRY, action.newState);
    expect(fryProgress?.is_satisfied).toBe(true);
    expect(fryProgress?.satisfied_at).not.toBeNull();
  });

  it('(17b) tryExecuteAction 차단: 초기 state에서 stir 실행 시 no-candidate-action', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryExecuteAction('stir', LOC_WOK, state);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('no-candidate-action');
  });

  it('(17c) tryExecuteAction 차단: 초기 state에서 plate는 openNumber=null → no-open-number', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryExecuteAction('fry', LOC_PLATE, state);
    expect(r.allowed).toBe(false);
    if (r.allowed) return;
    expect(r.reason).toBe('no-open-number');
  });
});
