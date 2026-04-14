import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoreIngredient } from '../../../types/db';
import type { FoldFridgeConfig, FridgeInternalItem, FridgePanel } from '../../../types/game';
import { isFoldFridgeConfig, isBasketConfig } from '../../../types/game';
import GridEditor from './GridEditor';
import styles from './FridgeInternalEditor.module.css';

// ——— 상수 ———

const SNAP_THRESHOLD_PX = 10;
const MIN_SIZE = 0.05;
const DEFAULT_ITEM_SIZE = 0.3;

const DEFAULT_CONFIG_FOLD: FoldFridgeConfig = {
  panels: [
    { level: 1, items: [] },
    { level: 2, items: [] },
  ],
};

const DEFAULT_CONFIG_FOUR_BOX: FoldFridgeConfig = {
  panels: [
    { level: 1, items: [] },
    { level: 2, items: [] },
    { level: 3, items: [] },
    { level: 4, items: [] },
  ],
};

// ——— 유틸 ———

function resolveConfig(config: Record<string, unknown>, equipmentType?: string): FoldFridgeConfig {
  if (isFoldFridgeConfig(config)) return config;
  return equipmentType === 'four_box_fridge' ? DEFAULT_CONFIG_FOUR_BOX : DEFAULT_CONFIG_FOLD;
}

function snapValue(val: number, targets: number[], thresholdRatio: number): number {
  for (const t of targets) {
    if (Math.abs(val - t) <= thresholdRatio) return t;
  }
  return val;
}

/** 패널 내 다른 아이템 4변 + 경계(0,1) 수집 */
function getSnapTargets(items: FridgeInternalItem[], excludeIndex: number): { x: number[]; y: number[] } {
  const targets: { x: number[]; y: number[] } = { x: [0, 1], y: [0, 1] };
  for (let i = 0; i < items.length; i++) {
    if (i === excludeIndex) continue;
    const it = items[i];
    targets.x.push(it.x, it.x + it.width);
    targets.y.push(it.y, it.y + it.height);
  }
  return targets;
}

// ——— Props ———

interface FridgeInternalEditorProps {
  equipmentId: string;
  equipmentType?: string;
  config: Record<string, unknown>;
  ingredients: StoreIngredient[];
  onConfigChange: (id: string, newConfig: Record<string, unknown>) => void;
}

// ——— 컴포넌트 ———

type FridgeLevel = 1 | 2 | 3 | 4;
type Corner = 'nw' | 'ne' | 'sw' | 'se';

