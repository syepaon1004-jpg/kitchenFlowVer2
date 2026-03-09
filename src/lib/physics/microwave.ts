import type { MwStatus } from '../../types/db';

export interface MicrowaveState {
  mw_status: MwStatus;
  mw_remaining_sec: number;
}

export interface MicrowaveTickResult {
  mw_status: MwStatus;
  mw_remaining_sec: number;
}

export function tickMicrowavePhysics(state: MicrowaveState): MicrowaveTickResult {
  if (state.mw_status !== 'running') {
    return { mw_status: state.mw_status, mw_remaining_sec: state.mw_remaining_sec };
  }

  const newRemaining = state.mw_remaining_sec - 1;

  if (newRemaining <= 0) {
    return { mw_status: 'done', mw_remaining_sec: 0 };
  }

  return { mw_status: 'running', mw_remaining_sec: newRemaining };
}

/** running일 때만 microwave 누적 */
export function canAccumulateMicrowave(mw_status: MwStatus): boolean {
  return mw_status === 'running';
}
