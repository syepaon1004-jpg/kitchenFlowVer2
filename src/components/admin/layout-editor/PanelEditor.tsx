import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelMode, LocalEquipment, LocalItem } from './types';
import type { EquipmentInteractionState } from '../../../types/game';
import type { StoreIngredient, Container } from '../../../types/db';
import PanelScene from './PanelScene';
import styles from '../KitchenLayoutEditor.module.css';

const HANDLE_HEIGHT = 8;

interface Props {
  mode: PanelMode;
  panelHeights: number[];
  onPanelHeightsChange: (heights: number[]) => void;
  perspectiveDeg: number;
  previewYOffset: number;
  onPreviewYOffsetChange: (offset: number) => void;
  backgroundImageUrl: string | null;
  onBackgroundUpload: (file: File) => void;
  uploading: boolean;
  equipment: LocalEquipment[];
  selectedEquipmentId: string | null;
  activePanelIndex: number;
  onActivePanelChange: (index: number) => void;
  onEquipmentChange: (id: string, updates: Partial<LocalEquipment>) => void;
  onSelectEquipment: (id: string | null) => void;
  onDeleteEquipment: (id: string) => void;
  onDuplicateEquipment: (id: string) => void;
  interactionState: EquipmentInteractionState;
  onInteractionChange: (updater: (prev: EquipmentInteractionState) => EquipmentInteractionState) => void;
  items: LocalItem[];
  selectedItemId: string | null;
  ingredients: StoreIngredient[];
  containers: Container[];
  onItemChange: (id: string, updates: Partial<LocalItem>) => void;
  onSelectItem: (id: string | null) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  /** scene 컨테이너 픽셀 크기 변경 콜백. PanelScene → KitchenLayoutEditor pass-through. */
  onSceneSize?: (size: { width: number; height: number }) => void;
}

const MIN_RATIO = 0.1;

const PanelEditor = ({
  mode,
  panelHeights,
  onPanelHeightsChange,
  perspectiveDeg,
  previewYOffset,
  onPreviewYOffsetChange,
  backgroundImageUrl,
  onBackgroundUpload,
  uploading,
  equipment,
  selectedEquipmentId,
  activePanelIndex,
  onActivePanelChange,
  onEquipmentChange,
  onSelectEquipment,
  onDeleteEquipment,
  onDuplicateEquipment,
  interactionState,
  onInteractionChange,
  items,
  selectedItemId,
  ingredients,
  containers,
  onItemChange,
  onSelectItem,
  onDeleteItem,
  onDuplicateItem,
  onSceneSize,
}: Props) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [overlayHeight, setOverlayHeight] = useState(0);

  // 오버레이 높이 관찰 (핸들 위치 계산용)
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const measure = () => setOverlayHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onBackgroundUpload(file);
      if (e.target) e.target.value = '';
    },
    [onBackgroundUpload],
  );

  const isEdit = mode === 'edit';

  // 핸들 고정높이 제외한 패널 영역 높이
  const panelAreaHeight = overlayHeight - (isEdit ? HANDLE_HEIGHT * 2 : 0);

  // 핸들 Y 위치 계산 (px)
  const handleYPositions = isEdit
    ? [
        panelAreaHeight * panelHeights[0],
        panelAreaHeight * (panelHeights[0] + panelHeights[1]) + HANDLE_HEIGHT,
      ]
    : [];

  const handleResizeStart = useCallback(
    (handleIndex: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeights = [...panelHeights];

      const onMove = (me: MouseEvent) => {
        const deltaRatio = (me.clientY - startY) / panelAreaHeight;
        const newHeights = [...startHeights];

        newHeights[handleIndex] = startHeights[handleIndex] + deltaRatio;
        newHeights[handleIndex + 1] = startHeights[handleIndex + 1] - deltaRatio;

        if (newHeights[handleIndex] < MIN_RATIO) {
          newHeights[handleIndex + 1] -= MIN_RATIO - newHeights[handleIndex];
          newHeights[handleIndex] = MIN_RATIO;
        }
        if (newHeights[handleIndex + 1] < MIN_RATIO) {
          newHeights[handleIndex] -= MIN_RATIO - newHeights[handleIndex + 1];
          newHeights[handleIndex + 1] = MIN_RATIO;
        }

        onPanelHeightsChange(newHeights);
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [panelHeights, panelAreaHeight, onPanelHeightsChange],
  );

  return (
    <div className={styles.panelEditorRoot}>
      {/* 배경 이미지 또는 placeholder */}
      {backgroundImageUrl ? (
        <img
          src={backgroundImageUrl}
          alt="주방 배경"
          className={styles.backgroundImage}
          draggable={false}
        />
      ) : (
        <div
          className={styles.uploadPlaceholder}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? '업로드 중...' : '주방 배경 이미지를 업로드하세요'}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {backgroundImageUrl && (
        <button
          className={styles.bgChangeBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '업로드 중...' : '배경 변경'}
        </button>
      )}

      {/* 패널 오버레이: scene + 핸들을 모두 포함 */}
      <div ref={overlayRef} className={styles.panelOverlay}>
        {/* PanelScene: 부모-자식 중첩 DOM (편집/미리보기 공유) */}
        <PanelScene
          mode={mode}
          panelHeights={panelHeights}
          perspectiveDeg={perspectiveDeg}
          previewYOffset={previewYOffset}
          onPreviewYOffsetChange={onPreviewYOffsetChange}
          equipment={equipment}
          selectedEquipmentId={selectedEquipmentId}
          activePanelIndex={activePanelIndex}
          onActivePanelChange={onActivePanelChange}
          onEquipmentChange={onEquipmentChange}
          onSelectEquipment={onSelectEquipment}
          onDeleteEquipment={onDeleteEquipment}
          onDuplicateEquipment={onDuplicateEquipment}
          interactionState={interactionState}
          onInteractionChange={onInteractionChange}
          items={items}
          selectedItemId={selectedItemId}
          ingredients={ingredients}
          containers={containers}
          onItemChange={onItemChange}
          onSelectItem={onSelectItem}
          onDeleteItem={onDeleteItem}
          onDuplicateItem={onDuplicateItem}
          onSceneSize={onSceneSize}
        />

        {/* 리사이즈 핸들: 편집 모드에서만, absolute 배치 */}
        {isEdit && handleYPositions.map((y, i) => (
          <div
            key={`handle-${i}`}
            className={styles.resizeHandle}
            style={{
              position: 'absolute',
              top: y,
              left: 0,
              width: '100%',
              height: HANDLE_HEIGHT,
              zIndex: 5,
            }}
            onMouseDown={handleResizeStart(i)}
          />
        ))}
      </div>
    </div>
  );
};

export default PanelEditor;
