import { describe, it, expect, vi } from 'vitest';
import {
  pickDispatchableLegalAction,
  dispatchLegalAction,
} from '../practiceDispatch';
import type {
  KitchenModeAdapter,
  LegalAction,
  ActionResult,
} from '../../../lib/kitchen-mode';

// F3 drift guard: LegalAction 필드가 adapter try* Intent shape 으로
// 올바르게 복원되는지 순수 로직 기준 검증.

function makeDispatchAdapterMock(): Pick<
  KitchenModeAdapter,
  'tryPlaceIngredient' | 'tryPerformAction'
> & {
  tryPlaceIngredient: ReturnType<typeof vi.fn>;
  tryPerformAction: ReturnType<typeof vi.fn>;
} {
  const allowOk: ActionResult = { ok: true, effects: [] };
  return {
    tryPlaceIngredient: vi.fn(() => allowOk),
    tryPerformAction: vi.fn(() => allowOk),
  };
}

describe('pickDispatchableLegalAction (F3)', () => {
  it('빈 배열 → null', () => {
    expect(pickDispatchableLegalAction([])).toBeNull();
  });

  it('place 만 있으면 그 place 를 반환', () => {
    const legal: LegalAction = {
      kind: 'place',
      ingredient_id: 'ing-1',
      location_key: 'wok_1',
      step_no: 1,
      node_id: 'node-1',
    };
    expect(pickDispatchableLegalAction([legal])).toBe(legal);
  });

  it('action 만 있으면 그 action 을 반환', () => {
    const legal: LegalAction = {
      kind: 'action',
      action_type: 'stir',
      location_key: 'wok_1',
      step_no: 2,
      node_id: 'node-2',
    };
    expect(pickDispatchableLegalAction([legal])).toBe(legal);
  });

  it('pour 만 있으면 null (F3: pour 는 dispatch 대상 제외)', () => {
    const legal: LegalAction = {
      kind: 'pour',
      source_location_ref: { kind: 'container', container_instance_id: 'src-id' },
      destination_location_key: 'plate_1',
      payload_node_ids: ['node-3'],
    };
    expect(pickDispatchableLegalAction([legal])).toBeNull();
  });

  it('pour 다음 place 가 있으면 place 를 선택(순회 우선)', () => {
    const pourL: LegalAction = {
      kind: 'pour',
      source_location_ref: { kind: 'container', container_instance_id: 'src-id' },
      destination_location_key: 'plate_1',
      payload_node_ids: [],
    };
    const placeL: LegalAction = {
      kind: 'place',
      ingredient_id: 'ing-2',
      location_key: 'wok_1',
      step_no: 1,
      node_id: 'node-10',
    };
    expect(pickDispatchableLegalAction([pourL, placeL])).toBe(placeL);
  });
});

describe('dispatchLegalAction (F3 drift guard)', () => {
  it('place → tryPlaceIngredient 호출, ingredient_id/location_key passthrough + stub location_ref', () => {
    const adapter = makeDispatchAdapterMock();
    const legal: LegalAction = {
      kind: 'place',
      ingredient_id: 'ing-1',
      location_key: 'wok_1',
      step_no: 1,
      node_id: 'node-1',
    };
    dispatchLegalAction(adapter, legal);
    expect(adapter.tryPlaceIngredient).toHaveBeenCalledTimes(1);
    expect(adapter.tryPlaceIngredient).toHaveBeenCalledWith({
      ingredient_id: 'ing-1',
      location_key: 'wok_1',
      location_ref: { kind: 'equipment', equipment_state_id: '' },
    });
    expect(adapter.tryPerformAction).not.toHaveBeenCalled();
  });

  it('action → tryPerformAction 호출, action_type/location_key passthrough + location_ref null', () => {
    const adapter = makeDispatchAdapterMock();
    const legal: LegalAction = {
      kind: 'action',
      action_type: 'stir',
      location_key: 'wok_1',
      step_no: 2,
      node_id: 'node-2',
    };
    dispatchLegalAction(adapter, legal);
    expect(adapter.tryPerformAction).toHaveBeenCalledTimes(1);
    expect(adapter.tryPerformAction).toHaveBeenCalledWith({
      action_type: 'stir',
      location_key: 'wok_1',
      location_ref: null,
    });
    expect(adapter.tryPlaceIngredient).not.toHaveBeenCalled();
  });

  it('pour → try* 어느 것도 호출하지 않음 (F3)', () => {
    const adapter = makeDispatchAdapterMock();
    const legal: LegalAction = {
      kind: 'pour',
      source_location_ref: { kind: 'container', container_instance_id: 'src-id' },
      destination_location_key: 'plate_1',
      payload_node_ids: ['node-3', 'node-4'],
    };
    dispatchLegalAction(adapter, legal);
    expect(adapter.tryPlaceIngredient).not.toHaveBeenCalled();
    expect(adapter.tryPerformAction).not.toHaveBeenCalled();
  });
});
