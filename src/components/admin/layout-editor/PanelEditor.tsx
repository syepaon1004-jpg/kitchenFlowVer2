import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelMode, LocalEquipment, LocalItem, ImageFitMode } from './types';
import type { EquipmentInteractionState } from '../../../types/game';
import type { StoreIngredient, Container } from '../../../types/db';
import PanelScene from './PanelScene';
import styles from '../KitchenLayoutEditor.module.css';

/** 권장 이미지 가로:세로 비율 계산 기준이 되는 표준 뷰포트 비율 (16:9) */
const STANDARD_VIEWPORT_ASPECT = 16 / 9;

const FIT_MODE_LABELS: Record<ImageFitMode, string> = {
  natural: '원본 비율 (권장)',
  cover: '꽉 채움 (좌우 잘림)',
  stretch: '꽉 채움 (비율 왜곡)',
};

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
  /** 배경 이미지 핏 모드 (행 단위) */
  imageFitMode: ImageFitMode;
  onImageFitModeChange: (mode: ImageFitMode) => void;
  /** 권장 이미지 비율 계산용 (섹션 열 수) */
  gridCols: number;
  /** 섹션 포커스: 이미지 월드 기준 0~1 중심 X. null/undefined면 스크롤 건드리지 않음. */
  focusCenterX?: number | null;
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
  imageFitMode,
  onImageFitModeChange,
  gridCols,
  focusCenterX,
}: Props) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollWrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [overlayHeight, setOverlayHeight] = useState(0);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);

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

  // 배경 URL이 바뀔 때: 캐시 히트로 load 이벤트가 핸들러 부착 전 발생한 경우에도
  // img.complete로 결정적 세팅 (onLoad와의 race 제거).
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    } else {
      setImgNatural(null);
    }
  }, [backgroundImageUrl]);

  // 섹션 포커스: focusCenterX가 주어지면 그 지점이 scrollWrap 중앙에 오도록 scrollLeft 조정
  useEffect(() => {
    if (focusCenterX == null) return;
    const scrollEl = scrollWrapRef.current;
    if (!scrollEl) return;
    const worldW = scrollEl.scrollWidth;
    const vpW = scrollEl.clientWidth;
    if (worldW <= 0 || vpW <= 0) return;
    const targetLeft = focusCenterX * worldW - vpW / 2;
    const maxLeft = Math.max(0, worldW - vpW);
    scrollEl.scrollLeft = Math.min(maxLeft, Math.max(0, targetLeft));
  }, [focusCenterX, imgNatural, backgroundImageUrl, overlayHeight]);

  // 권장 이미지 비율 계산 (natural 모드에서 섹션별로 뷰포트에 딱 맞으려면)
  const recommendedAspect = STANDARD_VIEWPORT_ASPECT * Math.max(1, gridCols);
  const actualAspect = imgNatural && imgNatural.h > 0 ? imgNatural.w / imgNatural.h : null;
  const imageTooNarrowForNatural = imageFitMode === 'natural'
    && actualAspect !== null
    && actualAspect < recommendedAspect - 0.05;

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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* 핏 모드 / 이미지 비율 안내 — scrollWrap 외부 고정 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 6,
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '6px 10px',
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #ccc',
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.3,
          maxWidth: 280,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>핏 모드</span>
          <select
            value={imageFitMode}
            onChange={(e) => onImageFitModeChange(e.target.value as ImageFitMode)}
            style={{ fontSize: 12 }}
          >
            {(Object.keys(FIT_MODE_LABELS) as ImageFitMode[]).map((m) => (
              <option key={m} value={m}>{FIT_MODE_LABELS[m]}</option>
            ))}
          </select>
        </label>
        <div style={{ color: '#666' }}>
          권장 비율 ≈ {recommendedAspect.toFixed(2)} : 1
          {actualAspect !== null && (
            <> · 현재 {actualAspect.toFixed(2)} : 1</>
          )}
        </div>
        {imageTooNarrowForNatural && (
          <div style={{ color: '#c0392b' }}>
            이미지가 권장보다 좁습니다. natural 모드에서 좌우 여백이 생길 수 있습니다.
          </div>
        )}
      </div>

      {backgroundImageUrl && (
        <button
          className={styles.bgChangeBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '업로드 중...' : '배경 변경'}
        </button>
      )}

      {backgroundImageUrl ? (
        /* 가로 스크롤 래퍼 — 이미지 월드 폭이 뷰포트를 넘치면 스크롤 생성 */
        <div ref={scrollWrapRef} className={styles.editorScrollWrap}>
          <div className={styles.editorImageWorld}>
            <img
              ref={imgRef}
              src={backgroundImageUrl}
              alt="주방 배경"
              className={styles.backgroundImage}
              draggable={false}
              onLoad={(e) => {
                const t = e.currentTarget;
                if (t.naturalWidth > 0 && t.naturalHeight > 0) {
                  setImgNatural({ w: t.naturalWidth, h: t.naturalHeight });
                }
              }}
            />

            {/* 패널 오버레이: scene + 핸들. imageWorld에 귀속되어 장비 %가 이미지 기준 */}
            <div ref={overlayRef} className={styles.panelOverlay}>
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
        </div>
      ) : (
        <div
          className={styles.uploadPlaceholder}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? '업로드 중...' : '주방 배경 이미지를 업로드하세요'}
        </div>
      )}
    </div>
  );
};

export default PanelEditor;
