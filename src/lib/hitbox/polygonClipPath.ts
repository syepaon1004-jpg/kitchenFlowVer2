import type { AreaDefinition, HitboxPoint } from '../../types/db';

/**
 * polygon points(parent 기준 0~1 비율좌표)를
 * bounding-box div 기준 CSS clip-path: polygon(...) 문자열로 변환.
 *
 * 반환값 예: "polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)"
 * points가 없거나 3개 미만이면 undefined 반환 (clip-path 불필요).
 */
export function polygonClipPath(area: AreaDefinition): string | undefined {
  if (!area.points || area.points.length < 3) return undefined;

  const coords = area.points
    .map(([px, py]: HitboxPoint) => {
      const clipX = ((px - area.x) / area.w) * 100;
      const clipY = ((py - area.y) / area.h) * 100;
      return `${clipX}% ${clipY}%`;
    })
    .join(', ');

  return `polygon(${coords})`;
}
