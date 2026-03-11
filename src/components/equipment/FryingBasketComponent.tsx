import { useMemo } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import { useScoringStore } from '../../stores/scoringStore';
import type { GameEquipmentState } from '../../types/db';
import styles from './FryingBasketComponent.module.css';

interface Props {
  equipmentState: GameEquipmentState;
  skipDroppable?: boolean;
}

export default function FryingBasketComponent({ equipmentState, skipDroppable = false }: Props) {
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const sessionId = useGameStore((s) => s.sessionId);
  const addActionLog = useScoringStore((s) => s.addActionLog);

  const basketIngredients = useMemo(
    () =>
      ingredientInstances.filter(
        (i) => i.equipment_state_id === equipmentState.id && i.location_type === 'equipment',
      ),
    [ingredientInstances, equipmentState.id],
  );

  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `equipment-basket-${equipmentState.id}`,
    data: { equipmentStateId: equipmentState.id, equipmentType: 'frying_basket' },
    disabled: skipDroppable,
  });

  const { setNodeRef: dragRef, listeners, attributes } = useDraggable({
    id: `basket-drag-${equipmentState.id}`,
    data: {
      type: 'equipment' as const,
      equipmentType: 'frying_basket',
      equipmentStateId: equipmentState.id,
    },
    disabled: basketIngredients.length === 0 || equipmentState.basket_status === 'down',
  });

  const toggleBasket = () => {
    const newStatus = equipmentState.basket_status === 'up' ? 'down' : 'up';
    updateEquipment(equipmentState.id, { basket_status: newStatus });
    if (sessionId) {
      addActionLog({
        session_id: sessionId,
        action_type: newStatus === 'down' ? 'basket_down' : 'basket_up',
        timestamp_ms: Date.now(),
        metadata: { equipment_id: equipmentState.id },
      });
    }
  };

  const isDown = equipmentState.basket_status === 'down';

  return (
    <div
      ref={(node) => {
        if (!skipDroppable) dropRef(node);
        dragRef(node);
      }}
      {...listeners}
      {...attributes}
      className={styles.container}
      style={{
        background: isOver ? 'rgba(76,175,80,0.15)' : 'var(--equip-bg)',
        border: `2px solid ${isDown ? 'var(--color-warning)' : 'var(--color-success)'}`,
        cursor: basketIngredients.length > 0 ? 'grab' : 'default',
      }}
    >
      <div className={styles.titleRow}>
        <span>튀김채</span>
        <span style={{ color: isDown ? 'var(--color-warning)' : 'var(--color-success)' }}>
          {isDown ? 'DOWN' : 'UP'}
        </span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleBasket();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={styles.toggleBtn}
        style={{
          background: isDown ? 'var(--color-success)' : 'var(--color-warning)',
        }}
      >
        {isDown ? '올리기' : '내리기'}
      </button>

      {basketIngredients.length > 0 && (
        <div className={styles.ingredientCount}>
          재료: {basketIngredients.length}개
        </div>
      )}
    </div>
  );
}
