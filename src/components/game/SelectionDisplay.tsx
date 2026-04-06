import type { SelectionState } from '../../types/game';
import styles from './SelectionDisplay.module.css';

const TYPE_LABELS: Record<SelectionState['type'], string> = {
  ingredient: '재료',
  container: '그릇',
  'wok-content': '웍 내용물',
  'placed-container': '올려놓인 그릇',
};

interface Props {
  selection: SelectionState | null;
  onDeselect: () => void;
}

const SelectionDisplay = ({ selection, onDeselect }: Props) => {
  const isHidden = !selection;
  const className = `${styles.selectionDisplay} ${isHidden ? styles.hidden : ''}`;

  return (
    <div className={className} onClick={onDeselect}>
      {selection && (
        <>
          <span className={styles.selectionType}>{TYPE_LABELS[selection.type]}</span>
          <span className={styles.selectionLabel}>{selection.sourceLabel ?? ''}</span>
        </>
      )}
    </div>
  );
};

export default SelectionDisplay;
