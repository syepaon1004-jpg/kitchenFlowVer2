// TEXT-FIRST FALLBACK — adapter MUST NOT import from here.
// Gate B Axis 3: formatLegalAction / formatFriendlyAction / pickRepresentativeAction /
// ACTION_TYPE_LABELS는 shared-kitchen 최종 자산 미승인. PracticeSessionPage fallback +
// PracticeAdminPage preview 한정 사용.

import type { LegalAction } from './engine';
import type { PracticeActionType } from '../../types/practice';

export type GuideIntensity = 'off' | 'hint' | 'full';

export const ACTION_TYPE_LABELS: Record<PracticeActionType, string> = {
  fry: '볶기',
  stir: '저어주기',
  microwave: '전자레인지',
  boil: '끓이기',
};

export function formatLegalAction(action: LegalAction): string {
  switch (action.type) {
    case 'place':
      return `[배치] ${action.ingredientId} → ${action.targetLocationId}`;
    case 'action':
      return `[실행] ${action.actionType} @ ${action.locationId}`;
    case 'pour':
      return `[이동] ${action.sourceLocationId} → ${action.targetLocationId}`;
  }
}

export function formatFriendlyAction(
  action: LegalAction,
  ingredientNames: ReadonlyMap<string, string>,
  locationLabels: ReadonlyMap<string, string>,
): string {
  switch (action.type) {
    case 'place': {
      const name = ingredientNames.get(action.ingredientId) ?? action.ingredientId;
      const loc = locationLabels.get(action.targetLocationId) ?? action.targetLocationId;
      return `${name}을(를) ${loc}에 배치`;
    }
    case 'action': {
      const loc = locationLabels.get(action.locationId) ?? action.locationId;
      const label = ACTION_TYPE_LABELS[action.actionType];
      return `${loc}에서 ${label}`;
    }
    case 'pour': {
      const src = locationLabels.get(action.sourceLocationId) ?? action.sourceLocationId;
      const tgt = locationLabels.get(action.targetLocationId) ?? action.targetLocationId;
      return `${src}에서 ${tgt}(으)로 이동`;
    }
  }
}

export function pickRepresentativeAction(
  actions: readonly LegalAction[],
): LegalAction | null {
  return actions.length > 0 ? actions[0] : null;
}
