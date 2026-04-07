import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelMode, LocalEquipment, LocalItem } from './types';
import type { EquipmentInteractionState } from '../../../types/game';
import type { StoreIngredient, Container } from '../../../types/db';
import EquipmentOnPanel from './EquipmentOnPanel';
import ItemOnPanel from './ItemOnPanel';
import PreviewEquipment from './PreviewEquipment';
import styles from '../KitchenLayoutEditor.module.css';

const PANEL_COLORS = [
  'rgba(100, 150, 255, 0.15)',
  'rgba(100, 200, 100, 0.15)',
  'rgba(255, 150, 100, 0.15)',
];

const PANEL_LABELS = ['패널 1 (상부 벽면)', '패널 2 (작업면)', '패널 3 (하부 전면)'];

const HANDLE_TOTAL_HEIGHT = 16;

interface Props {
  mode: PanelMode;
  panelHeights: number[];
  perspectiveDeg: number;
  previewYOffset: number;
  onPreviewYOffsetChange?: (offset: number) => void;
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
}

function degToPerspectivePx(deg: number, containerHeight: number): number {
  const rad = (deg * Math.PI) / 360;
  return containerHeight / (2 * Math.tan(rad));
}

const PanelScene = ({
  mode,
  panelHeights,
  perspectiveDeg,
  previewYOffset,
  onPreviewYOffsetChange,
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
}: Props) => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  useEffect(() => {
    const el = sceneRef.current?.parentElement;
    if (!el) return;
    const measure = () => setContainerHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const isPreview = mode === 'preview';
  const panelAreaHeight = containerHeight - (isPreview ? 0 : HANDLE_TOTAL_HEIGHT);
  const panelPxHeights = panelHeights.map((r) => Math.max(0, panelAreaHeight * r));
  const perspectivePx = containerHeight > 0 ? degToPerspectivePx(perspectiveDeg, containerHeight) : 800;
  const previewTranslateY = isPreview ? (previewYOffset - 0.5) * containerHeight : 0;

  // hit-test 기반 인터랙션 (미리보기 전용)
  const handleEquipmentInteraction = useCallback(
    (eqId: string, eqType: string) => {
      switch (eqType) {
        case 'drawer':
          onInteractionChange((prev) => ({
            ...prev,
            drawers: { ...prev.drawers, [eqId]: { isOpen: !(prev.drawers[eqId]?.isOpen) } },
          }));
          break;
        case 'burner':
          onInteractionChange((prev) => ({
            ...prev,
            burners: {
              ...prev.burners,
              [eqId]: { fireLevel: (((prev.burners[eqId]?.fireLevel ?? 0) + 1) % 3) as 0 | 1 | 2 },
            },
          }));
          break;
        case 'basket':
          onInteractionChange((prev) => ({
            ...prev,
            baskets: { ...prev.baskets, [eqId]: { isExpanded: !(prev.baskets[eqId]?.isExpanded) } },
          }));
          break;
        case 'fold_fridge':
          onInteractionChange((prev) => ({
            ...prev,
            foldFridges: { ...prev.foldFridges, [eqId]: { isOpen: !(prev.foldFridges[eqId]?.isOpen) } },
          }));
          break;
      }
    },
    [onInteractionChange],
  );

  // scene 레벨 click → getBoundingClientRect hit-test
  const handleSceneMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isPreview) return;

      const sceneEl = sceneRef.current;
      if (!sceneEl) return;

      const { clientX, clientY } = e;

      // hit-test: data-equipment-id 요소의 투영 rect와 비교
      // 서랍 face/inner는 translateZ로 투영 위치가 변하므로 자식(face/inner) 우선,
      // 없으면 컨테이너로 폴백한다. 가장 작은 면적의 적중을 우선해 가장 구체적인 레이어를 선택.
      const eqElements = sceneEl.querySelectorAll('[data-equipment-id]');
      type Hit = { id: string; type: string; area: number; isLayer: boolean };
      const hits: Hit[] = [];
      for (const el of eqElements) {
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          const id = (el as HTMLElement).dataset.equipmentId!;
          const type = (el as HTMLElement).dataset.equipmentType!;
          const isLayer = !!(el as HTMLElement).dataset.eqHitLayer;
          hits.push({ id, type, area: rect.width * rect.height, isLayer });
        }
      }
      if (hits.length > 0) {
        // face/inner 레이어 우선, 없으면 컨테이너. 동일 카테고리에선 면적 작은 순.
        hits.sort((a, b) => {
          if (a.isLayer !== b.isLayer) return a.isLayer ? -1 : 1;
          return a.area - b.area;
        });
        const top = hits[0];
        e.preventDefault();
        e.stopPropagation();
        handleEquipmentInteraction(top.id, top.type);
        return;
      }

      // 장비 미히트 → Y 드래그
      if (!onPreviewYOffsetChange) return;
      e.preventDefault();
      const startY = e.clientY;
      const startOffset = previewYOffset;

      const onMove = (me: MouseEvent) => {
        const deltaRatio = (me.clientY - startY) / containerHeight;
        onPreviewYOffsetChange(Math.max(0.1, Math.min(0.9, startOffset + deltaRatio)));
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [isPreview, handleEquipmentInteraction, onPreviewYOffsetChange, previewYOffset, containerHeight],
  );

  const handlePanelClick = (index: number) => (e: React.MouseEvent) => {
    if (isPreview) return;
    if ((e.target as HTMLElement).closest(`.${styles.equipmentItem}`)) return;
    if ((e.target as HTMLElement).closest(`.${styles.panelItem}`)) return;
    onSelectEquipment(null);
    onSelectItem(null);
    onActivePanelChange(index);
  };

  const renderPanel = (index: number): React.ReactNode => {
    const isActive = !isPreview && index === activePanelIndex;

    let rotateX = '0deg';
    if (isPreview) {
      if (index === 0) rotateX = '-20deg';
      else if (index === 1) rotateX = '90deg';
      else rotateX = '-90deg';
    }

    const faceStyle: React.CSSProperties = isPreview
      ? { background: 'transparent', border: 'none' }
      : { background: PANEL_COLORS[index], border: '1px dashed rgba(0,0,0,0.25)' };

    return (
      <div
        className={styles.panelWrapper}
        style={{
          height: panelPxHeights[index],
          transformOrigin: index === 0 ? 'center center' : 'top center',
          transform: `rotateX(${rotateX})`,
        }}
      >
        <div
          className={`${styles.panelFace} ${isActive ? styles.panelActive : ''}`}
          style={faceStyle}
          onClick={handlePanelClick(index)}
        >
          {!isPreview && (
            <>
              <span className={styles.panelLabel}>{PANEL_LABELS[index]}</span>
              <span className={styles.panelRatio}>
                {Math.round(panelHeights[index] * 100)}%
              </span>
            </>
          )}

          {/* 장비: 편집/미리보기 분기 */}
          {isPreview ? (
            <>
              <PreviewEquipment
                equipment={equipment}
                panelIndex={index}
                interactionState={interactionState}
                ingredients={ingredients}
              />
              {/* 미리보기 아이템 (읽기 전용) */}
              <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
                {items.filter((it) => it.panelIndex === index).map((item) => {
                  let label = '';
                  if (item.itemType === 'ingredient' && item.ingredientId) {
                    label = ingredients.find((i) => i.id === item.ingredientId)?.display_name ?? '(삭제됨)';
                  } else if (item.itemType === 'container' && item.containerId) {
                    label = containers.find((c) => c.id === item.containerId)?.name ?? '(삭제됨)';
                  }
                  return (
                    <div
                      key={item.id}
                      style={{
                        position: 'absolute',
                        left: `${item.x * 100}%`,
                        top: `${item.y * 100}%`,
                        width: `${item.width * 100}%`,
                        height: `${item.height * 100}%`,
                        background: '#ffffff',
                        border: '1px solid #ccc',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 6,
                        overflow: 'hidden',
                        boxSizing: 'border-box',
                      }}
                    >
                      <span style={{
                        fontSize: 9,
                        color: '#555',
                        textAlign: 'center',
                        pointerEvents: 'none',
                        userSelect: 'none',
                        padding: 2,
                        lineHeight: 1.2,
                        wordBreak: 'keep-all',
                        overflow: 'hidden',
                      }}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <EquipmentOnPanel
                equipment={equipment}
                panelIndex={index}
                selectedEquipmentId={selectedEquipmentId}
                onEquipmentChange={onEquipmentChange}
                onSelectEquipment={onSelectEquipment}
                onDeleteEquipment={onDeleteEquipment}
                onDuplicateEquipment={onDuplicateEquipment}
              />
              <ItemOnPanel
                items={items}
                equipment={equipment}
                panelIndex={index}
                selectedItemId={selectedItemId}
                ingredients={ingredients}
                containers={containers}
                onItemChange={onItemChange}
                onSelectItem={onSelectItem}
                onDeleteItem={onDeleteItem}
                onDuplicateItem={onDuplicateItem}
              />
            </>
          )}

          {/* 홀로그램: 미리보기 + 패널 1에서만, 화구 위치에 자동 생성 */}
          {isPreview && index === 0 && equipment
            .filter((eq) => eq.equipmentType === 'burner')
            .map((burner) => (
              <div
                key={`holo-${burner.id}`}
                className={styles.hologram}
                style={{
                  left: `${burner.x * 100}%`,
                  bottom: 0,
                  width: `${burner.width * 100}%`,
                  height: `${panelHeights[0] > 0 ? burner.height * (panelHeights[1] / panelHeights[0]) * 100 : burner.height * 100}%`,
                }}
              />
            ))}
        </div>

        {index < 2 && (
          <div className={styles.panelAnchor}>
            {renderPanel(index + 1)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      ref={sceneRef}
      className={styles.scene}
      style={{
        perspective: isPreview ? `${perspectivePx}px` : 'none',
        cursor: isPreview ? 'ns-resize' : undefined,
      }}
      onMouseDown={handleSceneMouseDown}
    >
      <div
        className={styles.panelGroup}
        style={{
          transform: isPreview ? `translateY(${previewTranslateY}px)` : 'none',
        }}
      >
        {renderPanel(0)}
      </div>
    </div>
  );
};

export default PanelScene;
