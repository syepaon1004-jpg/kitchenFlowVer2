import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PanelEquipmentType } from '../../types/db';
import type { EquipmentInteractionState, FridgeInternalItem, ClickTarget } from '../../types/game';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import { useShallow } from 'zustand/react/shallow';
import { PLACED_CONTAINER_SIZE_VH } from '../../lib/interaction/constants';
import { isGridConfig, isFoldFridgeConfig, getBindAnchor } from '../../types/game';
import styles from './GameKitchenView.module.css';

// ——— 타입/상수 (admin/layout-editor/types.ts와 동일, 컴포넌트 공유 금지이므로 복제) ———

interface LocalEquipment {
  id: string;
  panelIndex: number;
  equipmentType: PanelEquipmentType;
  x: number;
  y: number;
  width: number;
  height: number;
  equipmentIndex: number;
  config: Record<string, unknown>;
  placeable: boolean;
  sortOrder: number;
}

interface LocalGameItem {
  id: string;
  panelIndex: number;
  itemType: 'ingredient' | 'container';
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  ingredientId?: string | null;
  containerId?: string | null;
}

// ——— 그리드 유틸 (admin과 import 공유 금지이므로 복제) ———

interface GridCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  ingredientId: string | null;
}

interface GridConfig {
  rows: number;
  cols: number;
  cells: GridCell[];
}

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

// ——— 상수 ———

const EQUIPMENT_COLORS: Record<PanelEquipmentType, string> = {
  drawer: '#C0C0C0', fold_fridge: '#C0C0C0', basket: 'transparent',
  burner: '#888888', sink: '#6699CC', worktop: '#A0845C', shelf: '#8B7355',
};

const EQUIPMENT_LABELS: Record<PanelEquipmentType, string> = {
  drawer: '서랍', fold_fridge: '폴드 냉장고', basket: '바구니',
  burner: '화구', sink: '씽크대', worktop: '작업대', shelf: '선반',
};

const BURNER_COLORS: Record<0 | 1 | 2, string> = { 0: '#888888', 1: '#E8820C', 2: '#CC2200' };
const STIR_DURATION = 30000;
const STIR_INTERVAL = 100;

const INITIAL_INTERACTION: EquipmentInteractionState = {
  drawers: {}, burners: {}, baskets: {}, foldFridges: {},
};

/** 장비 타입 → data-click-target 값 (shelf은 null → 부착하지 않음) */
function getEquipmentClickTarget(eqType: PanelEquipmentType): string | null {
  switch (eqType) {
    case 'drawer':
    case 'fold_fridge':
    case 'basket':
      return 'equipment-toggle';
    case 'burner':
      return 'burner';
    case 'worktop':
      return 'worktop';
    case 'sink':
      return 'sink';
    case 'shelf':
      return null;
    default:
      return null;
  }
}

// ——— Props ———

export interface WokContentEntry {
  ingredientId: string;
  displayName: string;
  quantity: number;
  unit: string;
}

export interface PlacedContainerEntry {
  instanceId: string;
  equipmentId: string;
  localX: number;
  localY: number;
  label: string;
  contents: string[];
}

interface Props {
  panelHeights: number[];
  perspectiveDeg: number;
  previewYOffset: number;
  backgroundImageUrl: string | null;
  equipment: LocalEquipment[];
  items: LocalGameItem[];
  ingredientLabelsMap: Map<string, string>;
  wokContentsMap?: Map<string, WokContentEntry[]>;
  placedContainers?: PlacedContainerEntry[];
  hasSelection?: boolean;
  panelToStateIdMap?: Map<string, string>;
  onSceneClick?: (target: ClickTarget) => void;
  children?: React.ReactNode; // BillQueue slot
}

function degToPerspectivePx(deg: number, h: number): number {
  return h / (2 * Math.tan((deg * Math.PI) / 360));
}

function getBasketCorrection(panelIndex: number): string {
  if (panelIndex === 1) return 'none';
  return 'translateZ(1px) rotateX(90deg)';
}

// ——— 컴포넌트 ———

