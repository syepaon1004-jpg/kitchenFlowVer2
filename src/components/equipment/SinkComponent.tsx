import { useDroppable } from '@dnd-kit/core';
import type { GameEquipmentState } from '../../types/db';
import styles from './SinkComponent.module.css';

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
      className={styles.container}
      style={{
        background: isOver ? 'rgba(3,169,244,0.2)' : 'var(--equip-bg)',
        border: `2px solid ${isOver ? 'var(--color-sink)' : '#607d8b'}`,
      }}
    >
      싱크대
    </div>
  );
}
