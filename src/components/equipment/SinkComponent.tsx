import type { GameEquipmentState } from '../../types/db';
import styles from './SinkComponent.module.css';

interface Props {
  equipmentState: GameEquipmentState;
}

export default function SinkComponent({ /* equipmentState */ }: Props) {
  return (
    <div
      className={styles.container}
      style={{
        background: 'var(--equip-bg)',
        border: '2px solid #607d8b',
      }}
    >
      싱크대
    </div>
  );
}
