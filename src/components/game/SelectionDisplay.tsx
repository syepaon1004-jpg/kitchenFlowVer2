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
  return (
    <div className={styles.selectionDisplay} onClick={selection ? onDeselect : undefined}>
      {selection ? (
        <div className={styles.chip}>
          <span className={styles.chipType}>{TYPE_LABELS[selection.type]}</span>
          <span className={styles.chipLabel}>{selection.sourceLabel ?? ''}</span>
        </div>
      ) : (
        <span className={styles.empty}>선택된 요소 없음</span>
      )}
    </div>
  );
};

export default SelectionDisplay;
