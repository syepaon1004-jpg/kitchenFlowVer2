import type { WokStatus } from '../../types/db';

export interface WokState {
  wok_temp: number;
  wok_status: WokStatus;
  burner_level: 0 | 1 | 2 | 3;
  hasWater: boolean;
}

export interface WokTickResult {
  wok_temp: number;
  wok_status: WokStatus;
}

const BURNER_HEAT_RATE: Record<0 | 1 | 2 | 3, number> = {
  0: 0,
  1: 5,
  2: 10,
  3: 20,
};
const NATURAL_COOLING = 3;
const OVERHEAT_THRESHOLD = 250;
const BURNED_THRESHOLD = 350;

export function tickWokPhysics(state: WokState): WokTickResult {
  const { wok_temp, wok_status, burner_level, hasWater } = state;

  // burned는 터미널 상태 — 온도 변화 없음
  if (wok_status === 'burned') {
    return { wok_temp, wok_status: 'burned' };
  }

  let newTemp = Math.max(0, wok_temp + BURNER_HEAT_RATE[burner_level] - NATURAL_COOLING);

  if (hasWater) {
    // 물이 있으면 100도 상한, overheating/burned 전환 없음
    newTemp = Math.min(newTemp, 100);
    return { wok_temp: newTemp, wok_status };
  }

  // 온도 초과 시 상태 전이 (dirty 포함 모든 상태에서 적용)
  if (newTemp > BURNED_THRESHOLD) {
    return { wok_temp: newTemp, wok_status: 'burned' };
  }
  if (newTemp > OVERHEAT_THRESHOLD) {
    return { wok_temp: newTemp, wok_status: 'overheating' };
  }

  // 임계값 미만 → 현재 상태 유지 (clean→clean, dirty→dirty)
  return { wok_temp: newTemp, wok_status };
}

/** clean + burner_level > 0일 때만 stir 누적 */
export function canAccumulateStir(
  wok_status: WokStatus,
  burner_level: 0 | 1 | 2 | 3,
): boolean {
  return wok_status === 'clean' && burner_level > 0;
}
