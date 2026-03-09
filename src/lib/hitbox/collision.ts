import type { CollisionDetection, Collision } from '@dnd-kit/core';
import { pointInPolygon } from './pointInPolygon';
import type { AreaDefinition } from '../../types/db';

/**
 * 커스텀 collision detection.
 * - area 데이터가 있는 droppable: polygon이면 pointInPolygon, 아니면 bounding box 판별
 * - area 데이터가 없는 droppable (RightSidebar, Handbar 등): pointer가 rect 안에 있는지 판별
 */
export const polygonCollision: CollisionDetection = ({
  droppableContainers,
  pointerCoordinates,
}) => {
  if (!pointerCoordinates) return [];

  const collisions: Collision[] = [];

  for (const container of droppableContainers) {
    const node = container.node.current;
    if (!node) continue;

    const area = container.data.current?.area as AreaDefinition | undefined;

    if (area) {
      // 히트박스 기반 droppable: 컨테이너 DOM 기준 비율 좌표로 변환
      const rect = node.getBoundingClientRect();
      const relX = (pointerCoordinates.x - rect.left) / rect.width;
      const relY = (pointerCoordinates.y - rect.top) / rect.height;

      let hit = false;

      if (area.points && area.points.length >= 3) {
        hit = pointInPolygon([relX, relY], area.points);
      } else {
        // rectangle fallback: bounding box 판별
        hit =
          relX >= area.x &&
          relX <= area.x + area.w &&
          relY >= area.y &&
          relY <= area.y + area.h;
      }

      if (hit) {
        collisions.push({ id: container.id, data: { droppableContainer: container } });
      }
    } else {
      // 일반 droppable (RightSidebar, Handbar 등): pointer가 rect 안에 있는지
      const rect = node.getBoundingClientRect();
      const inside =
        pointerCoordinates.x >= rect.left &&
        pointerCoordinates.x <= rect.right &&
        pointerCoordinates.y >= rect.top &&
        pointerCoordinates.y <= rect.bottom;

      if (inside) {
        collisions.push({ id: container.id, data: { droppableContainer: container } });
      }
    }
  }

  // 면적 기준 오름차순 정렬: 작은 droppable(container-instance)이
  // 큰 droppable(right-sidebar)보다 우선 감지되도록 처리
  collisions.sort((a, b) => {
    const aNode = (a.data?.droppableContainer as any)?.node?.current as HTMLElement | null;
    const bNode = (b.data?.droppableContainer as any)?.node?.current as HTMLElement | null;
    const aRect = aNode?.getBoundingClientRect();
    const bRect = bNode?.getBoundingClientRect();
    const aArea = aRect ? aRect.width * aRect.height : Infinity;
    const bArea = bRect ? bRect.width * bRect.height : Infinity;
    return aArea - bArea;
  });

  return collisions;
};
