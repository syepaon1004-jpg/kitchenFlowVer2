import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PanelEquipmentType, ImageFitMode } from '../../types/db';
import type { EquipmentInteractionState, FridgeInternalItem, ClickTarget, SelectionState, GridCell, GridConfig } from '../../types/game';
import { computeWorldWidthPx, computeWorldTranslateX } from '../../lib/sections/camera';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import { useUiStore } from '../../stores/uiStore';
import { MIN_STIR_TEMP } from '../../lib/physics/wok';
import { useShallow } from 'zustand/react/shallow';
import { PLACED_CONTAINER_SIZE_VH } from '../../lib/interaction/constants';
import { resolveAction } from '../../lib/interaction/resolveAction';
import { getEquipmentPositionStyle } from '../../lib/equipment-position';
import { isGridConfig, isFoldFridgeConfig, getBindAnchor } from '../../types/game';
import { cellRect } from '../../lib/grid-layout';
import WokComponent from '../equipment/WokComponent';
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

// ——— 그리드 유틸 ———

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
  drawer: '#C0C0C0', fold_fridge: '#C0C0C0', four_box_fridge: '#C0C0C0', basket: 'transparent',
  burner: '#888888', sink: '#6699CC', worktop: '#C0C0C0', shelf: '#8B7355',
  filler_panel: 'var(--color-filler-panel)',
};

const EQUIP_RADIUS = 6;

const BURNER_COLORS: Record<0 | 1 | 2, string> = { 0: '#888888', 1: '#E8820C', 2: '#CC2200' };
const STIR_DURATION = 5000;
const SCENE_WASH_DURATION = 3000;

const INITIAL_INTERACTION: EquipmentInteractionState = {
  drawers: {}, burners: {}, baskets: {}, foldFridges: {}, fourBoxFridges: {},
};

/** 장비 타입 → data-click-target 값 (shelf은 null → 부착하지 않음) */
function getEquipmentClickTarget(eqType: PanelEquipmentType): string | null {
  switch (eqType) {
    case 'drawer':
    case 'fold_fridge':
    case 'basket':
      return 'equipment-toggle';
    case 'four_box_fridge':
      return null; // top/bottom face가 직접 click target 담당
    case 'burner':
      return 'burner';
    case 'worktop':
      return 'worktop';
    case 'sink':
      return 'sink';
    case 'shelf':
      return null;
    case 'filler_panel':
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
  /** 레시피 평가 결과: 모든 재료/액션 매칭 → true */
  isComplete: boolean;
  /** 매핑된 주문 id (서빙 버튼 트리거용). 미할당 그릇은 null */
  orderId: string | null;
  /** 같은 주문의 모든 그릇이 완료된 상태(= 서빙 가능). false면 체크만 표시 */
  canServe: boolean;
}

interface Props {
  panelHeights: number[];
  perspectiveDeg: number;
  previewYOffset: number;
  backgroundImageUrl: string | null;
  /** 카메라 중심 X (이미지 월드 기준 0~1) — 섹션 슬라이드용 */
  cameraCenterX?: number;
  /** 배경 이미지 핏 모드 (기본 cover) */
  imageFitMode?: ImageFitMode;
  equipment: LocalEquipment[];
  items: LocalGameItem[];
  ingredientLabelsMap: Map<string, string>;
  wokContentsMap?: Map<string, WokContentEntry[]>;
  placedContainers?: PlacedContainerEntry[];
  hasSelection?: boolean;
  /** 선택 상태 (선택된 요소 시각 강조용) */
  selection?: SelectionState | null;
  panelToStateIdMap?: Map<string, string>;
  onSceneClick?: (target: ClickTarget) => void;
  onRegisterCollapseBaskets?: (fn: () => void) => void;
  children?: React.ReactNode; // BillQueue slot
}

/** 선택 매칭 헬퍼: 게임 내 요소가 현재 선택과 일치하는지 */
function isIngredientSelected(selection: SelectionState | null | undefined, ingredientId: string | null | undefined): boolean {
  if (!selection || !ingredientId) return false;
  return selection.type === 'ingredient' && selection.ingredientId === ingredientId;
}

function isContainerSourceSelected(selection: SelectionState | null | undefined, containerId: string | null | undefined): boolean {
  if (!selection || !containerId) return false;
  return selection.type === 'container' && selection.containerId === containerId && !selection.containerInstanceId;
}

function isPlacedContainerSelected(selection: SelectionState | null | undefined, instanceId: string | null | undefined): boolean {
  if (!selection || !instanceId) return false;
  return selection.type === 'placed-container' && selection.containerInstanceId === instanceId;
}

function isWokContentSelected(selection: SelectionState | null | undefined, equipmentStateId: string | null | undefined): boolean {
  if (!selection || !equipmentStateId) return false;
  return selection.type === 'wok-content' && selection.equipmentStateId === equipmentStateId;
}

function degToPerspectivePx(deg: number, h: number): number {
  return h / (2 * Math.tan((deg * Math.PI) / 360));
}

function getBasketCorrection(panelIndex: number): string {
  if (panelIndex === 1) return 'none';
  return 'translateZ(1px) rotateX(90deg)';
}

// ——— 볶기 진행 오버레이 (화구 홀로그램 중앙) ———

function StirProgressOverlay({ totalSec }: { totalSec: number }) {
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      const e = Math.min(totalSec, Math.floor((Date.now() - started) / 1000));
      setElapsedSec(e);
    }, 200);
    return () => clearInterval(id);
  }, [totalSec]);
  return (
    <div className={styles.stirOverlay}>
      <span className={styles.stirFlame}>🔥</span>
      <span className={styles.stirCounter}>{elapsedSec}s / {totalSec}s</span>
    </div>
  );
}

interface BurnerHologramProps {
  burner: LocalEquipment;
  stateId: string | undefined;
  contents: WokContentEntry[];
  selection: SelectionState | null | undefined;
  styleProps: React.CSSProperties;
}

