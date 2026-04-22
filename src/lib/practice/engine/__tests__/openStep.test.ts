import { describe, it, expect } from 'vitest';
import { FIXTURE_MENU_BUNDLE } from '../../fixtures';
import { bootstrapEngineState, computeOpenNumber, tryPlaceIngredient } from '..';

const LOC_FRIDGE = '20000000-0000-0000-0000-00000000000a';
const LOC_PANTRY = '20000000-0000-0000-0000-00000000000b';
const LOC_HAND = '20000000-0000-0000-0000-00000000000c';
const LOC_WOK = '20000000-0000-0000-0000-00000000000d';
const LOC_PLATE = '20000000-0000-0000-0000-00000000000e';
const ING_RICE = '40000000-0000-0000-0000-000000000001';

describe('computeOpenNumber (location-local)', () => {
  it('(1) 초기 pantry에 rice(step1)이 대기 → openNumber=1', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    expect(computeOpenNumber(LOC_PANTRY, state)).toBe(1);
  });

  it('(2) 초기 wok에 fry action(step3)이 대기 → action 포함 openNumber=3', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    expect(computeOpenNumber(LOC_WOK, state)).toBe(3);
    expect(computeOpenNumber(LOC_FRIDGE, state)).toBe(2);
  });

  it('(3) 초기 plate는 어떤 노드의 current_required도 아니고 action도 없음 → null', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    expect(computeOpenNumber(LOC_PLATE, state)).toBeNull();
    expect(computeOpenNumber(LOC_HAND, state)).toBeNull();
  });

  it('(4) rice를 pantry에 place 후 위치별 독립 재계산', () => {
    const initial = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPlaceIngredient(ING_RICE, LOC_PANTRY, initial);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    const next = r.newState;
    expect(computeOpenNumber(LOC_HAND, next)).toBe(1);
    expect(computeOpenNumber(LOC_PANTRY, next)).toBe(6);
    expect(computeOpenNumber(LOC_WOK, next)).toBe(3);
  });
});
