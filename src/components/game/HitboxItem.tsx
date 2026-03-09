import type { AreaDefinition } from '../../types/db';

interface Props {
  area: AreaDefinition;
  fillParent?: boolean;
  /** viewBox 너비 (fillParent=false 시 사용, 기본 1000) */
  vbW?: number;
  /** viewBox 높이 (fillParent=false 시 사용, 기본 1000) */
  vbH?: number;
}

/** SVG 시각 렌더링 전용. 이벤트 처리 없음 (pointerEvents: none은 부모 SVG에서 설정). */
export default function HitboxItem({ area, fillParent, vbW: _vbW, vbH: _vbH }: Props) {
  // fillParent=true이면 항상 1000 고정 (0,0에서 전체를 채우므로 값 무관)
  const vbW = fillParent ? 1000 : (_vbW ?? 1000);
  const vbH = fillParent ? 1000 : (_vbH ?? 1000);

  // overlay_image_url이 있으면 이미지로 렌더링 (points 무시, x/y/w/h 사용)
  if (area.overlay_image_url) {
    return (
      <image
        href={area.overlay_image_url}
        x={fillParent ? 0 : area.x * vbW}
        y={fillParent ? 0 : area.y * vbH}
        width={fillParent ? 1000 : area.w * vbW}
        height={fillParent ? 1000 : area.h * vbH}
        preserveAspectRatio="none"
      />
    );
  }

  const isPolygon = area.points != null && area.points.length >= 3;

  if (isPolygon && !fillParent) {
    return (
      <polygon
        points={area.points!.map(([x, y]) => `${x * vbW},${y * vbH}`).join(' ')}
        fill="transparent"
        stroke="none"
      />
    );
  }

  return (
    <rect
      x={fillParent ? 0 : area.x * vbW}
      y={fillParent ? 0 : area.y * vbH}
      width={fillParent ? 1000 : area.w * vbW}
      height={fillParent ? 1000 : area.h * vbH}
      fill="transparent"
      stroke="none"
    />
  );
}
