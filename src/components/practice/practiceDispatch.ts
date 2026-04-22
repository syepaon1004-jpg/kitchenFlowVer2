import type { KitchenModeAdapter, LegalAction } from '../../lib/kitchen-mode';

// F3: LegalAction ↔ Intent shape mismatch 복원 규칙.
//   - place: location_ref stub { kind: 'equipment', equipment_state_id: '' }
//            (practice adapter 가 location_ref 를 읽지 않음 → contract 만족용)
//   - action: location_ref = null (ActionIntent 가 null 허용)
//   - pour: source_location_key 가 LegalAction 에 없어 PourIntent 복원 불가 → dispatch 제외

// pure pick: place 또는 action 중 첫 항목. pour 뿐이면 null.
export function pickDispatchableLegalAction(
  legals: readonly LegalAction[],
): LegalAction | null {
  return legals.find((l) => l.kind === 'place' || l.kind === 'action') ?? null;
}

// pure dispatch: adapter try* 로 intent 전달. pour 는 no-op.
export function dispatchLegalAction(
  adapter: Pick<KitchenModeAdapter, 'tryPlaceIngredient' | 'tryPerformAction'>,
  action: LegalAction,
): void {
  if (action.kind === 'place') {
    adapter.tryPlaceIngredient({
      ingredient_id: action.ingredient_id,
      location_key: action.location_key,
      location_ref: { kind: 'equipment', equipment_state_id: '' },
    });
  } else if (action.kind === 'action') {
    adapter.tryPerformAction({
      action_type: action.action_type,
      location_key: action.location_key,
      location_ref: null,
    });
  }
  // pour: no dispatch (F3)
}
