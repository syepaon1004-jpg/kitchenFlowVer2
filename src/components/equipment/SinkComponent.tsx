import { useDroppable } from '@dnd-kit/core';
import type { GameEquipmentState } from '../../types/db';

interface Props {
  equipmentState: GameEquipmentState;
  skipDroppable?: boolean;
}

export default function SinkComponent({ equipmentState, skipDroppable = false }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `equipment-sink-${equipmentState.id}`,
    data: { equipmentStateId: equipmentState.id, equipmentType: 'sink' },
    disabled: skipDroppable,
  });

  return (
    <div
      ref={skipDroppable ? undefined : setNodeRef}
      style={{
        width: '100%',
        height: '100%',
        background: isOver ? 'rgba(3,169,244,0.3)' : 'rgba(0,0,0,0.6)',
        border: `2px solid ${isOver ? '#03a9f4' : '#607d8b'}`,
        borderRadius: 6,
        padding: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: '#fff',
        fontWeight: 'bold',
      }}
    >
      싱크대
    </div>
  );
}
