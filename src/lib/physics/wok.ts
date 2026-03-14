import type { WokStatus } from '../../types/db';

export interface WokState {
  wok_temp: number;
  wok_status: WokStatus;
  burner_level: 0 | 1 | 2 | 3;
  hasWater: boolean;
  pre_overheat_status: WokStatus | null;
}

export interface WokTickResult {
  wok_temp: number;
  wok_status: WokStatus;
  pre_overheat_status: WokStatus | null;
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
  const { wok_temp, wok_status, burner_level, hasWater, pre_overheat_status } = state;

  // burned는 터미널 상태 — 온도 변화 없음
  if (wok_status === 'burned') {
    return { wok_temp, wok_status: 'burned', pre_overheat_status: null };
  }

  let newTemp = Math.max(0, wok_temp + BURNER_HEAT_RATE[burner_level] - NATURAL_COOLING);

  if (hasWater) {
    // 물이 있으면 100도 상한, overheating/burned 전환 없음
    newTemp = Math.min(newTemp, 100);
    return { wok_temp: newTemp, wok_status, pre_overheat_status };
  }

  // 온도 초과 시 상태 전이 (dirty 포함 모든 상태에서 적용)
  if (newTemp > BURNED_THRESHOLD) {
    return { wok_temp: newTemp, wok_status: 'burned', pre_overheat_status: null };
  }
  if (newTemp > OVERHEAT_THRESHOLD) {
    // 새 진입: 현재 상태를 기억 / 이미 overheating: 기존 값 유지
    const saved = wok_status !== 'overheating' ? wok_status : pre_overheat_status;
    return { wok_temp: newTemp, wok_status: 'overheating', pre_overheat_status: saved };
  }

  // 임계값 미만: overheating이면 진입 전 상태로 복귀
  if (wok_status === 'overheating' && pre_overheat_status) {
    return { wok_temp: newTemp, wok_status: pre_overheat_status, pre_overheat_status: null };
  }

  return { wok_temp: newTemp, wok_status, pre_overheat_status };
}

/** clean 또는 overheating + burner_level > 0일 때 stir 누적 */
export function canAccumulateStir(
  wok_status: WokStatus,
  burner_level: 0 | 1 | 2 | 3,
): boolean {
  return (wok_status === 'clean' || wok_status === 'overheating') && burner_level > 0;
}
