import type { PanelMode } from './types';
import styles from '../KitchenLayoutEditor.module.css';

interface Props {
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  onSave: () => void;
  saving: boolean;
  hasChanges: boolean;
}

const LayoutToolbar = ({ mode, onModeChange, onSave, saving, hasChanges }: Props) => {
  return (
    <div className={styles.toolbar}>
      <button
        className={`${styles.toolbarBtn} ${mode === 'edit' ? styles.toolbarBtnActive : ''}`}
        onClick={() => onModeChange('edit')}
      >
        편집
      </button>
      <button
        className={`${styles.toolbarBtn} ${mode === 'preview' ? styles.toolbarBtnActive : ''}`}
        onClick={() => onModeChange('preview')}
      >
        미리보기
      </button>
      <div className={styles.toolbarSpacer} />
      <button
        className={styles.toolbarBtn}
        onClick={onSave}
        disabled={mode !== 'preview' || saving || !hasChanges}
        title={mode !== 'preview' ? '미리보기 모드에서만 저장 가능' : ''}
      >
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  );
};

export default LayoutToolbar;
