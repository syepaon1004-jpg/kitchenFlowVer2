import { describe, it, expect } from 'vitest';
import { FIXTURE_MENU_BUNDLE } from '../../fixtures';
import {
  bootstrapEngineState,
  computeLegalActions,
  tryPlaceIngredient,
  tryPour,
} from '..';
import type { LegalAction } from '..';

const LOC_FRIDGE = '20000000-0000-0000-0000-00000000000a';
const LOC_PANTRY = '20000000-0000-0000-0000-00000000000b';
const LOC_HAND = '20000000-0000-0000-0000-00000000000c';
const LOC_WOK = '20000000-0000-0000-0000-00000000000d';

const ING_RICE = '40000000-0000-0000-0000-000000000001';
const ING_EGG = '40000000-0000-0000-0000-000000000002';
const ING_SESAME = '40000000-0000-0000-0000-000000000003';

function hasPlace(list: LegalAction[], ingredientId: string, loc: string): boolean {
  return list.some(
    (a) =>
      a.type === 'place' &&
      a.ingredientId === ingredientId &&
      a.targetLocationId === loc,
  );
}
function hasAction(list: LegalAction[], actionType: string, loc: string): boolean {
  return list.some(
    (a) => a.type === 'action' && a.actionType === actionType && a.locationId === loc,
  );
}
function hasPour(list: LegalAction[], src: string, tgt: string): boolean {
  return list.some(
    (a) => a.type === 'pour' && a.sourceLocationId === src && a.targetLocationId === tgt,
  );
}

describe('computeLegalActions', () => {
  it('(17) bootstrap 직후: 정확히 3개 엔트리 (rice@pantry, egg@fridge, fry@wok), nodeId 키 없음', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const legals = computeLegalActions(state);
    expect(legals).toHaveLength(3);
    expect(hasPlace(legals, ING_RICE, LOC_PANTRY)).toBe(true);
    expect(hasPlace(legals, ING_EGG, LOC_FRIDGE)).toBe(true);
    expect(hasAction(legals, 'fry', LOC_WOK)).toBe(true);
    for (const entry of legals) {
      expect('nodeId' in entry).toBe(false);
    }
  });

  it('(18) 분기 허용: place(rice, pantry) 후 4개 브랜치 동시 노출', () => {
    const state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    const legals = computeLegalActions(r.newState);
    expect(hasPlace(legals, ING_RICE, LOC_HAND)).toBe(true);
    expect(hasPlace(legals, ING_EGG, LOC_FRIDGE)).toBe(true);
    expect(hasPlace(legals, ING_SESAME, LOC_PANTRY)).toBe(true);
    expect(hasAction(legals, 'fry', LOC_WOK)).toBe(true);
  });

  it('(20) deco-first gate: deco terminal place는 base 없을 때 enumerate에서 제외', () => {
    const LOC_WOK_ID = LOC_WOK;
    const NODE_SESAME = '30000000-0000-0000-0000-000000000006';
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    // 중간 node들 satisfied + sesame current_required=plate, plate에 non-deco base 없음 상태.
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
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
        { node_id: '30000000-0000-0000-0000-000000000001', actual_location_id: LOC_WOK_ID, current_required_location_id: LOC_WOK_ID, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000002', actual_location_id: LOC_WOK_ID, current_required_location_id: LOC_WOK_ID, is_satisfied: true },
        { node_id: '30000000-0000-0000-0000-000000000004', actual_location_id: LOC_WOK_ID, current_required_location_id: LOC_WOK_ID, is_satisfied: true },
        { node_id: NODE_SESAME, actual_location_id: LOC_HAND, current_required_location_id: '20000000-0000-0000-0000-00000000000e' /* plate */, is_satisfied: false },
      ],
    };
    const legals = computeLegalActions(fake);
    const placesAtPlate = legals.filter((a) => a.type === 'place' && a.targetLocationId === '20000000-0000-0000-0000-00000000000e');
    // plate에 deco base가 없으므로 sesame place(plate) 는 enumerate되지 않아야 함.
    expect(placesAtPlate.length).toBe(0);
  });

  it('(21) §14.4 empty-payload pour가 enumerate에 포함 + tryPour와 1:1 일치', () => {
    const base = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    // pantry에 rice satisfied physical payload, wok는 fry 열려 있음.
    const fake: typeof base = {
      ...base,
      node_progress: base.node_progress.map((p) => {
        const unsatActionIds = new Set([
          '30000000-0000-0000-0000-000000000003', // fry
          '30000000-0000-0000-0000-000000000005', // stir
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
    const legals = computeLegalActions(fake);
    const pourPantryToWok = legals.find(
      (a) => a.type === 'pour' && a.sourceLocationId === LOC_PANTRY && a.targetLocationId === LOC_WOK,
    );
    expect(pourPantryToWok).toBeDefined();
    // tryPour 재호출해 동일 admissibility 확인.
    const r = tryPour(LOC_PANTRY, LOC_WOK, fake);
    expect(r.allowed).toBe(true);
    if (!r.allowed) return;
    expect(r.committedNodeIds).toEqual([]);
  });

  it('(19) pour 엔트리 게이팅: place(rice)만 했을 땐 미노출, place(sesame) 추가 후 정확히 1건', () => {
    let state = bootstrapEngineState(FIXTURE_MENU_BUNDLE);
    const r1 = tryPlaceIngredient(ING_RICE, LOC_PANTRY, state);
    expect(r1.allowed).toBe(true);
    if (!r1.allowed) return;
    state = r1.newState;
    const legalsBefore = computeLegalActions(state);
    expect(hasPour(legalsBefore, LOC_PANTRY, LOC_HAND)).toBe(false);

    const r2 = tryPlaceIngredient(ING_SESAME, LOC_PANTRY, state);
    expect(r2.allowed).toBe(true);
    if (!r2.allowed) return;
    state = r2.newState;
    const legalsAfter = computeLegalActions(state);
    const pourEntries = legalsAfter.filter((a) => a.type === 'pour');
    expect(pourEntries).toHaveLength(1);
    expect(hasPour(legalsAfter, LOC_PANTRY, LOC_HAND)).toBe(true);
  });
});
