import { useMemo } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import type { GameEquipmentState } from '../../types/db';

interface Props {
  equipmentState: GameEquipmentState;
  skipDroppable?: boolean;
}

export default function FryingBasketComponent({ equipmentState, skipDroppable = false }: Props) {
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);

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
      style={{
        width: '100%',
        height: '100%',
        background: isOver ? 'rgba(76,175,80,0.2)' : 'rgba(0,0,0,0.6)',
        border: `2px solid ${isDown ? '#ff9800' : '#4caf50'}`,
        borderRadius: 6,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: 11,
        color: '#fff',
        cursor: basketIngredients.length > 0 ? 'grab' : 'default',
        touchAction: 'none',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
        <span>튀김채</span>
        <span style={{ color: isDown ? '#ff9800' : '#4caf50' }}>
          {isDown ? 'DOWN' : 'UP'}
        </span>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleBasket();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          padding: '2px 0',
          fontSize: 10,
          background: isDown ? '#4caf50' : '#ff9800',
          color: '#fff',
          border: 'none',
          borderRadius: 3,
          cursor: 'pointer',
        }}
      >
        {isDown ? '올리기' : '내리기'}
      </button>

      {basketIngredients.length > 0 && (
        <div style={{ fontSize: 10, opacity: 0.8 }}>
          재료: {basketIngredients.length}개
        </div>
      )}
    </div>
  );
}
