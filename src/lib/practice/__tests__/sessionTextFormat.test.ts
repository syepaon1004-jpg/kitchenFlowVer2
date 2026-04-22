import { describe, it, expect } from 'vitest';
import {
  formatLegalAction,
  formatFriendlyAction,
  pickRepresentativeAction,
} from '../sessionTextFormat';
import type { LegalAction } from '../engine';

describe('formatLegalAction', () => {
  it('formats place action', () => {
    const action: LegalAction = {
      type: 'place',
      ingredientId: 'ing-001',
      targetLocationId: 'loc-wok',
    };
    expect(formatLegalAction(action)).toBe('[배치] ing-001 → loc-wok');
  });

  it('formats action action', () => {
    const action: LegalAction = {
      type: 'action',
      actionType: 'fry',
      locationId: 'loc-wok',
    };
    expect(formatLegalAction(action)).toBe('[실행] fry @ loc-wok');
  });

  it('formats pour action', () => {
    const action: LegalAction = {
      type: 'pour',
      sourceLocationId: 'loc-pan',
      targetLocationId: 'loc-plate',
    };
    expect(formatLegalAction(action)).toBe('[이동] loc-pan → loc-plate');
  });
});

describe('formatFriendlyAction', () => {
  const ingredientNames: ReadonlyMap<string, string> = new Map([
    ['ing-egg', '달걀'],
    ['ing-oil', '식용유'],
  ]);
  const locationLabels: ReadonlyMap<string, string> = new Map([
    ['loc-wok', '웍'],
    ['loc-plate', '접시'],
    ['loc-pan', '팬'],
  ]);

  it('formats place action with friendly names', () => {
    const action: LegalAction = {
      type: 'place',
      ingredientId: 'ing-egg',
      targetLocationId: 'loc-wok',
    };
    expect(formatFriendlyAction(action, ingredientNames, locationLabels))
      .toBe('달걀을(를) 웍에 배치');
  });

  it('formats action action with friendly names', () => {
    const action: LegalAction = {
      type: 'action',
      actionType: 'fry',
      locationId: 'loc-wok',
    };
    expect(formatFriendlyAction(action, ingredientNames, locationLabels))
      .toBe('웍에서 볶기');
  });

  it('formats pour action with friendly names', () => {
    const action: LegalAction = {
      type: 'pour',
      sourceLocationId: 'loc-pan',
      targetLocationId: 'loc-plate',
    };
    expect(formatFriendlyAction(action, ingredientNames, locationLabels))
      .toBe('팬에서 접시(으)로 이동');
  });

  it('falls back to raw ID when ingredient name is missing', () => {
    const action: LegalAction = {
      type: 'place',
      ingredientId: 'ing-unknown',
      targetLocationId: 'loc-wok',
    };
    expect(formatFriendlyAction(action, ingredientNames, locationLabels))
      .toBe('ing-unknown을(를) 웍에 배치');
  });

  it('falls back to raw ID when location label is missing', () => {
    const action: LegalAction = {
      type: 'action',
      actionType: 'boil',
      locationId: 'loc-unknown',
    };
    expect(formatFriendlyAction(action, ingredientNames, locationLabels))
      .toBe('loc-unknown에서 끓이기');
  });

  it('formats all action types correctly', () => {
    const stir: LegalAction = { type: 'action', actionType: 'stir', locationId: 'loc-wok' };
    const microwave: LegalAction = { type: 'action', actionType: 'microwave', locationId: 'loc-wok' };
    expect(formatFriendlyAction(stir, ingredientNames, locationLabels)).toBe('웍에서 저어주기');
    expect(formatFriendlyAction(microwave, ingredientNames, locationLabels)).toBe('웍에서 전자레인지');
  });
});

describe('pickRepresentativeAction', () => {
  it('returns null for empty array', () => {
    expect(pickRepresentativeAction([])).toBeNull();
  });

  it('returns the single action for single-element array', () => {
    const action: LegalAction = { type: 'action', actionType: 'fry', locationId: 'loc-wok' };
    expect(pickRepresentativeAction([action])).toBe(action);
  });

  it('returns the first action for multi-element array', () => {
    const first: LegalAction = { type: 'place', ingredientId: 'ing-1', targetLocationId: 'loc-1' };
    const second: LegalAction = { type: 'action', actionType: 'stir', locationId: 'loc-2' };
    const third: LegalAction = { type: 'pour', sourceLocationId: 'loc-1', targetLocationId: 'loc-3' };
    expect(pickRepresentativeAction([first, second, third])).toBe(first);
  });
});