const FridgeInternalEditor = ({
  equipmentId,
  equipmentType,
  config,
  ingredients,
  onConfigChange,
}: FridgeInternalEditorProps) => {
  const [fridgeConfig, setFridgeConfig] = useState<FoldFridgeConfig>(() => resolveConfig(config, equipmentType));
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedBasketKey, setSelectedBasketKey] = useState<string | null>(null);

  const panelRefs = useRef<Record<number, HTMLDivElement | null>>({ 1: null, 2: null, 3: null, 4: null });

  // equipmentId 변경 = 다른 냉장고 선택 → 전체 초기화
  // config은 의존성에서 제거: emitChange가 이미 setFridgeConfig로 로컬 반영하므로,
  // 외부 config 변경(DB 로��)은 equipmentId 변경과 함께 발생하여 여기서 처리됨.
  useEffect(() => {
    setFridgeConfig(resolveConfig(config, equipmentType));
    setSelectedItemId(null);
    setSelectedBasketKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipmentId]);

  // ——— config 변경 전달 ———

  const emitChange = useCallback(
    (newConfig: FoldFridgeConfig) => {
      setFridgeConfig(newConfig);
      onConfigChange(equipmentId, newConfig as unknown as Record<string, unknown>);
    },
    [equipmentId, onConfigChange],
  );

  // ——— 패널 헬퍼 ———

  const getPanelByLevel = useCallback(
    (level: FridgeLevel): FridgePanel => {
      return fridgeConfig.panels.find((p) => p.level === level) ?? { level, items: [] };
    },
    [fridgeConfig],
  );

  const updatePanel = useCallback(
    (level: FridgeLevel, newItems: FridgeInternalItem[]) => {
      const exists = fridgeConfig.panels.some((p) => p.level === level);
      const newPanels = exists
        ? fridgeConfig.panels.map((p) => p.level === level ? { ...p, items: newItems } : p)
        : [...fridgeConfig.panels, { level, items: newItems }];
      emitChange({ panels: newPanels });
    },
    [fridgeConfig, emitChange],
  );

  // ——— 아이템 추가 ———

  const handleAddItem = useCallback(
    (level: FridgeLevel, type: 'ingredient' | 'basket') => {
      const panel = getPanelByLevel(level);
      const newItem: FridgeInternalItem = {
        type,
        x: 0.1,
        y: 0.1,
        width: DEFAULT_ITEM_SIZE,
        height: DEFAULT_ITEM_SIZE,
        ingredientId: null,
        basketConfig: type === 'basket' ? { grid: { rows: 2, cols: 2, cells: makeCells(2, 2) } } : null,
      };
      updatePanel(level, [...panel.items, newItem]);
    },
    [getPanelByLevel, updatePanel],
  );

  // ——— 아이템 삭제 ———

  const handleDeleteItem = useCallback(
    (level: FridgeLevel, index: number) => {
      const panel = getPanelByLevel(level);
      const newItems = panel.items.filter((_, i) => i !== index);
      // 삭제 시 선택 상태 초기화 (인덱스 시프트 방지)
      setSelectedItemId(null);
      setSelectedBasketKey(null);
      updatePanel(level, newItems);
    },
    [getPanelByLevel, updatePanel],
  );

  // ——— 아이템 복제 ———

  const handleDuplicateItem = useCallback(
    (level: FridgeLevel, index: number) => {
      const panel = getPanelByLevel(level);
      const source = panel.items[index];
      if (!source) return;
      const clone: FridgeInternalItem = {
        ...source,
        x: Math.min(1 - source.width, source.x + 0.05),
        y: Math.min(1 - source.height, source.y + 0.05),
        basketConfig: source.basketConfig
          ? (JSON.parse(JSON.stringify(source.basketConfig)) as typeof source.basketConfig)
          : null,
      };
      const newItems = [...panel.items, clone];
      updatePanel(level, newItems);
      setSelectedItemId(`${level}-${newItems.length - 1}`);
      setSelectedBasketKey(null);
    },
    [getPanelByLevel, updatePanel],
  );

  // ——— 아이템 변경 (이동/리사이즈/FK) ———

  const handleItemUpdate = useCallback(
    (level: FridgeLevel, index: number, updates: Partial<FridgeInternalItem>) => {
      const panel = getPanelByLevel(level);
      const newItems = panel.items.map((item, i) =>
        i === index ? { ...item, ...updates } : item,
      );
      updatePanel(level, newItems);
    },
    [getPanelByLevel, updatePanel],
  );

  // ——— 드래그 이동 ———

  const handleMoveStart = useCallback(
    (level: FridgeLevel, index: number, item: FridgeInternalItem) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const key = `${level}-${index}`;
      setSelectedItemId(key);

      const panelEl = panelRefs.current[level];
      if (!panelEl) return;
      const rect = panelEl.getBoundingClientRect();

      const startX = e.clientX;
      const startY = e.clientY;
      const startItemX = item.x;
      const startItemY = item.y;
      const panel = getPanelByLevel(level);
      const snapTargets = getSnapTargets(panel.items, index);
      const threshold = {
        x: SNAP_THRESHOLD_PX / rect.width,
        y: SNAP_THRESHOLD_PX / rect.height,
      };

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

        handleItemUpdate(level, index, { x: newX, y: newY });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [getPanelByLevel, handleItemUpdate],
  );

  // ——— 리사이즈 ———

  const handleResizeStart = useCallback(
    (level: FridgeLevel, index: number, item: FridgeInternalItem, corner: Corner) => (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const panelEl = panelRefs.current[level];
      if (!panelEl) return;
      const rect = panelEl.getBoundingClientRect();

      const startX = e.clientX;
      const startY = e.clientY;
      const startItem = { x: item.x, y: item.y, width: item.width, height: item.height };
      const panel = getPanelByLevel(level);
      const snapTargets = getSnapTargets(panel.items, index);
      const threshold = {
        x: SNAP_THRESHOLD_PX / rect.width,
        y: SNAP_THRESHOLD_PX / rect.height,
      };

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

        handleItemUpdate(level, index, { x, y, width, height });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [getPanelByLevel, handleItemUpdate],
  );

  // ——— FK 연결 ———

  const handleIngredientChange = useCallback(
    (level: FridgeLevel, index: number, ingredientId: string | null) => {
      handleItemUpdate(level, index, { ingredientId });
    },
    [handleItemUpdate],
  );

  // ——— 바구니 GridEditor config 변경 ———

  const handleBasketConfigChange = useCallback(
    (_id: string, newBasketConfig: Record<string, unknown>) => {
      if (!selectedBasketKey) return;
      const [levelStr, indexStr] = selectedBasketKey.split('-');
      const level = Number(levelStr) as FridgeLevel;
      const index = Number(indexStr);
      handleItemUpdate(level, index, { basketConfig: newBasketConfig as unknown as FridgeInternalItem['basketConfig'] });
    },
    [selectedBasketKey, handleItemUpdate],
  );

  // ——— 선택된 아이템 정보 파싱 ———

  const selectedInfo = (() => {
    if (!selectedItemId) return null;
    const [levelStr, indexStr] = selectedItemId.split('-');
    const level = Number(levelStr) as FridgeLevel;
    const index = Number(indexStr);
    const panel = getPanelByLevel(level);
    if (index < 0 || index >= panel.items.length) return null;
    return { level, index, item: panel.items[index] };
  })();

  // ——— 바구니 깊이 편집 대상 ———

  const basketEditInfo = (() => {
    if (!selectedBasketKey) return null;
    const [levelStr, indexStr] = selectedBasketKey.split('-');
    const level = Number(levelStr) as FridgeLevel;
    const index = Number(indexStr);
    const panel = getPanelByLevel(level);
    if (index < 0 || index >= panel.items.length) return null;
    const item = panel.items[index];
    if (item.type !== 'basket') return null;
    return { level, index, item };
  })();

  // ——— 아이템 라벨 ———

  const getItemLabel = (item: FridgeInternalItem): { text: string; linked: boolean } => {
    if (item.type === 'ingredient') {
      if (item.ingredientId) {
        const ing = ingredients.find((i) => i.id === item.ingredientId);
        return { text: ing?.display_name ?? '(삭제됨)', linked: true };
      }
      return { text: '재료 미연결', linked: false };
    }
    return { text: '바구니', linked: true };
  };

  // ——— 패널 렌더링 ———

  const renderPanel = (level: FridgeLevel) => {
    const panel = getPanelByLevel(level);

    return (
      <div className={styles.panelSection} key={level}>
        <div className={styles.panelHeader}>
          <span className={styles.panelLabel}>{level}층</span>
          <button className={styles.addBtn} onClick={() => handleAddItem(level, 'ingredient')}>
            + 재료
          </button>
          <button className={styles.addBtn} onClick={() => handleAddItem(level, 'basket')}>
            + 바구니
          </button>
        </div>
        <div
          className={styles.panelArea}
          ref={(el) => { panelRefs.current[level] = el; }}
          onClick={() => { setSelectedItemId(null); setSelectedBasketKey(null); }}
        >
          {panel.items.map((item, index) => {
            const key = `${level}-${index}`;
            const isSelected = key === selectedItemId;
            const label = getItemLabel(item);

            let className = styles.fridgeItem;
            if (isSelected) className += ` ${styles.fridgeItemSelected}`;
            if (item.type === 'basket') className += ` ${styles.fridgeItemBasket}`;

            return (
              <div
                key={key}
                className={className}
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.width * 100}%`,
                  height: `${item.height * 100}%`,
                }}
                onMouseDown={handleMoveStart(level, index, item)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedItemId(key);
                }}
              >
                <span className={`${styles.fridgeItemLabel} ${!label.linked ? styles.fridgeItemLabelUnlinked : ''}`}>
                  {label.text}
                </span>

                {isSelected && (
                  <>
                    {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
                      <div
                        key={corner}
                        className={`${styles.resizeCorner} ${styles[`resize_${corner}`]}`}
                        onMouseDown={handleResizeStart(level, index, item, corner)}
                      />
                    ))}
                    <div className={styles.itemActions}>
                      <button
                        className={styles.actionBtn}
                        onClick={(e) => { e.stopPropagation(); handleDuplicateItem(level, index); }}
                        title="복제"
                      >
                        ⧉
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={(e) => { e.stopPropagation(); handleDeleteItem(level, index); }}
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
      </div>
    );
  };

  // ——— 렌더링 ———

  return (
    <div className={styles.root}>
      <h3 className={styles.title}>{equipmentType === 'four_box_fridge' ? '4호박스' : '폴드냉장고'} 내부 편집</h3>

      {equipmentType === 'four_box_fridge' ? (
        <>
          {renderPanel(4)}
          {renderPanel(3)}
          {renderPanel(2)}
          {renderPanel(1)}
        </>
      ) : (
        <>
          {renderPanel(2)}
          {renderPanel(1)}
        </>
      )}

      {/* 선택된 아이템 상세 */}
      {selectedInfo && selectedInfo.item.type === 'ingredient' && (
        <div className={styles.detailSection}>
          <span className={styles.detailLabel}>재료 연결:</span>
          <select
            className={styles.fkSelect}
            value={selectedInfo.item.ingredientId ?? ''}
            onChange={(e) => handleIngredientChange(selectedInfo.level, selectedInfo.index, e.target.value || null)}
          >
            <option value="">-- 재료 선택 --</option>
            {ingredients.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.display_name}
              </option>
            ))}
          </select>
          {selectedInfo.item.ingredientId && (
            <button
              className={styles.fkUnlinkBtn}
              onClick={() => handleIngredientChange(selectedInfo.level, selectedInfo.index, null)}
            >
              연결 해제
            </button>
          )}
        </div>
      )}

      {selectedInfo && selectedInfo.item.type === 'basket' && (
        <div className={styles.detailSection}>
          <span className={styles.detailLabel}>바구니 내부:</span>
          <button
            className={styles.basketEditBtn}
            onClick={() => setSelectedBasketKey(selectedItemId)}
          >
            바구니 내부 편집
          </button>
          {selectedBasketKey === selectedItemId && (
            <button
              className={styles.fkUnlinkBtn}
              onClick={() => setSelectedBasketKey(null)}
            >
              편집 닫기
            </button>
          )}
        </div>
      )}

      {/* 2단계 깊이: 바구니 GridEditor */}
      {basketEditInfo && (
        <GridEditor
          equipmentId={`${equipmentId}-basket-${basketEditInfo.level}-${basketEditInfo.index}`}
          equipmentType="basket"
          config={basketEditInfo.item.basketConfig && isBasketConfig(basketEditInfo.item.basketConfig)
            ? basketEditInfo.item.basketConfig as unknown as Record<string, unknown>
            : {}}
          ingredients={ingredients}
          onConfigChange={handleBasketConfigChange}
        />
      )}
    </div>
  );
};

export default FridgeInternalEditor;

// ——— 내부 헬퍼 ———

function makeCells(rows: number, cols: number) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ row: r, col: c, rowSpan: 1, colSpan: 1, ingredientId: null });
    }
  }
  return cells;
}
