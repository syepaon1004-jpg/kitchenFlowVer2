import type { PanelMode } from './types';
import styles from '../KitchenLayoutEditor.module.css';

interface Props {
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  onSave: () => void;
  saving: boolean;
  hasChanges: boolean;
  perspectiveDeg: number;
  onPerspectiveDegChange: (deg: number) => void;
}

const PERSPECTIVE_MIN = 20;
const PERSPECTIVE_MAX = 100;

const LayoutToolbar = ({ mode, onModeChange, onSave, saving, hasChanges, perspectiveDeg, onPerspectiveDegChange }: Props) => {
  const clampDeg = (v: number) => Math.max(PERSPECTIVE_MIN, Math.min(PERSPECTIVE_MAX, v));
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
      {mode === 'preview' && (
        <div className={styles.toolbarPerspectiveGroup}>
          <label className={styles.toolbarPerspectiveLabel} htmlFor="perspective-slider">각도</label>
          <input
            id="perspective-slider"
            type="range"
            min={PERSPECTIVE_MIN}
            max={PERSPECTIVE_MAX}
            step={1}
            value={perspectiveDeg}
            onChange={(e) => onPerspectiveDegChange(Number(e.target.value))}
            className={styles.toolbarPerspectiveSlider}
          />
          <input
            type="number"
            min={PERSPECTIVE_MIN}
            max={PERSPECTIVE_MAX}
            step={1}
            value={perspectiveDeg}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v)) onPerspectiveDegChange(clampDeg(v));
            }}
            className={styles.toolbarPerspectiveNumber}
          />
          <span className={styles.toolbarPerspectiveUnit}>°</span>
        </div>
      )}
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