function BurnerHologram({ burner, stateId, contents, selection, styleProps }: BurnerHologramProps) {
  const isStirring = useEquipmentStore(
    (s) => (stateId ? s.stirring_equipment_ids.has(stateId) : false),
  );
  const atSink = useEquipmentStore(
    (s) => (stateId ? s.wok_at_sink.has(stateId) : false),
  );
  const wokStatus = useEquipmentStore((s) => {
    if (!stateId) return null;
    return s.equipments.find((e) => e.id === stateId)?.wok_status ?? null;
  });
  const wokTemp = useEquipmentStore((s) => {
    if (!stateId) return null;
    return s.equipments.find((e) => e.id === stateId)?.wok_temp ?? null;
  });
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
  const allBoiled = useMemo(() => {
    if (wokIngredients.length === 0) return false;
    return wokIngredients.every((i) => {
      const boil = i.action_history.find((h) => h.actionType === 'boil');
      return !!boil && boil.seconds >= 10;
    });
  }, [wokIngredients]);

  if (atSink) return null;

  const overrideMessage = wokStatus === 'dirty' ? '씽크대로 옮겨 주세요'
    : wokStatus === 'burned' ? 'BURNED'
    : wokStatus === 'overheating' ? '과열'
    : null;
  const overrideBg = wokStatus === 'dirty' ? 'rgba(121, 85, 72, 0.85)'
    : wokStatus === 'burned' ? 'var(--color-error)'
    : wokStatus === 'overheating' ? 'var(--color-warning)'
    : null;
  const bottomLabel = overrideMessage == null && !isStirring
    ? (allBoiled
      ? { text: '모두 끓었다', color: 'var(--color-success)' }
      : (hasWaterInWok && wokTemp === 100)
        ? { text: '끓는 중', color: '#fff' }
        : null)
    : null;

  const wokSelected = isWokContentSelected(selection, stateId);
  const classNames = [styles.hologram];
  if (wokSelected) classNames.push(styles.gameSelected);
  if (isStirring) classNames.push(styles.hologramStirring);

  const finalStyle: React.CSSProperties = {
    ...styleProps,
    ...(bottomLabel && typeof styleProps.height === 'string'
      ? { height: `calc(${styleProps.height} + 1.6em)` }
      : {}),
    ...(overrideBg ? { background: overrideBg } : {}),
  };

  return (
    <div
      className={classNames.join(' ')}
      data-click-target="hologram"
      data-click-meta={JSON.stringify({ equipmentId: burner.id, equipmentStateId: stateId })}
      style={finalStyle}
    >
      {isStirring ? (
        <StirProgressOverlay totalSec={STIR_DURATION / 1000} />
      ) : overrideMessage ? (
        <div className={styles.hologramOverrideLabel}>{overrideMessage}</div>
      ) : (
        <>
          {contents.length > 0 && (
            <div
              className={styles.hologramContents}
              style={bottomLabel ? { paddingBottom: '1.6em' } : undefined}
            >
              {contents.map((c) => (
                <span key={c.ingredientId} className={styles.hologramItem}>
                  {c.displayName} {c.quantity}{c.unit}
                </span>
              ))}
            </div>
          )}
          {bottomLabel && (
            <div className={styles.hologramBottomLabel} style={{ color: bottomLabel.color }}>
              {bottomLabel.text}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ——— 컴포넌트 ———

const GameKitchenView = ({
  panelHeights, perspectiveDeg, previewYOffset, backgroundImageUrl, cameraCenterX = 0.5, imageFitMode = 'cover', equipment, items, ingredientLabelsMap, wokContentsMap, placedContainers, hasSelection, selection, panelToStateIdMap, onSceneClick, onRegisterCollapseBaskets, children,
}: Props) => {
  const sceneRef = useRef<HTMLDivElement>(null);
  const sceneAreaRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
  const [interactionState, setInteractionState] = useState<EquipmentInteractionState>(INITIAL_INTERACTION);
  // pointerId당 개별 stir 홀드 추적 — 멀티터치로 여러 웍을 동시에 웍질할 수 있게 함
  const activeStirMapRef = useRef<Map<number, { stateId: string; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const activeWashEquipmentIdRef = useRef<string | null>(null);
  const activeWashCompletionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // 배경 URL이 바뀔 때: 캐시 히트로 load 이벤트가 핸들러 부착 전 발생한 경우에도
  // img.complete로 결정적 세팅. onLoad와의 race 제거.
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
    } else {
      setImgNatural(null);
    }
  }, [backgroundImageUrl]);

  // kitchenSceneArea (viewport) 크기 관찰 — 이미지 월드 폭과 카메라 translate 계산의 기준
  useEffect(() => {
    const el = sceneAreaRef.current;
    if (!el) return;
    const measure = () => {
      setContainerHeight(el.clientHeight);
      setViewportWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // iOS WebKit 패널 2 렌더 워크어라운드 (v17 real drawer auto open/close):
  // Panel 2에 배치된 실제 drawer를 마운트 직후 자동 open → 1초 후 close.
  // drawer 애니메이션이 사용자에게 보이며, Panel 2 basket/placedContainer 초기
  // 투명 증상이 복구되는지 시각으로 확인 가능.
  const autoDrawerDoneRef = useRef(false);
  useEffect(() => {
    if (!containerHeight || autoDrawerDoneRef.current) return;
    const panel2Drawer = equipment.find((eq) => eq.panelIndex === 1 && eq.equipmentType === 'drawer');
    if (!panel2Drawer) return;
    autoDrawerDoneRef.current = true;
    const drawerId = panel2Drawer.id;
    const openTimer = setTimeout(() => {
      setInteractionState((prev) => ({
        ...prev,
        drawers: { ...prev.drawers, [drawerId]: { isOpen: true } },
      }));
    }, 200);
    const closeTimer = setTimeout(() => {
      setInteractionState((prev) => ({
        ...prev,
        drawers: { ...prev.drawers, [drawerId]: { isOpen: false } },
      }));
    }, 1200);
    return () => {
      clearTimeout(openTimer);
      clearTimeout(closeTimer);
    };
  }, [containerHeight, equipment]);

  const worldWidthPx = computeWorldWidthPx(imageFitMode, viewportWidth || 0, containerHeight || 0, imgNatural);
  const worldTranslateX = viewportWidth > 0 && worldWidthPx > 0
    ? computeWorldTranslateX(cameraCenterX, worldWidthPx, viewportWidth)
    : 0;

  const panelPxHeights = panelHeights.map((r) => Math.max(0, containerHeight * r));
  const perspectivePx = containerHeight > 0 ? degToPerspectivePx(perspectiveDeg, containerHeight) : 800;
  const translateY = (previewYOffset - 0.5) * containerHeight;

  // scene-level stir hold: pointerId-keyed Map 기반 (여러 웍 동시 홀드 지원)
  const stopSceneStirByPointer = useCallback((pointerId: number) => {
    const entry = activeStirMapRef.current.get(pointerId);
    if (!entry) return;
    activeStirMapRef.current.delete(pointerId);
    clearTimeout(entry.timer);
    useEquipmentStore.getState().removeStirring(entry.stateId);
  }, []);

  const startSceneStir = useCallback((stateId: string, pointerId: number) => {
    // 같은 웍이 이미 다른 포인터로 stir 중이면 무시 (중복 방지)
    for (const v of activeStirMapRef.current.values()) {
      if (v.stateId === stateId) return;
    }
    // canStir 조건 검증 (imperative)
    const equip = useEquipmentStore.getState().equipments.find((e) => e.id === stateId);
    if (!equip) return;
    if (!equip.burner_level) return;
    if (equip.wok_status !== 'clean' && equip.wok_status !== 'overheating') return;
    const { ingredientInstances, waterIngredientIds } = useGameStore.getState();
    const wokIngredients = ingredientInstances.filter(
      (i) => i.equipment_state_id === stateId && i.location_type === 'equipment',
    );
    if (wokIngredients.some((i) => waterIngredientIds.has(i.ingredient_id))) return;
    // 최소 온도 미달 → too_cold 팝업
    if ((equip.wok_temp ?? 0) < MIN_STIR_TEMP) {
      useUiStore.getState().openWokBlockedPopup('too_cold');
      return;
    }

    useEquipmentStore.getState().addStirring(stateId);
    const timer = setTimeout(() => {
      stopSceneStirByPointer(pointerId);
    }, STIR_DURATION);
    activeStirMapRef.current.set(pointerId, { stateId, timer });
  }, [stopSceneStirByPointer]);

  // scene-level wash hold: ref + timeout 기반 (stir 패턴 동일)
  const stopSceneWash = useCallback(() => {
    const stateId = activeWashEquipmentIdRef.current;
    if (!stateId) return;
    activeWashEquipmentIdRef.current = null;
    if (activeWashCompletionTimerRef.current) {
      clearTimeout(activeWashCompletionTimerRef.current);
      activeWashCompletionTimerRef.current = null;
    }
    useEquipmentStore.getState().removeWashing(stateId);
  }, []);

  const startSceneWash = useCallback((wokStateId: string) => {
    if (activeWashEquipmentIdRef.current) return;
    const equip = useEquipmentStore.getState().equipments.find((e) => e.id === wokStateId);
    if (!equip || equip.wok_status === 'clean') return;

    activeWashEquipmentIdRef.current = wokStateId;
    useEquipmentStore.getState().addWashing(wokStateId);

    activeWashCompletionTimerRef.current = setTimeout(() => {
      const cur = useEquipmentStore.getState().equipments.find((e) => e.id === wokStateId);
      if (cur && cur.wok_status !== 'clean') {
        useEquipmentStore.getState().updateEquipment(wokStateId, {
          wok_status: 'clean',
          wok_temp: 25,
          burner_level: 0,
        });
      }
      useEquipmentStore.getState().removeWashing(wokStateId);
      activeWashEquipmentIdRef.current = null;
      activeWashCompletionTimerRef.current = null;
    }, SCENE_WASH_DURATION);
  }, []);

  // unmount 시 stir + wash cleanup
  useEffect(() => {
    const stirMap = activeStirMapRef.current;
    return () => {
      stirMap.forEach((v) => {
        clearTimeout(v.timer);
        useEquipmentStore.getState().removeStirring(v.stateId);
      });
      stirMap.clear();
      if (activeWashCompletionTimerRef.current) {
        clearTimeout(activeWashCompletionTimerRef.current);
        activeWashCompletionTimerRef.current = null;
      }
      const washStateId = activeWashEquipmentIdRef.current;
      if (washStateId) {
        useEquipmentStore.getState().removeWashing(washStateId);
        activeWashEquipmentIdRef.current = null;
      }
    };
  }, []);

  // hit-test 인터랙션
  const handleInteraction = useCallback((eqId: string, eqType: string, doorPart?: string) => {
    setInteractionState((prev) => {
      switch (eqType) {
        case 'drawer':
          return { ...prev, drawers: { ...prev.drawers, [eqId]: { isOpen: !(prev.drawers[eqId]?.isOpen) } } };
        case 'basket':
          return { ...prev, baskets: { ...prev.baskets, [eqId]: { isExpanded: !(prev.baskets[eqId]?.isExpanded) } } };
        case 'fold_fridge':
          return { ...prev, foldFridges: { ...prev.foldFridges, [eqId]: { isOpen: !(prev.foldFridges[eqId]?.isOpen) } } };
        case 'four_box_fridge': {
          const cur = prev.fourBoxFridges[eqId] ?? { topOpen: false, bottomOpen: false };
          const updated = doorPart === 'top'
            ? { ...cur, topOpen: !cur.topOpen }
            : { ...cur, bottomOpen: !cur.bottomOpen };
          return { ...prev, fourBoxFridges: { ...prev.fourBoxFridges, [eqId]: updated } };
        }
        default:
          return prev;
      }
    });
  }, []);

  const collapseAllBaskets = useCallback(() => {
    setInteractionState((prev) => {
      const hasExpanded = Object.values(prev.baskets).some(b => b.isExpanded);
      if (!hasExpanded) return prev;
      const collapsed: Record<string, { isExpanded: boolean }> = {};
      for (const key of Object.keys(prev.baskets)) {
        collapsed[key] = { isExpanded: false };
      }
      return { ...prev, baskets: collapsed };
    });
  }, []);

  useEffect(() => {
    onRegisterCollapseBaskets?.(collapseAllBaskets);
  }, [onRegisterCollapseBaskets, collapseAllBaskets]);

  const handleScenePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
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

    // 2. 정렬: open equipment-toggle 우선 → 그 외 면적 오름차순
    //    (열린 서랍 face는 perspective 투영으로 면적이 커져 닫힌 인접 서랍에 우선권을 빼앗기는 버그 방지)
    //    단, "열린 toggle의 *자기 자신의 자식* hit"이 함께 잡혔다면 그 toggle은 우선권을 잃어야 한다
    //    (그렇지 않으면 열린 서랍 face가 자기 안의 ingredient cell을 덮어 닫혀버림 — 모바일 viewport에서 발생).
    const isOpenEquipmentToggle = (el: HTMLElement): boolean => {
      if (el.dataset.clickTarget !== 'equipment-toggle') return false;
      const eqId = el.dataset.equipmentId;
      const eqType = el.dataset.equipmentType;
      if (!eqId || !eqType) return false;
      if (eqType === 'drawer') return interactionState.drawers[eqId]?.isOpen ?? false;
      if (eqType === 'basket') return interactionState.baskets[eqId]?.isExpanded ?? false;
      if (eqType === 'fold_fridge') return interactionState.foldFridges[eqId]?.isOpen ?? false;
      if (eqType === 'four_box_fridge') {
        const fbState = interactionState.fourBoxFridges[eqId];
        if (!fbState) return false;
        const dp = el.dataset.doorPart;
        return dp === 'top' ? fbState.topOpen : fbState.bottomOpen;
      }
      return false;
    };

    // Pre-filter: 자식 hit이 함께 잡힌 열린 toggle은 hits에서 제거
    // (자식 = parentEquipmentId/Type이 해당 toggle의 equipmentId/Type과 일치하는 hit)
    const childParentKeys = new Set<string>();
    for (const hit of hits) {
      const pid = hit.el.dataset.parentEquipmentId;
      const ptype = hit.el.dataset.parentEquipmentType;
      if (pid && ptype) {
        const pdp = hit.el.dataset.parentDoorPart;
        const key = ptype === 'four_box_fridge' && pdp
          ? `${ptype}:${pid}:${pdp}` : `${ptype}:${pid}`;
        childParentKeys.add(key);
      }
      // fridge 내부 바구니 셀 → basket owner 관계 추가
      const basketOwnerId = hit.el.dataset.basketOwnerId;
      if (basketOwnerId) {
        childParentKeys.add(`basket:${basketOwnerId}`);
      }
    }
    const filteredHits = hits.filter((hit) => {
      if (!isOpenEquipmentToggle(hit.el)) return true;
      const eqId = hit.el.dataset.equipmentId;
      const eqType = hit.el.dataset.equipmentType;
      if (!eqId || !eqType) return true;
      // 이 열린 toggle의 자식이 함께 잡혔다면 toggle 자체는 제외
      const faceDoorPart = hit.el.dataset.doorPart;
      const key = eqType === 'four_box_fridge' && faceDoorPart
        ? `${eqType}:${eqId}:${faceDoorPart}` : `${eqType}:${eqId}`;
      return !childParentKeys.has(key);
    });

    filteredHits.sort((a, b) => {
      const aOpen = isOpenEquipmentToggle(a.el);
      const bOpen = isOpenEquipmentToggle(b.el);
      if (aOpen !== bOpen) return aOpen ? -1 : 1;
      return a.area - b.area;
    });

    // 3. 닫힌 장비 내부 셀 필터링 + 최우선 타겟 선택
    let selectedHit: HTMLElement | null = null;
    for (const hit of filteredHits) {
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
        } else if (parentEqType === 'four_box_fridge') {
          const fbState = interactionState.fourBoxFridges[parentEqId];
          if (fbState) {
            const parentDoorPart = hit.el.dataset.parentDoorPart;
            isParentOpen = parentDoorPart === 'top' ? fbState.topOpen : fbState.bottomOpen;
          }
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
        // 바구니 자동 접힘: basket이면 다른 바구니만, 아니면 전부
        if (eqType === 'basket') {
          setInteractionState((prev) => {
            const newBaskets: Record<string, { isExpanded: boolean }> = {};
            for (const key of Object.keys(prev.baskets)) {
              newBaskets[key] = key === eqId ? prev.baskets[key] : { isExpanded: false };
            }
            return { ...prev, baskets: newBaskets };
          });
        } else {
          collapseAllBaskets();
        }
        handleInteraction(eqId, eqType, toggleMeta.doorPart);
        // onSceneClick에도 전달 (선택 상태 관리용)
        onSceneClick?.({
          type: 'equipment-toggle',
          equipmentId: eqId,
          equipmentType: eqType,
        });
        return;
      }

      // burner: scene-level rect hit-test로 fire/stir 일원화
      if (targetType === 'burner') {
        collapseAllBaskets();
        const burnerMetaStr = selectedHit.dataset.clickMeta;
        const burnerMeta = burnerMetaStr ? JSON.parse(burnerMetaStr) as Record<string, string> : {};
        const eqId = selectedHit.dataset.equipmentId ?? burnerMeta.equipmentId;
        const rect = selectedHit.getBoundingClientRect();

        if (hasSelection) {
          // 선택 상태: place-container / move-container / deselect
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

        // no-selection: 상단/하단 이등분
        const midY = rect.top + rect.height / 2;
        const isStirHalf = clientY >= midY;

        if (!isStirHalf) {
          // 상단 절반 → 불 단계 순환 0→1→2→0
          const stateId = panelToStateIdMap?.get(eqId);
          if (stateId) {
            const equip = useEquipmentStore.getState().equipments.find((eq) => eq.id === stateId);
            if (equip && equip.burner_level !== null) {
              const next = ((equip.burner_level + 1) % 3) as 0 | 1 | 2;
              useEquipmentStore.getState().updateEquipment(stateId, { burner_level: next });
            }
          }
        } else {
          // 하단 절반 → 볶기 hold 시작 (pointerId별 독립 추적)
          const stateId = panelToStateIdMap?.get(eqId);
          if (stateId) {
            startSceneStir(stateId, e.pointerId);
          }
        }
        // no-selection 경로: onSceneClick 미호출
        return;
      }

      // sink: scene-level wash hold
      if (targetType === 'sink') {
        collapseAllBaskets();
        const sinkMetaStr = selectedHit.dataset.clickMeta;
        const sinkMeta = sinkMetaStr ? JSON.parse(sinkMetaStr) as Record<string, string> : {};
        const eqId = selectedHit.dataset.equipmentId ?? sinkMeta.equipmentId;

        if (hasSelection) {
          // 선택 상태: move-wok-to-sink / dispose 등 → onSceneClick 위임
          const rect = selectedHit.getBoundingClientRect();
          onSceneClick?.({
            type: 'sink',
            equipmentId: eqId,
            equipmentType: 'sink',
            localRatio: {
              x: (clientX - rect.left) / rect.width,
              y: (clientY - rect.top) / rect.height,
            },
          });
          return;
        }

        // no-selection: dirty wok → wash hold 시작
        const { wok_at_sink, equipments } = useEquipmentStore.getState();
        let wokStateId: string | null = null;
        for (const [wokId, sinkId] of wok_at_sink) {
          if (sinkId === eqId) { wokStateId = wokId; break; }
        }
        if (wokStateId) {
          const wokEquip = equipments.find((e) => e.id === wokStateId);
          if (wokEquip && wokEquip.wok_status !== 'clean') {
            startSceneWash(wokStateId);
          }
        }
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
        orderId: meta.orderId,
      };

      // worktop/burner/sink: 장비 내 로컬 비율 계산 (그릇 올려놓기 좌표)
      if (targetType === 'worktop' || targetType === 'burner' || targetType === 'sink') {
        const rect = selectedHit.getBoundingClientRect();
        clickTarget.localRatio = {
          x: (clientX - rect.left) / rect.width,
          y: (clientY - rect.top) / rect.height,
        };
      }

      // 바구니 자동 접힘: 바구니 내부 재료 클릭 또는 add-ingredient 액션이면 유지, 그 외 접힘
      const basketOwnerId = selectedHit.dataset.basketOwnerId;
      const isExpandedBasketInteriorHit = targetType === 'ingredient-source'
        && !!basketOwnerId
        && (interactionState.baskets[basketOwnerId]?.isExpanded ?? false);
      if (!isExpandedBasketInteriorHit) {
        const resolved = resolveAction(selection ?? null, clickTarget);
        if (resolved?.type !== 'add-ingredient') {
          collapseAllBaskets();
        }
      }

      onSceneClick?.(clickTarget);
      return;
    }

    // 히트 없음 → empty-area
    collapseAllBaskets();
    onSceneClick?.({ type: 'empty-area' });
  }, [handleInteraction, interactionState, hasSelection, selection, onSceneClick, panelToStateIdMap, startSceneStir, startSceneWash, collapseAllBaskets]);

  const handleScenePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    stopSceneStirByPointer(e.pointerId);
    stopSceneWash();
  }, [stopSceneStirByPointer, stopSceneWash]);

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
              // 선택 없음 → burner는 scene hit-test 제외 (local 버튼으로만 동작)
              // 선택 있음 → burner를 scene 타깃으로 유지 (place-container/deselect)
              // burner는 BurnerPanel face 요소에서 직접 data-click-target 부착
              const eqClickTarget = eq.equipmentType === 'burner'
                ? null
                : getEquipmentClickTarget(eq.equipmentType);
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
                    ...getEquipmentPositionStyle(eq.y, eq.height),
                    width: `${eq.width * 100}%`,
                    ...(eq.equipmentType === 'filler_panel' ? { pointerEvents: 'none' as const } : {}),
                  }}
                >
                  {renderEquipment(eq, interactionState, index, ingredientLabelsMap, burnerLevelsRecord[eq.id] ?? 0, panelToStateIdMap?.get(eq.id), selection)}
                </div>
              );
            })}
          </div>

          {/* 아이템 레이어 (장비 위) */}
          <div className={styles.itemLayer}>
            {items.filter((it) => it.panelIndex === index).map((item) => {
              const isSel = item.itemType === 'container'
                ? isContainerSourceSelected(selection, item.containerId)
                : isIngredientSelected(selection, item.ingredientId);
              return (
                <div
                  key={item.id}
                  className={`${styles.panelItem} ${isSel ? styles.gameSelected : ''}`}
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
              );
            })}
          </div>

          {/* 올려놓인 그릇: 해당 패널 장비에 속한 것만 렌더링 */}
          {placedContainers
            ?.filter((pc) => panelEquipment.some((eq) => eq.id === pc.equipmentId))
            .map((pc) => {
              const eq = panelEquipment.find((e) => e.id === pc.equipmentId)!;
              const absX = eq.x + pc.localX * eq.width;
              const absY = eq.y + pc.localY * eq.height;
              const sizeVh = PLACED_CONTAINER_SIZE_VH;

              const isPcSel = isPlacedContainerSelected(selection, pc.instanceId);
              const completeClass = pc.isComplete ? ` ${styles.placedContainerComplete}` : '';
              return (
                <div
                  key={pc.instanceId}
                  className={`${styles.placedContainer}${completeClass} ${isPcSel ? styles.gameSelected : ''}`}
                  data-click-target="placed-container"
                  data-click-meta={JSON.stringify({ containerInstanceId: pc.instanceId })}
                  style={{
                    position: 'absolute',
                    left: `${absX * 100}%`,
                    top: `${absY * 100}%`,
                    width: `${sizeVh}vh`,
                    height: `${sizeVh}vh`,
                    // translateZ(1px)로 panel 표면과의 z-fighting 회피.
                    // 모바일 GPU는 부동소수점 정밀도가 낮아 동일 평면일 때 panel이
                    // bowl을 가리는 사례가 있음.
                    transform: 'translate3d(-50%, -100%, 1px) rotateX(-90deg)',
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
                  {pc.orderId && (
                    <button
                      type="button"
                      className={styles.guideButton}
                      data-click-target="container-guide-button"
                      data-click-meta={JSON.stringify({ containerInstanceId: pc.instanceId })}
                      aria-label="그릇 상태 보기"
                    >
                      ?
                    </button>
                  )}
                  {pc.isComplete && (
                    <>
                      <span className={styles.placedContainerCheck}>✓</span>
                      {pc.canServe && pc.orderId && (
                        <button
                          type="button"
                          className={styles.serveButton}
                          data-click-target="serve-button"
                          data-click-meta={JSON.stringify({ orderId: pc.orderId })}
                        >
                          서빙
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}

          {/* 홀로그램: 패널 1에서만, 화구 위치에 자동 생성 */}
          {index === 0 && equipment
            .filter((eq) => eq.equipmentType === 'burner')
            .map((burner) => {
              const contents = wokContentsMap?.get(burner.id) ?? [];
              const stateId = panelToStateIdMap?.get(burner.id);
              return (
                <BurnerHologram
                  key={`holo-${burner.id}`}
                  burner={burner}
                  stateId={stateId}
                  contents={contents}
                  selection={selection}
                  styleProps={{
                    left: `${burner.x * 100}%`,
                    bottom: 0,
                    width: `${burner.width * 100}%`,
                    height: `${panelHeights[0] > 0 ? burner.height * (panelHeights[1] / panelHeights[0]) * 100 : burner.height * 100}%`,
                  }}
                />
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

  const worldClassName = imageFitMode === 'natural'
    ? `${styles.imageWorld} ${styles.imageWorldNatural}`
    : imageFitMode === 'stretch'
      ? `${styles.imageWorld} ${styles.imageWorldStretch}`
      : `${styles.imageWorld} ${styles.imageWorldCover}`;

  const worldStyle: React.CSSProperties = {
    transform: `translateX(${worldTranslateX}px)`,
    ...(imageFitMode === 'natural' && worldWidthPx > 0 ? { width: `${worldWidthPx}px` } : {}),
  };

  // imageWorld가 worldTranslateX(≤0)만큼 밀려 있으므로 viewport 중앙의
  // imageWorld 내 좌표 = -worldTranslateX + viewportWidth/2. 이 값을 scene의
  // perspective-origin X로 주면 소실점이 섹션 이동과 무관하게 viewport 중앙 고정.
  const perspectiveOriginX =
    worldWidthPx > 0 ? -worldTranslateX + viewportWidth / 2 : 0;

  return (
    <div className={styles.kitchenViewRoot}>
      {/* BillQueue: 일반 flow, 크기 고정 */}
      {children && <div className={styles.billQueueArea}>{children}</div>}

      {/* viewport — overflow hidden. imageWorld가 내부에서 슬라이드/letterbox 처리 */}
      <div ref={sceneAreaRef} className={styles.kitchenSceneArea}>
        <div className={worldClassName} style={worldStyle}>
          {backgroundImageUrl ? (
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
          ) : (
            <div className={styles.placeholderBg} />
          )}

          <div className={styles.panelOverlay}>
            <div
              ref={sceneRef}
              className={styles.scene}
              style={{
                perspective: `${perspectivePx}px`,
                perspectiveOrigin: `${perspectiveOriginX}px 50%`,
                cursor: 'pointer',
              }}
              onPointerDown={handleScenePointerDown}
              onPointerUp={handleScenePointerUp}
              onPointerCancel={handleScenePointerUp}
              onPointerLeave={handleScenePointerUp}
            >
              <div className={styles.panelGroup} style={{ transform: `translateY(${translateY}px)` }}>
                {renderPanel(0)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ——— BurnerPanel (순수 시각 컴포넌트 — 입력은 scene-level hit-test로 처리) ———

interface BurnerPanelProps {
  panelId: string;
  stateId: string | undefined;
  fireLevel: 0 | 1 | 2;
}

function BurnerPanel({ panelId, stateId, fireLevel }: BurnerPanelProps) {
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
  const burnerLevel = useEquipmentStore((s) => {
    if (!stateId) return null;
    const e = s.equipments.find((eq) => eq.id === stateId);
    return e?.burner_level ?? null;
  });
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
    && !hasWaterInWok
    && (wokTemp ?? 0) >= MIN_STIR_TEMP;
  const isTooCold = !!burnerLevel
    && (wokStatus === 'clean' || wokStatus === 'overheating')
    && !hasWaterInWok
    && (wokTemp ?? 0) < MIN_STIR_TEMP;

  const statusBg = BURNER_COLORS[fireLevel];

  return (
    <div
      data-click-target="burner"
      data-equipment-id={panelId}
      data-click-meta={JSON.stringify({ equipmentId: panelId, equipmentType: 'burner' })}
      style={{
        position: 'absolute', inset: 0, background: statusBg,
        borderRadius: EQUIP_RADIUS, transition: 'background 0.2s',
        display: 'flex', flexDirection: 'column', padding: 0, gap: 1,
        touchAction: 'none',
      }}
    >
      {/* 온도 오버레이 */}
      {wokTemp !== null && (
        <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 'calc(var(--font-game-cell) * 2)', lineHeight: 1, color: 'rgba(255,255,255,0.9)', pointerEvents: 'none', zIndex: 3 }}>
          {wokTemp}°C
        </span>
      )}
      {/* 불 표시: 상단 절반 (순수 시각) */}
      <div
        className={styles.eqInteractionBtn}
        style={{
          position: 'relative', flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}
        data-action="fire"
      >
        불 {fireLevel}
      </div>
      {/* 볶기 표시: 하단 절반 (순수 시각, isStirring boolean 피드백) */}
      <div
        className={styles.eqInteractionBtn}
        style={{
          position: 'relative', flex: 1, width: '100%', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isStirring ? 'var(--color-fire-active)' : canStir ? 'var(--color-warning)' : undefined,
          color: isStirring || canStir ? '#fff' : undefined,
          opacity: canStir ? 1 : 0.5,
          pointerEvents: 'none',
        }}
        data-action="stir"
      >
        <span className={styles.stirProgressLabel}>
          {isStirring ? '볶는 중...' : isTooCold ? '온도가 너무 낮음' : '볶기'}
        </span>
      </div>
    </div>
  );
}

// ——— 장비 렌더링 ———

function renderEquipment(eq: LocalEquipment, state: EquipmentInteractionState, panelIndex: number, ingredientLabelsMap: Map<string, string>, burnerLevel: 0 | 1 | 2 = 0, stateId?: string, selection?: SelectionState | null) {
  switch (eq.equipmentType) {
    case 'drawer': return (
      <GameDrawerVisual
        eqId={eq.id}
        isOpen={state.drawers[eq.id]?.isOpen ?? false}
        config={eq.config}
        eqHeight={eq.height}
        ingredientLabelsMap={ingredientLabelsMap}
        selection={selection}
      />
    );
    case 'burner': return <BurnerPanel panelId={eq.id} stateId={stateId} fireLevel={burnerLevel} />;
    case 'basket': return renderBasket(state.baskets[eq.id]?.isExpanded ?? false, eq.id, panelIndex, eq.config, ingredientLabelsMap, selection);
    case 'fold_fridge': return renderFoldFridge(state.foldFridges[eq.id]?.isOpen ?? false, eq.id, eq.config, ingredientLabelsMap, state.baskets, selection);
    case 'four_box_fridge': {
      const fbState = state.fourBoxFridges[eq.id] ?? { topOpen: false, bottomOpen: false };
      return renderFourBoxFridge(fbState.topOpen, fbState.bottomOpen, eq.id, eq.config, ingredientLabelsMap, state.baskets, selection);
    }
    case 'sink': return <SinkArea sinkPanelId={eq.id} />;
    default: return renderSimple(eq.equipmentType);
  }
}

// ——— SinkArea: 웍이 매핑되어 있을 때 WokComponent 렌더, 아니면 disabled 버튼 ———

interface SinkAreaProps {
  sinkPanelId: string;
}

function SinkArea({ sinkPanelId }: SinkAreaProps) {
  // wok_at_sink Map에서 자기 sink로 매핑된 wok stateId 검색
  const wokStateId = useEquipmentStore((s) => {
    for (const [wokId, sinkId] of s.wok_at_sink) {
      if (sinkId === sinkPanelId) return wokId;
    }
    return null;
  });
  const wokEquipment = useEquipmentStore((s) =>
    wokStateId ? s.equipments.find((e) => e.id === wokStateId) ?? null : null,
  );
  const isWashing = useEquipmentStore((s) =>
    wokStateId ? s.washing_equipment_ids.has(wokStateId) : false,
  );
  const clearWokAtSink = useEquipmentStore((s) => s.clearWokAtSink);

  // 세척 완료(wok_status === 'clean') 감지 → 자동으로 burner 복귀
  useEffect(() => {
    if (wokStateId && wokEquipment?.wok_status === 'clean') {
      clearWokAtSink(wokStateId);
    }
  }, [wokStateId, wokEquipment?.wok_status, clearWokAtSink]);

  if (wokEquipment) {
    const needsWash = wokEquipment.wok_status !== 'clean';
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <WokComponent equipmentState={wokEquipment} atSink />
        {needsWash && (
          <div className={styles.sinkWashOverlay}>
            <span className={styles.sinkWashLabel}>
              {isWashing ? '세척중...' : '세척 (꾹 누르기)'}
            </span>
            <div className={styles.sinkWashBar}>
              <div className={`${styles.sinkWashFill}${isWashing ? ` ${styles.sinkWashFillAnimating}` : ''}`} />
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div style={{
      position: 'absolute', inset: 0, background: EQUIPMENT_COLORS.sink,
      borderRadius: EQUIP_RADIUS, display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <button className={styles.eqInteractionBtn} disabled>씻기</button>
    </div>
  );
}

interface GameDrawerVisualProps {
  eqId: string;
  isOpen: boolean;
  config: Record<string, unknown>;
  eqHeight: number;
  ingredientLabelsMap: Map<string, string>;
  selection?: SelectionState | null;
}

function GameDrawerVisual({ eqId, isOpen, config, eqHeight, ingredientLabelsMap, selection }: GameDrawerVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [measuredH, setMeasuredH] = useState(0);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setMeasuredH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const depth = typeof (config as Record<string, unknown>).depth === 'number'
    ? ((config as Record<string, unknown>).depth as number)
    : 0.5;
  const safeEqH = eqHeight > 0 ? eqHeight : 0.05;
  const depthRatio = depth / safeEqH;
  const openZ = isOpen ? measuredH * depthRatio : 0;
  const grid = resolveGrid(config, 'drawer');

  return (
    <div ref={containerRef} className={styles.drawerContainer}>
      {/* 외부: top center 기준 -90deg 세우기. inner height = depth/eqHeight 비율 */}
      <div className={styles.drawerInner} style={{
        height: `${depthRatio * 100}%`,
        bottom: 'auto',
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
            const rect = cellRect(cell, grid.rowRatios, grid.colRatios, grid.rows, grid.cols);
            const label = cell.ingredientId ? (ingredientLabelsMap.get(cell.ingredientId) ?? '') : '';
            const isSel = isIngredientSelected(selection, cell.ingredientId);
            return (
              <div
                key={`${cell.row}-${cell.col}`}
                className={`${styles.drawerCell} ${isSel ? styles.gameSelected : ''}`}
                {...(cell.ingredientId ? {
                  'data-click-target': 'ingredient-source',
                  'data-click-meta': JSON.stringify({ ingredientId: cell.ingredientId }),
                  'data-parent-equipment-id': eqId,
                  'data-parent-equipment-type': 'drawer',
                } : {})}
                style={{
                  left: `${rect.left * 100}%`,
                  top: `${rect.top * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                }}
              >
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={styles.drawerFace}
        data-equipment-id={eqId}
        data-equipment-type="drawer"
        data-click-target="equipment-toggle"
        data-click-meta={JSON.stringify({ equipmentId: eqId, equipmentType: 'drawer' })}
        style={{
          transform: `translateZ(${openZ}px)`, background: EQUIPMENT_COLORS.drawer,
        }}
      >
        <div className={styles.eqHandleBar} style={{ bottom: 4 }} />
      </div>
    </div>
  );
}


function renderBasket(isExpanded: boolean, eqId: string, panelIndex: number, config: Record<string, unknown>, ingredientLabelsMap: Map<string, string>, selection?: SelectionState | null) {
  const grid = resolveGrid(config, 'basket');
  const maxRow = grid.rows - 1;
  const cellHeightPx = 30;
  const correction = getBasketCorrection(panelIndex);

  const cellNodes = grid.cells.map((cell) => {
    const rect = cellRect(cell, grid.rowRatios, grid.colRatios, grid.rows, grid.cols);
    const anchor = getBindAnchor(grid.cells, cell);
    const expandRow = anchor ? anchor.row : cell.row;
    const expandZ = isExpanded ? (maxRow - expandRow) * cellHeightPx : 0;
    const originY = anchor
      ? `${((anchor.row + anchor.rowSpan - cell.row) / cell.rowSpan) * 100}%`
      : '100%';
    const label = cell.ingredientId ? (ingredientLabelsMap.get(cell.ingredientId) ?? '') : '';
    const isSel = isIngredientSelected(selection, cell.ingredientId);

    return (
      <div key={`${cell.row}-${cell.col}`} className={`${styles.basketCell} ${isSel ? styles.gameSelected : ''}`}
        {...(cell.ingredientId ? {
          'data-click-target': 'ingredient-source',
          'data-click-meta': JSON.stringify({ ingredientId: cell.ingredientId }),
          'data-parent-equipment-id': eqId,
          'data-parent-equipment-type': 'basket',
          'data-basket-owner-id': eqId,
        } : {})}
        style={{
          left: `${rect.left * 100}%`, top: `${rect.top * 100}%`,
          width: `${rect.width * 100}%`, height: `${rect.height * 100}%`,
          transformOrigin: `center ${originY}`,
          transform: `translateZ(${expandZ}px) rotateX(-90deg)`,
        }}>
        <div className={styles.basketCellFace}>
          {label && (
            <span style={{ fontSize: 'var(--font-game-cell)', color: '#555', pointerEvents: 'none', userSelect: 'none' }}>
              {label}
            </span>
          )}
        </div>
      </div>
    );
  });

  return (
    <div className={styles.basketContainer} style={{ transform: correction }}
      data-click-target="equipment-toggle"
      data-equipment-id={eqId}
      data-equipment-type="basket"
      data-click-meta={JSON.stringify({ equipmentId: eqId, equipmentType: 'basket' })}
    >
      {cellNodes}
    </div>
  );
}

/** 폴드냉장고 내부 아이템 1개 렌더링 (재료 또는 바구니) */
function renderFridgeItem(
  item: FridgeInternalItem,
  idx: number,
  eqId: string,
  level: 1 | 2 | 3 | 4,
  ingredientLabelsMap: Map<string, string>,
  basketStates: Record<string, { isExpanded: boolean }>,
  selection?: SelectionState | null,
  doorPart?: string,
) {
  if (item.type === 'ingredient') {
    const label = item.ingredientId
      ? ingredientLabelsMap.get(item.ingredientId) ?? ''
      : '';
    const isSel = isIngredientSelected(selection, item.ingredientId);
    return (
      <div
        key={`ing-${idx}`}
        className={`${styles.fridgeItem} ${isSel ? styles.gameSelected : ''}`}
        {...(item.ingredientId ? {
          'data-click-target': 'ingredient-source',
          'data-click-meta': JSON.stringify({ ingredientId: item.ingredientId }),
          'data-parent-equipment-id': eqId,
          'data-parent-equipment-type': doorPart ? 'four_box_fridge' : 'fold_fridge',
          ...(doorPart ? { 'data-parent-door-part': doorPart } : {}),
        } : {})}
        style={{
          left: `${item.x * 100}%`,
          top: `${item.y * 100}%`,
          width: `${item.width * 100}%`,
          height: `${item.height * 100}%`,
          transformOrigin: 'bottom center',
          transform: 'rotateX(-90deg)',
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
  const cellHeightPx = 30;

  return (
    <div
      key={`bsk-${idx}`}
      data-equipment-id={syntheticKey}
      data-equipment-type="basket"
      data-click-target="equipment-toggle"
      data-click-meta={JSON.stringify({ equipmentId: syntheticKey, equipmentType: 'basket' })}
      data-parent-equipment-id={eqId}
      data-parent-equipment-type={doorPart ? 'four_box_fridge' : 'fold_fridge'}
      {...(doorPart ? { 'data-parent-door-part': doorPart } : {})}
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
        const rect = cellRect(cell, basketGrid.rowRatios, basketGrid.colRatios, basketGrid.rows, basketGrid.cols);
        const anchor = getBindAnchor(basketGrid.cells, cell);
        const expandRow = anchor ? anchor.row : cell.row;
        const expandZ = isExpanded ? (maxRow - expandRow) * cellHeightPx : 0;
        const originY = anchor
          ? `${((anchor.row + anchor.rowSpan - cell.row) / cell.rowSpan) * 100}%`
          : '100%';
        const cellLabel = cell.ingredientId
          ? ingredientLabelsMap.get(cell.ingredientId) ?? ''
          : '';
        const isCellSel = isIngredientSelected(selection, cell.ingredientId);
        return (
          <div
            key={`${cell.row}-${cell.col}`}
            className={`${styles.basketCell} ${isCellSel ? styles.gameSelected : ''}`}
            {...(cell.ingredientId ? {
              'data-click-target': 'ingredient-source',
              'data-click-meta': JSON.stringify({ ingredientId: cell.ingredientId }),
              'data-parent-equipment-id': eqId,
              'data-parent-equipment-type': doorPart ? 'four_box_fridge' : 'fold_fridge',
              ...(doorPart ? { 'data-parent-door-part': doorPart } : {}),
              'data-basket-owner-id': syntheticKey,
            } : {})}
            style={{
              left: `${rect.left * 100}%`,
              top: `${rect.top * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
              transformOrigin: `center ${originY}`,
              transform: `translateZ(${expandZ}px) rotateX(-90deg)`,
            }}
          >
            <div className={styles.basketCellFace}>
              {cellLabel && (
                <span style={{ fontSize: 'var(--font-game-cell)', color: '#555', pointerEvents: 'none', userSelect: 'none' }}>
                  {cellLabel}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderFoldFridge(
  isOpen: boolean,
  eqId: string,
  config: Record<string, unknown>,
  ingredientLabelsMap: Map<string, string>,
  basketStates: Record<string, { isExpanded: boolean }>,
  selection?: SelectionState | null,
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
        {level1Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 1, ingredientLabelsMap, basketStates, selection))}
      </div>
      <div className={styles.fridgeInternalPanel} style={{
        bottom: '50%', left: '2%', width: '96%', height: '48%',
        transformOrigin: 'center', transform: 'rotateX(90deg)',
        opacity: isOpen ? 1 : 0, transition: 'opacity 0.3s ease',
      }}>
        {level2Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 2, ingredientLabelsMap, basketStates, selection))}
      </div>
      <div className={styles.fridgeFace} style={{
        background: EQUIPMENT_COLORS.fold_fridge,
        opacity: isOpen ? 0 : 1, transition: 'opacity 0.3s ease',
      }}>
        <div className={styles.eqHandleBar} style={{ top: 4 }} />
      </div>
    </div>
  );
}

function renderFourBoxFridge(
  topOpen: boolean,
  bottomOpen: boolean,
  eqId: string,
  config: Record<string, unknown>,
  ingredientLabelsMap: Map<string, string>,
  basketStates: Record<string, { isExpanded: boolean }>,
  selection?: SelectionState | null,
) {
  const parsed = isFoldFridgeConfig(config) ? config : null;
  const panels = parsed?.panels ?? [];
  const level1Items = panels.find((p) => p.level === 1)?.items ?? [];
  const level2Items = panels.find((p) => p.level === 2)?.items ?? [];
  const level3Items = panels.find((p) => p.level === 3)?.items ?? [];
  const level4Items = panels.find((p) => p.level === 4)?.items ?? [];

  return (
    <div className={styles.fridgeContainer}>
      {/* 하단 절반: level 1 + level 2 (독립 패널 면 2개) */}
      <div className={styles.fourBoxFridgeHalf} style={{ bottom: 0 }}>
        <div className={styles.fridgeInternalPanel} style={{
          bottom: 0, left: '2%', width: '96%', height: '48%',
          transformOrigin: 'center', transform: 'rotateX(90deg)',
          opacity: bottomOpen ? 1 : 0, transition: 'opacity 0.3s ease',
        }}>
          {level1Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 1, ingredientLabelsMap, basketStates, selection, 'bottom'))}
        </div>
        <div className={styles.fridgeInternalPanel} style={{
          bottom: '50%', left: '2%', width: '96%', height: '48%',
          transformOrigin: 'center', transform: 'rotateX(90deg)',
          opacity: bottomOpen ? 1 : 0, transition: 'opacity 0.3s ease',
        }}>
          {level2Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 2, ingredientLabelsMap, basketStates, selection, 'bottom'))}
        </div>
        <div
          className={styles.fridgeFace}
          data-click-target="equipment-toggle"
          data-click-meta={JSON.stringify({ equipmentId: eqId, equipmentType: 'four_box_fridge', doorPart: 'bottom' })}
          data-equipment-id={eqId}
          data-equipment-type="four_box_fridge"
          data-door-part="bottom"
          style={{
            background: EQUIPMENT_COLORS.four_box_fridge,
            opacity: bottomOpen ? 0 : 1, transition: 'opacity 0.3s ease',
          }}
        >
          <div className={styles.eqHandleBar} style={{ top: '50%', transform: 'translateY(-50%)' }} />
        </div>
      </div>
      {/* 상단 절반: level 3 + level 4 (독립 패널 면 2개) */}
      <div className={styles.fourBoxFridgeHalf} style={{ bottom: '50%' }}>
        <div className={styles.fridgeInternalPanel} style={{
          bottom: 0, left: '2%', width: '96%', height: '48%',
          transformOrigin: 'center', transform: 'rotateX(90deg)',
          opacity: topOpen ? 1 : 0, transition: 'opacity 0.3s ease',
        }}>
          {level3Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 3, ingredientLabelsMap, basketStates, selection, 'top'))}
        </div>
        <div className={styles.fridgeInternalPanel} style={{
          bottom: '50%', left: '2%', width: '96%', height: '48%',
          transformOrigin: 'center', transform: 'rotateX(90deg)',
          opacity: topOpen ? 1 : 0, transition: 'opacity 0.3s ease',
        }}>
          {level4Items.map((item, idx) => renderFridgeItem(item, idx, eqId, 4, ingredientLabelsMap, basketStates, selection, 'top'))}
        </div>
        <div
          className={styles.fridgeFace}
          data-click-target="equipment-toggle"
          data-click-meta={JSON.stringify({ equipmentId: eqId, equipmentType: 'four_box_fridge', doorPart: 'top' })}
          data-equipment-id={eqId}
          data-equipment-type="four_box_fridge"
          data-door-part="top"
          style={{
            background: EQUIPMENT_COLORS.four_box_fridge,
            opacity: topOpen ? 0 : 1, transition: 'opacity 0.3s ease',
          }}
        >
          <div className={styles.eqHandleBar} style={{ top: '50%', transform: 'translateY(-50%)' }} />
        </div>
      </div>
    </div>
  );
}

function renderSimple(type: PanelEquipmentType) {
  if (type === 'shelf') {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', borderRadius: EQUIP_RADIUS, overflow: 'hidden' }}>
        <div className={styles.shelfLeft} /><div className={styles.shelfMiddle} /><div className={styles.shelfRight} />
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, background: EQUIPMENT_COLORS[type], borderRadius: EQUIP_RADIUS }} />
  );
}

export default GameKitchenView;
