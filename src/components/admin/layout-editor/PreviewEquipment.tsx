import type { LocalEquipment, PanelEquipmentType } from './types';
import type { EquipmentInteractionState, GridCell, GridConfig, FridgeInternalItem } from '../../../types/game';
import { isGridConfig, isFoldFridgeConfig, getBindAnchor } from '../../../types/game';
import type { StoreIngredient } from '../../../types/db';
import { EQUIPMENT_COLORS, EQUIPMENT_LABELS } from './types';
import styles from '../KitchenLayoutEditor.module.css';

// ——— 그리드 유틸 (admin/game import 공유 금지이므로 복제) ———

function makeDefaultGrid(rows: number, cols: number): GridConfig {
  const cells: GridCell[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ row: r, col: c, rowSpan: 1, colSpan: 1, ingredientId: null });
    }
  }
  return { rows, cols, cells };
}

function resolveGrid(config: Record<string, unknown>, eqType: 'drawer' | 'basket'): GridConfig {
  const inner = (config as Record<string, unknown>).grid;
  if (isGridConfig(inner)) return inner;
  return eqType === 'basket' ? makeDefaultGrid(2, 2) : makeDefaultGrid(1, 1);
}

const BURNER_COLORS: Record<0 | 1 | 2, string> = {
  0: '#888888',
  1: '#E8820C',
  2: '#CC2200',
};

interface Props {
  equipment: LocalEquipment[];
  panelIndex: number;
  interactionState: EquipmentInteractionState;
  ingredients: StoreIngredient[];
}

/** 미리보기 장비 렌더링 (3D transform + 인터랙션 UI) */
const PreviewEquipment = ({ equipment, panelIndex, interactionState, ingredients }: Props) => {
  const panelEquipment = equipment.filter((eq) => eq.panelIndex === panelIndex);

  return (
    <div className={styles.equipmentLayer}>
      {panelEquipment.map((eq) => (
        <div
          key={eq.id}
          className={styles.previewEqItem}
          data-equipment-id={eq.id}
          data-equipment-type={eq.equipmentType}
          style={{
            left: `${eq.x * 100}%`,
            top: `${eq.y * 100}%`,
            width: `${eq.width * 100}%`,
            height: `${eq.height * 100}%`,
          }}
        >
          {renderPreviewVisual(eq, interactionState, panelIndex, ingredients)}
        </div>
      ))}
    </div>
  );
};

/** 바구니 패널별 수평 보정 (패널 2 기준) */
function getBasketCorrection(panelIndex: number): string {
  if (panelIndex === 1) return 'none'; // 패널 2: 보정 없음
  // 패널 1, 3: 패널 2와의 누적 rotateX 차이(90deg)를 상쇄
  return 'translateZ(1px) rotateX(90deg)';
}

function renderPreviewVisual(eq: LocalEquipment, state: EquipmentInteractionState, panelIndex: number, ingredients: StoreIngredient[]) {
  switch (eq.equipmentType) {
    case 'drawer':
      return renderDrawer(eq.id, state.drawers[eq.id]?.isOpen ?? false, eq.config, ingredients);
    case 'burner':
      return renderBurner(state.burners[eq.id]?.fireLevel ?? 0);
    case 'basket':
      return renderBasket(state.baskets[eq.id]?.isExpanded ?? false, panelIndex, eq.config, ingredients);
    case 'fold_fridge':
      return renderFoldFridge(state.foldFridges[eq.id]?.isOpen ?? false, eq.id, eq.config, ingredients, state.baskets);
    case 'sink':
      return renderSink();
    default:
      return renderSimple(eq.equipmentType);
  }
}

