import type { MoveDirection, MovableDirections } from '../../types/section';
import styles from './NavigationHUD.module.css';

interface NavigationHUDProps {
  movable: MovableDirections;
  onMove: (direction: MoveDirection) => void;
}

const ARROWS: Record<MoveDirection, string> = {
  up: '▲',
  down: '▼',
  left: '◀',
  right: '▶',
};

export default function NavigationHUD({ movable, onMove }: NavigationHUDProps) {
  const directions: MoveDirection[] = ['up', 'down', 'left', 'right'];

  return (
    <div className={styles.container}>
      {directions.map((dir) => (
        <button
          key={dir}
          className={`${styles.button} ${styles[dir]} ${!movable[dir] ? styles.disabled : ''}`}
          disabled={!movable[dir]}
          onClick={() => onMove(dir)}
          aria-label={`Move ${dir}`}
        >
          {ARROWS[dir]}
        </button>
      ))}
    </div>
  );
}
