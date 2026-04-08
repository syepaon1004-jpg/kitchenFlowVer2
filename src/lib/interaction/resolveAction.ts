import type { SelectionState, ClickTarget, ResolvedAction } from '../../types/game';

/**
 * 순수 함수: 현재 선택 상태 × 클릭 대상 → 수행할 액션 결정
 * 스토어 접근 없음, 부작용 없음
 */
export function resolveAction(
  currentSelection: SelectionState | null,
  target: ClickTarget,
): ResolvedAction | null {
  // ——— 선택 해제 조건 ———

  // 빈 영역 또는 HUD 영역 클릭 → 선택 해제
  if (target.type === 'empty-area' || target.type === 'hud-area') {
    if (currentSelection) return { type: 'deselect' };
    return null;
  }

  // 장비 토글 (서랍/냉장고/바구니) — 선택 상태와 무관하게 항상 토글
  if (target.type === 'equipment-toggle') {
    return {
      type: 'toggle-equipment',
      equipmentId: target.equipmentId,
      equipmentType: target.equipmentType,
    };
  }

  // 서빙 버튼: 선택 상태와 무관하게 항상 서빙 처리
  if (target.type === 'serve-button') {
    if (!target.orderId) return null;
    return { type: 'serve-order', orderId: target.orderId };
  }

  // ——— 선택 없는 상태 ———

  if (!currentSelection) {
    switch (target.type) {
      case 'ingredient-source':
        return {
          type: 'select',
          selectionType: 'ingredient',
          ingredientId: target.ingredientId,
          sourceEquipmentId: target.equipmentId,
          sourceLabel: target.ingredientId, // 훅에서 실제 라벨로 교체
        };

      case 'container-source':
        return {
          type: 'select',
          selectionType: 'container',
          containerId: target.containerId,
          sourceLabel: target.containerId, // 훅에서 실제 라벨로 교체
        };

      case 'hologram':
        return {
          type: 'select',
          selectionType: 'wok-content',
          equipmentStateId: target.equipmentStateId,
          sourceEquipmentId: target.equipmentId,
        };

      case 'placed-container':
        return {
          type: 'select',
          selectionType: 'placed-container',
          containerInstanceId: target.containerInstanceId,
        };

      default:
        return null;
    }
  }

  // ——— 선택 있는 상태: 같은 오브젝트 재클릭 → 해제 ———

  if (isSameTarget(currentSelection, target)) {
    return { type: 'deselect' };
  }

  // ——— 선택 있는 상태: 액션 매트릭스 ———

  switch (currentSelection.type) {
    case 'ingredient':
      if (target.type === 'hologram') {
        return {
          type: 'add-ingredient',
          ingredientId: currentSelection.ingredientId,
          instanceId: currentSelection.instanceId,
          sourceEquipmentId: currentSelection.sourceEquipmentId,
          destination: { locationType: 'equipment', equipmentId: target.equipmentId },
        };
      }
      if (target.type === 'placed-container') {
        return {
          type: 'add-ingredient',
          ingredientId: currentSelection.ingredientId,
          instanceId: currentSelection.instanceId,
          sourceEquipmentId: currentSelection.sourceEquipmentId,
          destination: { locationType: 'container', containerInstanceId: target.containerInstanceId },
        };
      }
      if (target.type === 'handbar') {
        return {
          type: 'add-ingredient',
          ingredientId: currentSelection.ingredientId,
          instanceId: currentSelection.instanceId,
          sourceEquipmentId: currentSelection.sourceEquipmentId,
          destination: { locationType: 'hand' },
        };
      }
      return { type: 'deselect' };

    case 'container':
      if (target.type === 'worktop' || target.type === 'burner') {
        return {
          type: 'place-container',
          containerId: currentSelection.containerId,
          equipmentId: target.equipmentId,
          localRatio: target.localRatio,
        };
      }
      return { type: 'deselect' };

    case 'wok-content':
      if (target.type === 'placed-container') {
        return {
          type: 'pour',
          source: {
            locationType: 'equipment',
            equipmentStateId: currentSelection.equipmentStateId,
          },
          destination: {
            locationType: 'container',
            containerInstanceId: target.containerInstanceId,
          },
        };
      }
      if (target.type === 'sink') {
        if (!currentSelection.equipmentStateId || !target.equipmentId) return { type: 'deselect' };
        return {
          type: 'move-wok-to-sink',
          equipmentStateId: currentSelection.equipmentStateId,
          equipmentId: target.equipmentId,
        };
      }
      return { type: 'deselect' };

    case 'placed-container':
      if (target.type === 'hologram') {
        return {
          type: 'pour',
          source: {
            locationType: 'container',
            containerInstanceId: currentSelection.containerInstanceId,
          },
          destination: {
            locationType: 'equipment',
            equipmentId: target.equipmentId,
          },
        };
      }
      if (target.type === 'placed-container') {
        return {
          type: 'pour',
          source: {
            locationType: 'container',
            containerInstanceId: currentSelection.containerInstanceId,
          },
          destination: {
            locationType: 'container',
            containerInstanceId: target.containerInstanceId,
          },
        };
      }
      if (target.type === 'worktop' || target.type === 'burner') {
        return {
          type: 'move-container',
          containerInstanceId: currentSelection.containerInstanceId,
          equipmentId: target.equipmentId,
          localRatio: target.localRatio,
        };
      }
      if (target.type === 'sink') {
        return {
          type: 'dispose',
          containerInstanceId: currentSelection.containerInstanceId,
        };
      }
      return { type: 'deselect' };

    default:
      return { type: 'deselect' };
  }
}

/** 현재 선택된 오브젝트와 클릭 대상이 같은지 판별 */
function isSameTarget(selection: SelectionState, target: ClickTarget): boolean {
  switch (selection.type) {
    case 'ingredient':
      return target.type === 'ingredient-source'
        && target.ingredientId === selection.ingredientId
        && target.equipmentId === selection.sourceEquipmentId;

    case 'container':
      return target.type === 'container-source'
        && target.containerId === selection.containerId;

    case 'wok-content':
      return target.type === 'hologram'
        && target.equipmentStateId === selection.equipmentStateId;

    case 'placed-container':
      return target.type === 'placed-container'
        && target.containerInstanceId === selection.containerInstanceId;

    default:
      return false;
  }
}