/** 서랍: 컨테이너(preserve-3d) > 내부 판(translateZ + rotateX(-90deg) 고정) + face(translateZ) */
function renderDrawer(eqId: string, isOpen: boolean, config: Record<string, unknown>, ingredients: StoreIngredient[]) {
  const depth = typeof (config as Record<string, unknown>).depth === 'number'
    ? ((config as Record<string, unknown>).depth as number)
    : 0.5;
  // 깊이 0..1 → 40~120px translateZ 범위
  const openZ = isOpen ? Math.round(40 + depth * 80) : 0;
  const grid = resolveGrid(config, 'drawer');
  const cellW = 1 / grid.cols;
  const cellH = 1 / grid.rows;

  return (
    <div className={styles.drawerContainer}>
      {/* 외부: top center 기준 -90deg 세우기 */}
      <div
        className={styles.drawerInner}
        data-equipment-id={eqId}
        data-equipment-type="drawer"
        data-eq-hit-layer="inner"
        style={{
          transform: `translateZ(${openZ}px) rotateX(-90deg)`,
          transformOrigin: 'top center',
          background: '#ddd',
          opacity: isOpen ? 1 : 0,
          transition: 'transform 0.3s ease, opacity 0.15s ease',
        }}
      >
        {/* 내부: 자체 중앙 기준 180deg 뒤집기 → 앞면이 뷰어를 향함 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          transform: 'rotateX(180deg)',
          transformOrigin: 'center center',
        }}>
          {/* 그리드 셀 오버레이 */}
          {grid.cells.map((cell) => {
            const label = cell.ingredientId
              ? ingredients.find((i) => i.id === cell.ingredientId)?.display_name ?? ''
              : '';
            return (
              <div
                key={`${cell.row}-${cell.col}`}
                style={{
                  position: 'absolute',
                  left: `${cell.col * cellW * 100}%`,
                  top: `${cell.row * cellH * 100}%`,
                  width: `${cell.colSpan * cellW * 100}%`,
                  height: `${cell.rowSpan * cellH * 100}%`,
                  border: '1px solid rgba(0,0,0,0.15)',
                  boxSizing: 'border-box',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 8,
                  color: '#555',
                  overflow: 'hidden',
                }}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={styles.drawerFace}
        data-equipment-id={eqId}
        data-equipment-type="drawer"
        data-eq-hit-layer="face"
        style={{
          transform: `translateZ(${openZ}px)`,
          background: EQUIPMENT_COLORS.drawer,
        }}
      >
        <div className={styles.eqHandleBar} style={{ bottom: 4 }} />
        <span className={styles.eqTypeLabel}>{EQUIPMENT_LABELS.drawer}</span>
      </div>
    </div>
  );
}

/** 화구: 색상 변화 + 불조절/볶기 버튼 */
function renderBurner(fireLevel: 0 | 1 | 2) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: BURNER_COLORS[fireLevel],
        borderRadius: 4,
        transition: 'background 0.2s',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <button className={styles.eqInteractionBtn} data-action="fire">
        불 {fireLevel}
      </button>
      <button className={styles.eqInteractionBtn} disabled>
        볶기
      </button>
    </div>
  );
}

/** 바구니: config 기반 N×M 그리드 셀 세우기 + 펼치기 + 패널별 수평 보정 */
function renderBasket(isExpanded: boolean, panelIndex: number, config: Record<string, unknown>, ingredients: StoreIngredient[]) {
  const grid = resolveGrid(config, 'basket');
  const maxRow = grid.rows - 1;
  const cellW = 1 / grid.cols;
  const cellH = 1 / grid.rows;
  const cellHeightPx = 30;

  const cellNodes = grid.cells.map((cell) => {
    const anchor = getBindAnchor(grid.cells, cell);
    const expandRow = anchor ? anchor.row : cell.row;
    const expandZ = isExpanded ? (maxRow - expandRow) * cellHeightPx : 0;
    const originY = anchor
      ? `${((anchor.row + anchor.rowSpan - cell.row) / cell.rowSpan) * 100}%`
      : '100%';
    const label = cell.ingredientId
      ? ingredients.find((i) => i.id === cell.ingredientId)?.display_name ?? ''
      : '';

    return (
      <div
        key={`${cell.row}-${cell.col}`}
        className={styles.basketCell}
        style={{
          left: `${cell.col * cellW * 100}%`,
          top: `${cell.row * cellH * 100}%`,
          width: `${cell.colSpan * cellW * 100}%`,
          height: `${cell.rowSpan * cellH * 100}%`,
          transformOrigin: `center ${originY}`,
          transform: `translateZ(${expandZ}px) rotateX(-90deg)`,
        }}
      >
        <div className={styles.basketCellFace}>
          {label && (
            <span style={{ fontSize: 8, color: '#555', pointerEvents: 'none', userSelect: 'none' }}>
              {label}
            </span>
          )}
        </div>
      </div>
    );
  });

  const correction = getBasketCorrection(panelIndex);

  return (
    <div className={styles.basketContainer} style={{ transform: correction }}>
      {cellNodes}
      <button
        className={styles.eqInteractionBtn}
        style={{
          bottom: -20,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        data-action="expand"
      >
        {isExpanded ? '접기' : '펼치기'}
      </button>
    </div>
  );
}

/** 폴드냉장고 내부 아이템 1개 렌더링 (재료 또는 바구니) */
function renderFridgeItem(
  item: FridgeInternalItem,
  idx: number,
  eqId: string,
  level: 1 | 2,
  ingredients: StoreIngredient[],
  basketStates: Record<string, { isExpanded: boolean }>,
) {
  if (item.type === 'ingredient') {
    const label = item.ingredientId
      ? ingredients.find((i) => i.id === item.ingredientId)?.display_name ?? ''
      : '';
    return (
      <div
        key={`ing-${idx}`}
        style={{
          position: 'absolute',
          left: `${item.x * 100}%`,
          top: `${item.y * 100}%`,
          width: `${item.width * 100}%`,
          height: `${item.height * 100}%`,
          transformOrigin: 'bottom center',
          transform: 'rotateX(-90deg)',
          background: '#fff',
          border: '1px solid rgba(0,0,0,0.15)',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
          color: '#555',
          overflow: 'hidden',
        }}
      >
        {label}
      </div>
    );
  }

  // 바구니
  const basketGrid = item.basketConfig
    ? resolveGrid(item.basketConfig as unknown as Record<string, unknown>, 'basket')
    : null;
  if (!basketGrid) return null;

  const syntheticKey = `${eqId}_fridge_${level}_${idx}`;
  const isExpanded = basketStates[syntheticKey]?.isExpanded ?? false;
  const maxRow = basketGrid.rows - 1;
  const cellW = 1 / basketGrid.cols;
  const cellH = 1 / basketGrid.rows;
  const cellHeightPx = 30;

  return (
    <div
      key={`bsk-${idx}`}
      data-equipment-id={syntheticKey}
      data-equipment-type="basket"
      style={{
        position: 'absolute',
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        width: `${item.width * 100}%`,
        height: `${item.height * 100}%`,
        transformStyle: 'preserve-3d',
      }}
    >
      {basketGrid.cells.map((cell) => {
        const anchor = getBindAnchor(basketGrid.cells, cell);
        const expandRow = anchor ? anchor.row : cell.row;
        const expandZ = isExpanded ? (maxRow - expandRow) * cellHeightPx : 0;
        const originY = anchor
          ? `${((anchor.row + anchor.rowSpan - cell.row) / cell.rowSpan) * 100}%`
          : '100%';
        const cellLabel = cell.ingredientId
          ? ingredients.find((i) => i.id === cell.ingredientId)?.display_name ?? ''
          : '';
        return (
          <div
            key={`${cell.row}-${cell.col}`}
            className={styles.basketCell}
            style={{
              left: `${cell.col * cellW * 100}%`,
              top: `${cell.row * cellH * 100}%`,
              width: `${cell.colSpan * cellW * 100}%`,
              height: `${cell.rowSpan * cellH * 100}%`,
              transformOrigin: `center ${originY}`,
              transform: `translateZ(${expandZ}px) rotateX(-90deg)`,
            }}
          >
            <div className={styles.basketCellFace}>
              {cellLabel && (
                <span style={{ fontSize: 8, color: '#555', pointerEvents: 'none', userSelect: 'none' }}>
                  {cellLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
      <button
        className={styles.eqInteractionBtn}
        style={{
          bottom: -20,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        data-action="expand"
      >
        {isExpanded ? '접기' : '펼치기'}
      </button>
    </div>
  );
}

/** 폴드냉장고: 내부 패널(항상 DOM, 세로 적층) + face(opacity) */
function renderFoldFridge(
  isOpen: boolean,
  eqId: string,
  config: Record<string, unknown>,
  ingredients: StoreIngredient[],
  basketStates: Record<string, { isExpanded: boolean }>,
) {
  const parsed = isFoldFridgeConfig(config) ? config : null;
  const panels = parsed?.panels ?? [];
  const level1Items = panels.find((p) => p.level === 1)?.items ?? [];
  const level2Items = panels.find((p) => p.level === 2)?.items ?? [];

  return (
    <div className={styles.fridgeContainer}>
      {/* 내부 패널 2장: 항상 DOM 존재 (원칙서 2.2), 세로 적층, opacity로 가시성 제어 */}
      <div
        className={styles.fridgeInternalPanel}
        style={{
          bottom: 0,
          left: '2%',
          width: '96%',
          height: '48%',
          transformOrigin: 'center',
          transform: 'rotateX(90deg)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {level1Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 1, ingredients, basketStates))}
      </div>
      <div
        className={styles.fridgeInternalPanel}
        style={{
          bottom: '50%',
          left: '2%',
          width: '96%',
          height: '48%',
          transformOrigin: 'center',
          transform: 'rotateX(90deg)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {level2Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 2, ingredients, basketStates))}
      </div>
      {/* face: opacity로 사라짐/나타남 */}
      <div
        className={styles.fridgeFace}
        style={{
          background: EQUIPMENT_COLORS.fold_fridge,
          opacity: isOpen ? 0 : 1,
          transition: 'opacity 0.3s ease',
        }}
      >
        <div className={styles.eqHandleBar} style={{ top: 4 }} />
        <span className={styles.eqTypeLabel}>{EQUIPMENT_LABELS.fold_fridge}</span>
      </div>
    </div>
  );
}

/** 씽크대 */
function renderSink() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: EQUIPMENT_COLORS.sink,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <button className={styles.eqInteractionBtn} disabled>
        씻기
      </button>
    </div>
  );
}

/** 작업대/선반: 편집과 동일, 인터랙션 없음 */
function renderSimple(type: PanelEquipmentType) {
  const color = EQUIPMENT_COLORS[type];
  if (type === 'shelf') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', borderRadius: 2 }}>
        <div className={styles.shelfLeft} />
        <div className={styles.shelfMiddle} />
        <div className={styles.shelfRight} />
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: color, borderRadius: 2 }}>
      <span className={styles.eqTypeLabel}>{EQUIPMENT_LABELS[type]}</span>
    </div>
  );
}

export default PreviewEquipment;
