import { useDraggable } from '@dnd-kit/core';
import type { AreaDefinition } from '../../types/db';
import { polygonClipPath } from '../../lib/hitbox/polygonClipPath';

interface Props {
  area: AreaDefinition;
  fillParent?: boolean;
}

/**
 * ingredient/container 히트박스의 드래그 감지용 투명 HTML div.
 * bounding box (x/y/w/h) 기준으로 위치·크기 설정.
 * polygon 정확도는 collision.ts의 pointInPolygon이 담당.
 */
export default function DraggableHitbox({ area, fillParent }: Props) {
  const draggableId =
    area.area_type === 'ingredient'
      ? `ingredient-area-${area.id}`
      : `container-area-${area.id}`;

  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: draggableId,
    data: {
      type: area.area_type as 'ingredient' | 'container',
      ingredientId: area.ingredient_id,
      containerId: area.container_id,
      sourceAreaId: area.id,
      dragImageUrl: area.drag_image_url || area.overlay_image_url,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={fillParent ? {
        position: 'absolute',
        inset: 0,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0 : 1,
        background: 'transparent',
        touchAction: 'none',
      } : {
        position: 'absolute',
        left: `${area.x * 100}%`,
        top: `${area.y * 100}%`,
        width: `${area.w * 100}%`,
        height: `${area.h * 100}%`,
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0 : 1,
        background: 'transparent',
        touchAction: 'none',
        clipPath: area.overlay_image_url ? undefined : polygonClipPath(area),
      }}
    />
  );
}
