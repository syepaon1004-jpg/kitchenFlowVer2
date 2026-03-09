import type { BasketStatus } from '../../types/db';

/** basket_status === 'down'일 때만 fry 누적 */
export function canAccumulateFry(basket_status: BasketStatus): boolean {
  return basket_status === 'down';
}