const GameKitchenView = ({
  panelHeights, perspectiveDeg, previewYOffset, backgroundImageUrl, equipment, items, ingredientLabelsMap, wokContentsMap, placedContainers, hasSelection, panelToStateIdMap, onSceneClick, children,
}: Props) => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [interactionState, setInteractionState] = useState<EquipmentInteractionState>(INITIAL_INTERACTION);

  // equipmentStore에서 burner_level만 추출 (매 틱 wok_temp 변경 시 리렌더 방지)
  const burnerLevelsRecord = useEquipmentStore(
    useShallow((s) => {
      const rec: Record<string, 0 | 1 | 2> = {};
      if (!panelToStateIdMap) return rec;
      for (const [panelId, stateId] of panelToStateIdMap) {
        const equip = s.equipments.find((e) => e.id === stateId);
        if (equip && equip.burner_level !== null && equip.burner_level <= 2) {
          rec[panelId] = equip.burner_level as 0 | 1 | 2;
        }
      }
      return rec;
    }),
  );

  useEffect(() => {
    const el = sceneRef.current?.parentElement;
    if (!el) return;
    const measure = () => setContainerHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const panelPxHeights = panelHeights.map((r) => Math.max(0, containerHeight * r));
  const perspectivePx = containerHeight > 0 ? degToPerspectivePx(perspectiveDeg, containerHeight) : 800;
  const translateY = (previewYOffset - 0.5) * containerHeight;

  // stir 상태 관리 (화구별, scene-level)
  const stirTimersRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const [stirProgressMap, setStirProgressMap] = useState<Map<string, number>>(new Map());
  const addStirring = useEquipmentStore((s) => s.addStirring);
  const removeStirring = useEquipmentStore((s) => s.removeStirring);

  const startSceneStir = useCallback((stateId: string) => {
    if (stirTimersRef.current.has(stateId)) return;
    // canStir 체크
    const equip = useEquipmentStore.getState().equipments.find((e) => e.id === stateId);
    if (!equip || !equip.burner_level || (equip.wok_status !== 'clean' && equip.wok_status !== 'overheating')) return;
    const { ingredientInstances, waterIngredientIds } = useGameStore.getState();
    const hasWater = ingredientInstances
      .filter((i) => i.equipment_state_id === stateId && i.location_type === 'equipment')
      .some((i) => waterIngredientIds.has(i.ingredient_id));
    if (hasWater) return;

    addStirring(stateId);
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += STIR_INTERVAL;
      setStirProgressMap((prev) => { const next = new Map(prev); next.set(stateId, elapsed); return next; });
      if (elapsed >= STIR_DURATION) {
        clearInterval(timer);
        stirTimersRef.current.delete(stateId);
        setStirProgressMap((prev) => { const next = new Map(prev); next.delete(stateId); return next; });
        removeStirring(stateId);
      }
    }, STIR_INTERVAL);
    stirTimersRef.current.set(stateId, timer);
  }, [addStirring, removeStirring]);

  const stopSceneStir = useCallback((stateId: string) => {
    const timer = stirTimersRef.current.get(stateId);
    if (timer) {
      clearInterval(timer);
      stirTimersRef.current.delete(stateId);
    }
    setStirProgressMap((prev) => { const next = new Map(prev); next.delete(stateId); return next; });
    removeStirring(stateId);
  }, [removeStirring]);

  useEffect(() => {
    return () => {
      for (const [stateId, timer] of stirTimersRef.current) {
        clearInterval(timer);
        removeStirring(stateId);
      }
      stirTimersRef.current.clear();
    };
  }, [removeStirring]);

  // hit-test 인터랙션
  const handleInteraction = useCallback((eqId: string, eqType: string) => {
    setInteractionState((prev) => {
      switch (eqType) {
        case 'drawer':
          return { ...prev, drawers: { ...prev.drawers, [eqId]: { isOpen: !(prev.drawers[eqId]?.isOpen) } } };
        case 'basket':
          return { ...prev, baskets: { ...prev.baskets, [eqId]: { isExpanded: !(prev.baskets[eqId]?.isExpanded) } } };
        case 'fold_fridge':
          return { ...prev, foldFridges: { ...prev.foldFridges, [eqId]: { isOpen: !(prev.foldFridges[eqId]?.isOpen) } } };
        default:
          return prev;
      }
    });
  }, []);

  const handleSceneMouseDown = useCallback((e: React.MouseEvent) => {
    const sceneEl = sceneRef.current;
    if (!sceneEl) return;
    const { clientX, clientY } = e;

    // 1. data-click-target 요소 전체 수집 + 히트 판별
    const clickTargetEls = sceneEl.querySelectorAll('[data-click-target]');
    const hits: { el: HTMLElement; area: number }[] = [];

    for (const el of clickTargetEls) {
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        hits.push({ el: el as HTMLElement, area: rect.width * rect.height });
      }
    }

    // 2. 면적 오름차순 정렬 (가장 구체적인 타겟 우선)
    hits.sort((a, b) => a.area - b.area);

    // 3. 닫힌 장비 내부 셀 필터링 + 최우선 타겟 선택
    let selectedHit: HTMLElement | null = null;
    for (const hit of hits) {
      const parentEqId = hit.el.dataset.parentEquipmentId;
      if (parentEqId) {
        const parentEqType = hit.el.dataset.parentEquipmentType;
        // interactionState에서 열림 상태 확인
        let isParentOpen = false;
        if (parentEqType === 'drawer') {
          isParentOpen = interactionState.drawers[parentEqId]?.isOpen ?? false;
        } else if (parentEqType === 'basket') {
          isParentOpen = interactionState.baskets[parentEqId]?.isExpanded ?? false;
        } else if (parentEqType === 'fold_fridge') {
          isParentOpen = interactionState.foldFridges[parentEqId]?.isOpen ?? false;
        }
        if (!isParentOpen) continue; // 닫혀있으면 skip
      }
      selectedHit = hit.el;
      break;
    }

    if (selectedHit) {
      e.preventDefault();
      const targetType = selectedHit.dataset.clickTarget!;

      // equipment-toggle: 내부에서 자체 처리 (서랍/냉장고/바구니)
      if (targetType === 'equipment-toggle') {
        const toggleMetaStr = selectedHit.dataset.clickMeta;
        const toggleMeta = toggleMetaStr ? JSON.parse(toggleMetaStr) as Record<string, string> : {};
        const eqId = selectedHit.dataset.equipmentId ?? toggleMeta.equipmentId;
        const eqType = selectedHit.dataset.equipmentType ?? toggleMeta.equipmentType;
        handleInteraction(eqId, eqType);
        // onSceneClick에도 전달 (선택 상태 관리용)
        onSceneClick?.({
          type: 'equipment-toggle',
          equipmentId: eqId,
          equipmentType: eqType,
        });
        return;
      }

      // burner: rect 세로 이등분으로 fire/stir 판별
      if (targetType === 'burner') {
        const burnerMetaStr = selectedHit.dataset.clickMeta;
        const burnerMeta = burnerMetaStr ? JSON.parse(burnerMetaStr) as Record<string, string> : {};
        const eqId = selectedHit.dataset.equipmentId ?? burnerMeta.equipmentId;
        const rect = selectedHit.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const isStirHalf = clientY >= midY;

        if (!hasSelection) {
          if (isStirHalf) {
            // 하단 절반 → stir 시작
            const stateId = panelToStateIdMap?.get(eqId);
            if (stateId) startSceneStir(stateId);
            return;
          } else {
            // 상단 절반 → 불 단계 순환
            const stateId = panelToStateIdMap?.get(eqId);
            if (stateId) {
              const equip = useEquipmentStore.getState().equipments.find((e) => e.id === stateId);
              if (equip && equip.burner_level !== null) {
                const next = ((equip.burner_level + 1) % 3) as 0 | 1 | 2;
                useEquipmentStore.getState().updateEquipment(stateId, { burner_level: next });
              }
            }
          }
        }

        onSceneClick?.({
          type: 'burner',
          equipmentId: eqId,
          equipmentType: 'burner',
          localRatio: {
            x: (clientX - rect.left) / rect.width,
            y: (clientY - rect.top) / rect.height,
          },
        });
        return;
      }

      // 기타 타겟: ClickTarget 구성 후 onSceneClick 호출
      const metaStr = selectedHit.dataset.clickMeta;
      const meta = metaStr ? JSON.parse(metaStr) as Record<string, string> : {};

      const clickTarget: ClickTarget = {
        type: targetType as ClickTarget['type'],
        equipmentId: selectedHit.dataset.equipmentId ?? meta.equipmentId,
        equipmentType: selectedHit.dataset.equipmentType ?? meta.equipmentType,
        ingredientId: meta.ingredientId,
        containerId: meta.containerId,
        containerInstanceId: meta.containerInstanceId,
        equipmentStateId: meta.equipmentStateId,
      };

      // worktop/burner/sink: 장비 내 로컬 비율 계산 (그릇 올려놓기 좌표)
      if (targetType === 'worktop' || targetType === 'burner' || targetType === 'sink') {
        const rect = selectedHit.getBoundingClientRect();
        clickTarget.localRatio = {
          x: (clientX - rect.left) / rect.width,
          y: (clientY - rect.top) / rect.height,
        };
      }

      onSceneClick?.(clickTarget);
      return;
    }

    // 히트 없음 → empty-area
    onSceneClick?.({ type: 'empty-area' });
  }, [handleInteraction, interactionState, hasSelection, onSceneClick, panelToStateIdMap, startSceneStir]);

  const handleSceneMouseUp = useCallback(() => {
    for (const stateId of stirTimersRef.current.keys()) {
      stopSceneStir(stateId);
    }
  }, [stopSceneStir]);

  // 패널 렌더링 (부모-자식 중첩)
  const renderPanel = (index: number): React.ReactNode => {
    let rotateX = '0deg';
    if (index === 0) rotateX = '-20deg';
    else if (index === 1) rotateX = '90deg';
    else rotateX = '-90deg';

    const panelEquipment = equipment.filter((eq) => eq.panelIndex === index);

    return (
      <div
        className={styles.panelWrapper}
        style={{
          height: panelPxHeights[index],
          transformOrigin: index === 0 ? 'center center' : 'top center',
          transform: `rotateX(${rotateX})`,
        }}
      >
        <div className={styles.panelFace} style={{ background: 'transparent', border: 'none' }}>
          {/* 장비 렌더링 */}
          <div className={styles.equipmentLayer}>
            {panelEquipment.map((eq) => {
              // 장비 타입별 data-click-target 분기
              const eqClickTarget = getEquipmentClickTarget(eq.equipmentType);
              return (
                <div
                  key={eq.id}
                  className={styles.eqItem}
                  data-equipment-id={eq.id}
                  data-equipment-type={eq.equipmentType}
                  {...(eqClickTarget ? {
                    'data-click-target': eqClickTarget,
                    'data-click-meta': JSON.stringify({ equipmentId: eq.id, equipmentType: eq.equipmentType }),
                  } : {})}
                  style={{
                    left: `${eq.x * 100}%`,
                    top: `${eq.y * 100}%`,
                    width: `${eq.width * 100}%`,
                    height: `${eq.height * 100}%`,
                  }}
                >
                  {renderEquipment(eq, interactionState, index, ingredientLabelsMap, burnerLevelsRecord[eq.id] ?? 0, panelToStateIdMap?.get(eq.id), stirProgressMap.get(panelToStateIdMap?.get(eq.id) ?? '') ?? 0)}
                </div>
              );
            })}
          </div>

          {/* 아이템 레이어 (장비 위) */}
          <div className={styles.itemLayer}>
            {items.filter((it) => it.panelIndex === index).map((item) => (
              <div
                key={item.id}
                className={styles.panelItem}
                data-click-target={item.itemType === 'container' ? 'container-source' : 'ingredient-source'}
                data-click-meta={JSON.stringify(
                  item.itemType === 'container'
                    ? { containerId: item.containerId }
                    : { ingredientId: item.ingredientId },
                )}
                style={{
                  left: `${item.x * 100}%`,
                  top: `${item.y * 100}%`,
                  width: `${item.width * 100}%`,
                  height: `${item.height * 100}%`,
                }}
              >
                <span className={styles.itemLabel}>{item.label}</span>
              </div>
            ))}
          </div>

          {/* 올려놓인 그릇: 해당 패널 장비에 속한 것만 렌더링 */}
          {placedContainers
            ?.filter((pc) => panelEquipment.some((eq) => eq.id === pc.equipmentId))
            .map((pc) => {
              const eq = panelEquipment.find((e) => e.id === pc.equipmentId)!;
              const absX = eq.x + pc.localX * eq.width;
              const absY = eq.y + pc.localY * eq.height;
              const sizeVh = PLACED_CONTAINER_SIZE_VH;

              return (
                <div
                  key={pc.instanceId}
                  className={styles.placedContainer}
                  data-click-target="placed-container"
                  data-click-meta={JSON.stringify({ containerInstanceId: pc.instanceId })}
                  style={{
                    position: 'absolute',
                    left: `${absX * 100}%`,
                    top: `${absY * 100}%`,
                    width: `${sizeVh}vh`,
                    height: `${sizeVh}vh`,
                    transform: 'translate(-50%, -100%) rotateX(-90deg)',
                    transformOrigin: 'bottom center',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <span className={styles.placedContainerLabel}>{pc.label}</span>
                  {pc.contents.length > 0 && (
                    <div className={styles.placedContainerContents}>
                      {pc.contents.map((c, i) => (
                        <span key={i}>{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

          {/* 홀로그램: 패널 1에서만, 화구 위치에 자동 생성 */}
          {index === 0 && equipment
            .filter((eq) => eq.equipmentType === 'burner')
            .map((burner) => {
              const contents = wokContentsMap?.get(burner.id) ?? [];
              return (
                <div
                  key={`holo-${burner.id}`}
                  className={styles.hologram}
                  data-click-target="hologram"
                  data-click-meta={JSON.stringify({ equipmentId: burner.id, equipmentStateId: panelToStateIdMap?.get(burner.id) })}
                  style={{
                    left: `${burner.x * 100}%`,
                    bottom: 0,
                    width: `${burner.width * 100}%`,
                    height: `${panelHeights[0] > 0 ? burner.height * (panelHeights[1] / panelHeights[0]) * 100 : burner.height * 100}%`,
                  }}
                >
                  {contents.length > 0 && (
                    <div className={styles.hologramContents}>
                      {contents.map((c) => (
                        <span key={c.ingredientId} className={styles.hologramItem}>
                          {c.displayName} {c.quantity}{c.unit}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
    <div className={styles.kitchenViewRoot}>
      {/* BillQueue: 일반 flow, 크기 고정 */}
      {children && <div className={styles.billQueueArea}>{children}</div>}

      {/* 3D scene 영역 */}
      <div className={styles.kitchenSceneArea}>
        {backgroundImageUrl ? (
          <img src={backgroundImageUrl} alt="주방 배경" className={styles.backgroundImage} draggable={false} />
        ) : (
          <div className={styles.placeholderBg} />
        )}

        <div className={styles.panelOverlay}>
          <div
            ref={sceneRef}
            className={styles.scene}
            style={{ perspective: `${perspectivePx}px`, cursor: 'pointer' }}
            onMouseDown={handleSceneMouseDown}
            onMouseUp={handleSceneMouseUp}
            onMouseLeave={handleSceneMouseUp}
          >
            <div className={styles.panelGroup} style={{ transform: `translateY(${translateY}px)` }}>
              {renderPanel(0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ——— BurnerPanel (hooks 사용을 위해 React 컴포넌트로 분리) ———

interface BurnerPanelProps {
  stateId: string | undefined;
  fireLevel: 0 | 1 | 2;
  stirProgress: number;
}

function BurnerPanel({ stateId, fireLevel, stirProgress }: BurnerPanelProps) {
  // 원시값 selector — 해당 필드 변경 시에만 리렌더
  const burnerLevel = useEquipmentStore((s) => {
    if (!stateId) return null;
    const e = s.equipments.find((eq) => eq.id === stateId);
    return e?.burner_level ?? null;
  });
  const wokStatus = useEquipmentStore((s) => {
    if (!stateId) return null;
    const e = s.equipments.find((eq) => eq.id === stateId);
    return e?.wok_status ?? null;
  });
  const wokTemp = useEquipmentStore((s) => {
    if (!stateId) return null;
    const e = s.equipments.find((eq) => eq.id === stateId);
    return e?.wok_temp ?? null;
  });
  const isStirring = useEquipmentStore((s) => stateId ? s.stirring_equipment_ids.has(stateId) : false);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const waterIngredientIds = useGameStore((s) => s.waterIngredientIds);

  const wokIngredients = useMemo(
    () => stateId
      ? ingredientInstances.filter((i) => i.equipment_state_id === stateId && i.location_type === 'equipment')
      : [],
    [ingredientInstances, stateId],
  );

  const hasWaterInWok = useMemo(
    () => wokIngredients.some((i) => waterIngredientIds.has(i.ingredient_id)),
    [wokIngredients, waterIngredientIds],
  );

  const canStir = !!burnerLevel
    && (wokStatus === 'clean' || wokStatus === 'overheating')
    && !hasWaterInWok;

  const statusBg = wokStatus === 'burned' ? 'var(--color-error)'
    : wokStatus === 'overheating' ? 'var(--color-warning)'
    : BURNER_COLORS[fireLevel];

  return (
    <div style={{
      position: 'absolute', inset: 0, background: statusBg,
      borderRadius: 4, transition: 'background 0.2s',
      display: 'flex', flexDirection: 'column', padding: 0, gap: 1,
    }}>
      {/* 온도 오버레이 */}
      {wokTemp !== null && (
        <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 8, color: 'rgba(255,255,255,0.8)', pointerEvents: 'none', zIndex: 3 }}>
          {wokTemp}°C
        </span>
      )}
      {/* BURNED 오버레이 */}
      {wokStatus === 'burned' && (
        <span style={{ position: 'absolute', bottom: 1, left: 0, width: '100%', textAlign: 'center', fontSize: 8, color: '#fff', fontWeight: 'bold', pointerEvents: 'none', zIndex: 3 }}>
          BURNED
        </span>
      )}
      {/* 불 버튼: 상단 절반 */}
      <button
        className={styles.eqInteractionBtn}
        style={{ position: 'relative', flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        data-action="fire"
      >
        불 {fireLevel}
      </button>
      {/* 볶기 버튼: 하단 절반 */}
      <button
        className={styles.eqInteractionBtn}
        style={{
          position: 'relative', flex: 1, width: '100%', overflow: 'hidden', touchAction: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isStirring ? 'var(--color-fire-active)' : canStir ? 'var(--color-warning)' : undefined,
          color: isStirring || canStir ? '#fff' : undefined,
          cursor: canStir ? 'pointer' : 'not-allowed',
        }}
        disabled={!canStir}
        data-action="stir"
      >
        <div
          className={styles.stirProgressBar}
          style={{
            width: `${(stirProgress / STIR_DURATION) * 100}%`,
            transition: `width ${STIR_INTERVAL}ms linear`,
          }}
        />
        <span className={styles.stirProgressLabel}>
          {isStirring ? `볶는 중 ${Math.round(stirProgress / 1000)}s` : '볶기'}
        </span>
      </button>
    </div>
  );
}

// ——— 장비 렌더링 ———

function renderEquipment(eq: LocalEquipment, state: EquipmentInteractionState, panelIndex: number, ingredientLabelsMap: Map<string, string>, burnerLevel: 0 | 1 | 2 = 0, stateId?: string, stirProgress = 0) {
  switch (eq.equipmentType) {
    case 'drawer': return renderDrawer(state.drawers[eq.id]?.isOpen ?? false, eq.id, eq.config, ingredientLabelsMap);
    case 'burner': return <BurnerPanel stateId={stateId} fireLevel={burnerLevel} stirProgress={stirProgress} />;
    case 'basket': return renderBasket(state.baskets[eq.id]?.isExpanded ?? false, eq.id, panelIndex, eq.config, ingredientLabelsMap);
    case 'fold_fridge': return renderFoldFridge(state.foldFridges[eq.id]?.isOpen ?? false, eq.id, eq.config, ingredientLabelsMap, state.baskets);
    case 'sink': return renderSink();
    default: return renderSimple(eq.equipmentType);
  }
}

function renderDrawer(isOpen: boolean, eqId: string, config: Record<string, unknown>, ingredientLabelsMap: Map<string, string>) {
  const openZ = isOpen ? 50 : 0;
  const grid = resolveGrid(config, 'drawer');
  const cellW = 1 / grid.cols;
  const cellH = 1 / grid.rows;

  return (
    <div className={styles.drawerContainer}>
      {/* 외부: top center 기준 -90deg 세우기 */}
      <div className={styles.drawerInner} style={{
        transform: `translateZ(${openZ}px) rotateX(-90deg)`,
        transformOrigin: 'top center', background: '#ddd',
        opacity: isOpen ? 1 : 0,
      }}>
        {/* 내부: 자체 중앙 기준 180deg 뒤집기 → 앞면이 뷰어를 향함 */}
        <div style={{
          position: 'absolute', inset: 0,
          transform: 'rotateX(180deg)',
          transformOrigin: 'center center',
        }}>
          {grid.cells.map((cell) => {
            const label = cell.ingredientId ? (ingredientLabelsMap.get(cell.ingredientId) ?? '') : '';
            return (
              <div
                key={`${cell.row}-${cell.col}`}
                {...(cell.ingredientId ? {
                  'data-click-target': 'ingredient-source',
                  'data-click-meta': JSON.stringify({ ingredientId: cell.ingredientId }),
                  'data-parent-equipment-id': eqId,
                  'data-parent-equipment-type': 'drawer',
                } : {})}
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
      <div className={styles.drawerFace} style={{
        transform: `translateZ(${openZ}px)`, background: EQUIPMENT_COLORS.drawer,
      }}>
        <div className={styles.eqHandleBar} style={{ bottom: 4 }} />
        <span className={styles.eqTypeLabel}>{EQUIPMENT_LABELS.drawer}</span>
      </div>
    </div>
  );
}


function renderBasket(isExpanded: boolean, eqId: string, panelIndex: number, config: Record<string, unknown>, ingredientLabelsMap: Map<string, string>) {
  const grid = resolveGrid(config, 'basket');
  const maxRow = grid.rows - 1;
  const cellW = 1 / grid.cols;
  const cellH = 1 / grid.rows;
  const cellHeightPx = 30;
  const correction = getBasketCorrection(panelIndex);

  const cellNodes = grid.cells.map((cell) => {
    const anchor = getBindAnchor(grid.cells, cell);
    const expandRow = anchor ? anchor.row : cell.row;
    const expandZ = isExpanded ? (maxRow - expandRow) * cellHeightPx : 0;
    const originY = anchor
      ? `${((anchor.row + anchor.rowSpan - cell.row) / cell.rowSpan) * 100}%`
      : '100%';
    const label = cell.ingredientId ? (ingredientLabelsMap.get(cell.ingredientId) ?? '') : '';

    return (
      <div key={`${cell.row}-${cell.col}`} className={styles.basketCell}
        {...(cell.ingredientId ? {
          'data-click-target': 'ingredient-source',
          'data-click-meta': JSON.stringify({ ingredientId: cell.ingredientId }),
          'data-parent-equipment-id': eqId,
          'data-parent-equipment-type': 'basket',
        } : {})}
        style={{
          left: `${cell.col * cellW * 100}%`, top: `${cell.row * cellH * 100}%`,
          width: `${cell.colSpan * cellW * 100}%`, height: `${cell.rowSpan * cellH * 100}%`,
          transformOrigin: `center ${originY}`,
          transform: `translateZ(${expandZ}px) rotateX(-90deg)`,
        }}>
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

  return (
    <div className={styles.basketContainer} style={{ transform: correction }}>
      {cellNodes}
      <button className={styles.eqInteractionBtn} style={{
        position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)',
      }} data-action="expand">
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
  ingredientLabelsMap: Map<string, string>,
  basketStates: Record<string, { isExpanded: boolean }>,
) {
  if (item.type === 'ingredient') {
    const label = item.ingredientId
      ? ingredientLabelsMap.get(item.ingredientId) ?? ''
      : '';
    return (
      <div
        key={`ing-${idx}`}
        {...(item.ingredientId ? {
          'data-click-target': 'ingredient-source',
          'data-click-meta': JSON.stringify({ ingredientId: item.ingredientId }),
          'data-parent-equipment-id': eqId,
          'data-parent-equipment-type': 'fold_fridge',
        } : {})}
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
          boxSizing: 'border-box' as const,
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
      data-click-target="equipment-toggle"
      data-click-meta={JSON.stringify({ equipmentId: syntheticKey, equipmentType: 'basket' })}
      data-parent-equipment-id={eqId}
      data-parent-equipment-type="fold_fridge"
      style={{
        position: 'absolute',
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        width: `${item.width * 100}%`,
        height: `${item.height * 100}%`,
        transformStyle: 'preserve-3d' as const,
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
          ? ingredientLabelsMap.get(cell.ingredientId) ?? ''
          : '';
        return (
          <div
            key={`${cell.row}-${cell.col}`}
            className={styles.basketCell}
            {...(cell.ingredientId ? {
              'data-click-target': 'ingredient-source',
              'data-click-meta': JSON.stringify({ ingredientId: cell.ingredientId }),
              'data-parent-equipment-id': eqId,
              'data-parent-equipment-type': 'fold_fridge',
            } : {})}
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
          position: 'absolute',
          bottom: -20,
          left: '50%',
          transform: 'translateX(-50%)',
        }}
        data-action="expand"
        data-click-target="equipment-toggle"
        data-click-meta={JSON.stringify({ equipmentId: syntheticKey, equipmentType: 'basket' })}
        data-parent-equipment-id={eqId}
        data-parent-equipment-type="fold_fridge"
      >
        {isExpanded ? '접기' : '펼치기'}
      </button>
    </div>
  );
}

function renderFoldFridge(
  isOpen: boolean,
  eqId: string,
  config: Record<string, unknown>,
  ingredientLabelsMap: Map<string, string>,
  basketStates: Record<string, { isExpanded: boolean }>,
) {
  const parsed = isFoldFridgeConfig(config) ? config : null;
  const panels = parsed?.panels ?? [];
  const level1Items = panels.find((p) => p.level === 1)?.items ?? [];
  const level2Items = panels.find((p) => p.level === 2)?.items ?? [];

  return (
    <div className={styles.fridgeContainer}>
      <div className={styles.fridgeInternalPanel} style={{
        bottom: 0, left: '2%', width: '96%', height: '48%',
        transformOrigin: 'center', transform: 'rotateX(90deg)',
        opacity: isOpen ? 1 : 0, transition: 'opacity 0.3s ease',
      }}>
        {level1Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 1, ingredientLabelsMap, basketStates))}
      </div>
      <div className={styles.fridgeInternalPanel} style={{
        bottom: '50%', left: '2%', width: '96%', height: '48%',
        transformOrigin: 'center', transform: 'rotateX(90deg)',
        opacity: isOpen ? 1 : 0, transition: 'opacity 0.3s ease',
      }}>
        {level2Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 2, ingredientLabelsMap, basketStates))}
      </div>
      <div className={styles.fridgeFace} style={{
        background: EQUIPMENT_COLORS.fold_fridge,
        opacity: isOpen ? 0 : 1, transition: 'opacity 0.3s ease',
      }}>
        <div className={styles.eqHandleBar} style={{ top: 4 }} />
        <span className={styles.eqTypeLabel}>{EQUIPMENT_LABELS.fold_fridge}</span>
      </div>
    </div>
  );
}

function renderSink() {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: EQUIPMENT_COLORS.sink,
      borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <button className={styles.eqInteractionBtn} disabled>씻기</button>
    </div>
  );
}

function renderSimple(type: PanelEquipmentType) {
  if (type === 'shelf') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', borderRadius: 2 }}>
        <div className={styles.shelfLeft} /><div className={styles.shelfMiddle} /><div className={styles.shelfRight} />
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: EQUIPMENT_COLORS[type], borderRadius: 2 }}>
      <span className={styles.eqTypeLabel}>{EQUIPMENT_LABELS[type]}</span>
    </div>
  );
}

export default GameKitchenView;
