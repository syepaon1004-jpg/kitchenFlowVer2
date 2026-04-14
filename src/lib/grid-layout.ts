import type { GridCell } from '../types/game';

/** 최소 track 비율 (선이 겹치지 않도록) */
export const MIN_TRACK_RATIO = 0.05;

/** ratios를 합계 1로 정규화. undefined/길이 불일치 → 균등 분배. */
export function normalizeTracks(ratios: number[] | undefined, count: number): number[] {
  if (!ratios || ratios.length !== count) {
    return Array.from({ length: count }, () => 1 / count);
  }
  const sum = ratios.reduce((a, b) => a + b, 0);
  if (sum <= 0) return Array.from({ length: count }, () => 1 / count);
  return ratios.map((r) => r / sum);
}

/** 누적 오프셋 배열 반환: [0, r0, r0+r1, ..., 1.0]. length = ratios.length + 1. */
export function cumulativeOffsets(normalized: number[]): number[] {
  const offsets = [0];
  for (let i = 0; i < normalized.length; i++) {
    offsets.push(offsets[i] + normalized[i]);
  }
  offsets[offsets.length - 1] = 1;
  return offsets;
}

/** 0..1 정규화 좌표로 셀 사각형 계산 */
export function cellRect(
  cell: GridCell,
  rowRatios: number[] | undefined,
  colRatios: number[] | undefined,
  rows: number,
  cols: number,
): { left: number; top: number; width: number; height: number } {
  const rNorm = normalizeTracks(rowRatios, rows);
  const cNorm = normalizeTracks(colRatios, cols);
  const rOff = cumulativeOffsets(rNorm);
  const cOff = cumulativeOffsets(cNorm);

  return {
    left: cOff[cell.col],
    top: rOff[cell.row],
    width: cOff[cell.col + cell.colSpan] - cOff[cell.col],
    height: rOff[cell.row + cell.rowSpan] - rOff[cell.row],
  };
}

/** 정규화된 ratios → CSS grid-template 문자열 (예: "0.3fr 0.7fr") */
export function ratiosToGridTemplate(ratios: number[]): string {
  return ratios.map((r) => `${r}fr`).join(' ');
}

/** 행/열 추가·삭제 시 비례 재분배. undefined → undefined (균등 유지). */
export function resizeRatios(
  oldRatios: number[] | undefined,
  oldCount: number,
  newCount: number,
): number[] | undefined {
  if (newCount === oldCount) return oldRatios;
  if (!oldRatios) return undefined;
  const norm = normalizeTracks(oldRatios, oldCount);
  if (newCount > oldCount) {
    const addCount = newCount - oldCount;
    const avgSize = 1 / newCount;
    const totalNew = avgSize * addCount;
    const scale = 1 - totalNew;
    const result = norm.map((r) => r * scale);
    for (let i = 0; i < addCount; i++) result.push(avgSize);
    return result;
  } else {
    const kept = norm.slice(0, newCount);
    const keptSum = kept.reduce((a, b) => a + b, 0);
    return kept.map((r) => r / keptSum);
  }
}
