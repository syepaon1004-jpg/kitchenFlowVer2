import type { PanelMode } from './types';
import type { EditorView } from '../../../types/section';
import styles from '../KitchenLayoutEditor.module.css';

interface Props {
  mode: PanelMode;
  onModeChange: (mode: PanelMode) => void;
  editorView: EditorView;
  onEditorViewChange: (view: EditorView) => void;
  /** 현재 편집 중인 행 인덱스 (row/section 뷰에서 표시) */
  activeRowIndex: number | null;
  onSave: () => void;
  saving: boolean;
  hasChanges: boolean;
  perspectiveDeg: number;
  onPerspectiveDegChange: (deg: number) => void;
}

const PERSPECTIVE_MIN = 1;
const PERSPECTIVE_MAX = 100;

const VIEW_LABELS: Record<EditorView, string> = {
  grid: '그리드',
  row: '행 장면',
  section: '섹션 포커스',
};

const LayoutToolbar = ({
  mode, onModeChange, editorView, onEditorViewChange, activeRowIndex,
  onSave, saving, hasChanges, perspectiveDeg, onPerspectiveDegChange,
}: Props) => {
  const clampDeg = (v: number) => Math.max(PERSPECTIVE_MIN, Math.min(PERSPECTIVE_MAX, v));
  return (
    <div className={styles.toolbar}>
      {/* 뷰 전환 버튼 */}
      {(['grid', 'row', 'section'] as const).map((view) => (
        <button
          key={view}
          className={`${styles.toolbarBtn} ${editorView === view ? styles.toolbarBtnActive : ''}`}
          onClick={() => onEditorViewChange(view)}
          disabled={
            (view === 'row' && activeRowIndex === null) ||
            (view === 'section' && activeRowIndex === null)
          }
        >
          {VIEW_LABELS[view]}
          {view !== 'grid' && activeRowIndex !== null && ` (행 ${activeRowIndex})`}
        </button>
      ))}

      <div className={styles.toolbarDivider} />

      {/* 편집/미리보기 모드 (row 뷰에서만 유효) */}
      <button
        className={`${styles.toolbarBtn} ${mode === 'edit' ? styles.toolbarBtnActive : ''}`}
        onClick={() => onModeChange('edit')}
        disabled={editorView !== 'row'}
      >
        편집
      </button>
      <button
        className={`${styles.toolbarBtn} ${mode === 'preview' ? styles.toolbarBtnActive : ''}`}
        onClick={() => onModeChange('preview')}
        disabled={editorView !== 'row'}
      >
        미리보기
      </button>
      <div className={styles.toolbarSpacer} />
      {mode === 'preview' && editorView === 'row' && (
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
        disabled={saving || !hasChanges}
      >
        {saving ? '저장 중...' : '저장'}
      </button>
    </div>
  );
};

export default LayoutToolbar;
