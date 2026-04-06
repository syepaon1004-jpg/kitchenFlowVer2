import { useCallback } from 'react';
import { useSelectionStore } from '../stores/selectionStore';
import { resolveAction } from '../lib/interaction/resolveAction';
import type { ClickTarget, ResolvedAction } from '../types/game';

interface UseClickInteractionOptions {
  /** 재료 ID → 표시명 변환 */
  getIngredientLabel?: (id: string) => string;
  /** 그릇 ID → 표시명 변환 */
  getContainerLabel?: (id: string) => string;
  /** resolveAction이 반환한 비즈니스 액션 위임 */
  onAction?: (action: ResolvedAction) => void;
}

export function useClickInteraction(options: UseClickInteractionOptions = {}) {
  const selection = useSelectionStore((s) => s.selection);
  const select = useSelectionStore((s) => s.select);
  const deselect = useSelectionStore((s) => s.deselect);

  const handleSceneClick = useCallback((target: ClickTarget) => {
    const action = resolveAction(selection, target);
    if (!action) return;

    switch (action.type) {
      case 'select': {
        let sourceLabel = action.sourceLabel ?? '';

        // 라벨 변환: resolveAction은 ID만 전달, 여기서 실제 라벨로 교체
        if (action.selectionType === 'ingredient' && action.ingredientId) {
          sourceLabel = options.getIngredientLabel?.(action.ingredientId) ?? action.ingredientId;
        } else if (action.selectionType === 'container' && action.containerId) {
          sourceLabel = options.getContainerLabel?.(action.containerId) ?? action.containerId;
        }

        select({
          type: action.selectionType!,
          ingredientId: action.ingredientId,
          instanceId: action.instanceId,
          containerId: action.containerId,
          containerInstanceId: action.containerInstanceId,
          equipmentStateId: action.equipmentStateId,
          sourceEquipmentId: action.sourceEquipmentId,
          sourceLabel,
        });
        break;
      }

      case 'deselect':
        deselect();
        break;

      case 'toggle-equipment':
        // toggle-equipment는 GameKitchenView 내부에서 자체 처리
        break;

      case 'add-ingredient':
        options.onAction?.(action);
        // 선택 유지 — 소스 소진 시 deselect는 GamePage doTransfer에서 처리
        break;

      case 'pour':
      case 'place-container':
      case 'move-container':
      case 'merge-containers':
      case 'dispose':
        options.onAction?.(action);
        deselect();
        break;

      default:
        break;
    }
  }, [selection, select, deselect, options]);

  return { selection, handleSceneClick, deselect };
}
