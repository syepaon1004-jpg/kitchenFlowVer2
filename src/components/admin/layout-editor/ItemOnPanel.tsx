import { useCallback, useRef } from 'react';
import type { LocalItem, LocalEquipment } from './types';
import type { StoreIngredient, Container } from '../../../types/db';
import styles from '../KitchenLayoutEditor.module.css';

const SNAP_THRESHOLD_PX = 10;
const MIN_SIZE = 0.05;

interface Props {
  items: LocalItem[];
  equipment: LocalEquipment[];
  panelIndex: number;
  selectedItemId: string | null;
  ingredients: StoreIngredient[];
  containers: Container[];
  onItemChange: (id: string, updates: Partial<LocalItem>) => void;
  onSelectItem: (id: string | null) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
}

type Corner = 'nw' | 'ne' | 'sw' | 'se';

/** 스냅 계산: 특정 값을 targets에 근접하면 스냅 */
function snapValue(val: number, targets: number[], thresholdRatio: number): number {
  for (const t of targets) {
    if (Math.abs(val - t) <= thresholdRatio) return t;
  }
  return val;
}

const ItemOnPanel = ({
  items,
  equipment,
  panelIndex,
  selectedItemId,
  ingredients,
  containers,
  onItemChange,
  onSelectItem,
  onDeleteItem,
  onDuplicateItem,
}: Props) => {
  const panelRef = useRef<HTMLDivElement>(null);

  const getPanelRect = useCallback(() => {
    return panelRef.current?.getBoundingClientRect() ?? null;
  }, []);

  /** 같은 패널 내 다른 아이템 + 장비의 4변 비율값 수집 (스냅 대상) */
  const getSnapTargets = useCallback(
    (excludeId: string) => {
      const targets: { x: number[]; y: number[] } = { x: [0, 1], y: [0, 1] };
      // 다른 아이템
      for (const it of items) {
        if (it.id === excludeId || it.panelIndex !== panelIndex) continue;
        targets.x.push(it.x, it.x + it.width);
        targets.y.push(it.y, it.y + it.height);
      }
      // 장비
      for (const eq of equipment) {
        if (eq.panelIndex !== panelIndex) continue;
        targets.x.push(eq.x, eq.x + eq.width);
        targets.y.push(eq.y, eq.y + eq.height);
      }
      return targets;
    },
    [items, equipment, panelIndex],
  );

  const getSnapThreshold = useCallback(() => {
    const rect = getPanelRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: SNAP_THRESHOLD_PX / rect.width,
      y: SNAP_THRESHOLD_PX / rect.height,
    };
  }, [getPanelRect]);

  const handleMoveStart = useCallback(
    (item: LocalItem) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onSelectItem(item.id);

      const rect = getPanelRect();
      if (!rect) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startItemX = item.x;
      const startItemY = item.y;
      const snapTargets = getSnapTargets(item.id);
      const threshold = getSnapThreshold();

      const onMove = (me: MouseEvent) => {
        const dx = (me.clientX - startX) / rect.width;
        const dy = (me.clientY - startY) / rect.height;

        let newX = startItemX + dx;
        let newY = startItemY + dy;

        newX = snapValue(newX, snapTargets.x, threshold.x);
        const snappedRight = snapValue(newX + item.width, snapTargets.x, threshold.x);
        if (snappedRight !== newX + item.width) newX = snappedRight - item.width;

        newY = snapValue(newY, snapTargets.y, threshold.y);
        const snappedBottom = snapValue(newY + item.height, snapTargets.y, threshold.y);
        if (snappedBottom !== newY + item.height) newY = snappedBottom - item.height;

        newX = Math.max(0, Math.min(1 - item.width, newX));
        newY = Math.max(0, Math.min(1 - item.height, newY));

        onItemChange(item.id, { x: newX, y: newY });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [getPanelRect, getSnapTargets, getSnapThreshold, onItemChange, onSelectItem],
  );

  const handleResizeStart = useCallback(
    (item: LocalItem, corner: Corner) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const rect = getPanelRect();
      if (!rect) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startItem = { x: item.x, y: item.y, width: item.width, height: item.height };
      const snapTargets = getSnapTargets(item.id);
      const threshold = getSnapThreshold();

      const onMove = (me: MouseEvent) => {
        const dx = (me.clientX - startX) / rect.width;
        const dy = (me.clientY - startY) / rect.height;

        let { x, y, width, height } = startItem;

        if (corner === 'se' || corner === 'ne') {
          width = Math.max(MIN_SIZE, startItem.width + dx);
          const right = snapValue(x + width, snapTargets.x, threshold.x);
          width = right - x;
        }
        if (corner === 'sw' || corner === 'nw') {
          const newX = startItem.x + dx;
          const snappedX = snapValue(newX, snapTargets.x, threshold.x);
          width = startItem.width + (startItem.x - snappedX);
          x = snappedX;
        }
        if (corner === 'se' || corner === 'sw') {
          height = Math.max(MIN_SIZE, startItem.height + dy);
          const bottom = snapValue(y + height, snapTargets.y, threshold.y);
          height = bottom - y;
        }
        if (corner === 'ne' || corner === 'nw') {
          const newY = startItem.y + dy;
          const snappedY = snapValue(newY, snapTargets.y, threshold.y);
          height = startItem.height + (startItem.y - snappedY);
          y = snappedY;
        }

        if (width < MIN_SIZE) width = MIN_SIZE;
        if (height < MIN_SIZE) height = MIN_SIZE;

        x = Math.max(0, Math.min(1 - width, x));
        y = Math.max(0, Math.min(1 - height, y));

        onItemChange(item.id, { x, y, width, height });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [getPanelRect, getSnapTargets, getSnapThreshold, onItemChange],
  );

  const getItemLabel = useCallback(
    (item: LocalItem): { text: string; linked: boolean } => {
      if (item.itemType === 'ingredient' && item.ingredientId) {
        const ing = ingredients.find((i) => i.id === item.ingredientId);
        return { text: ing?.display_name ?? '(삭제됨)', linked: true };
      }
      if (item.itemType === 'container' && item.containerId) {
        const con = containers.find((c) => c.id === item.containerId);
        return { text: con?.name ?? '(삭제됨)', linked: true };
      }
      return {
        text: item.itemType === 'ingredient' ? '재료 선택' : '그릇 선택',
        linked: false,
      };
    },
    [ingredients, containers],
  );

  const panelItems = items.filter((it) => it.panelIndex === panelIndex);

  return (
    <div ref={panelRef} className={styles.itemLayer}>
      {panelItems.map((item) => {
        const isSelected = item.id === selectedItemId;
        const label = getItemLabel(item);
        return (
          <div
            key={item.id}
            className={`${styles.panelItem} ${isSelected ? styles.panelItemSelected : ''}`}
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.width * 100}%`,
              height: `${item.height * 100}%`,
            }}
            onMouseDown={handleMoveStart(item)}
            onClick={(e) => {
              e.stopPropagation();
              onSelectItem(item.id);
            }}
          >
            <span className={`${styles.itemLabel} ${!label.linked ? styles.itemLabelUnlinked : ''}`}>
              {label.text}
            </span>

            {isSelected && (
              <>
                {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
                  <div
                    key={corner}
                    className={`${styles.itemResizeCorner} ${styles[`resize_${corner}`]}`}
                    onMouseDown={handleResizeStart(item, corner)}
                  />
                ))}
                <div className={styles.itemActions}>
                  <button
                    className={styles.eqActionBtn}
                    onClick={(e) => { e.stopPropagation(); onDuplicateItem(item.id); }}
                    title="복제"
                  >
                    ⧉
                  </button>
                  <button
                    className={`${styles.eqActionBtn} ${styles.eqActionBtnDanger}`}
                    onClick={(e) => { e.stopPropagation(); onDeleteItem(item.id); }}
                    title="삭제"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ItemOnPanel;
