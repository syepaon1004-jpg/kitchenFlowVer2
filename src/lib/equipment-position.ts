/**
 * 장비 위치 스타일 계산 (렌더 레벨 보장).
 * height <= 1: 기존 동작 유지 (top = y * 100%)
 * height > 1: bottom-anchor 정책 — y값을 무시하고 항상 bottom: 0으로 바닥 고정, 위로 넘침
 *
 * 이 함수가 렌더 최종 관문이므로, DB에 y > 0인 oversized 장비가 있어도
 * 화면에서는 반드시 위로 넘치게 된다.
 */
export function getEquipmentPositionStyle(
  y: number,
  height: number,
): { top?: string; bottom?: string; height: string } {
  if (height <= 1) {
    return { top: `${y * 100}%`, height: `${height * 100}%` };
  }
  return {
    bottom: '0%',
    height: `${height * 100}%`,
  };
}

/**
 * oversized 장비용 y값 정규화.
 * height > 1이면 y=0 고정 (바닥 기준).
 */
export function normalizeOversizedY(y: number, height: number): number {
  if (height > 1) return 0;
  return y;
}

/** 장비 height 전용 클램프. width/item size(clampSize)와 분리. */
export function clampEquipmentHeight(v: number): number {
  return Math.max(0.001, Math.min(2, v));
}
