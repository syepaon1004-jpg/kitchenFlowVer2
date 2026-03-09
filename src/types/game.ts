// 뷰포트 시점 위치
export type ViewPosition = 'left' | 'center' | 'right';

// 드래그 중인 아이템 메타
export interface DragMeta {
  type: 'ingredient' | 'container' | 'equipment';
  sourceAreaId?: string;
  ingredientId?: string;
  ingredientInstanceId?: string;
  containerId?: string;
  containerInstanceId?: string;
  equipmentType?: string;
  equipmentStateId?: string;
  dragImageUrl?: string | null;
}
