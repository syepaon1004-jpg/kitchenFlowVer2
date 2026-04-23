import { useState, useEffect, useRef, useCallback, useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useGameStore } from '../stores/gameStore';
import { useEquipmentStore } from '../stores/equipmentStore';
import { useUiStore } from '../stores/uiStore';
import { useAuthStore } from '../stores/authStore';
import { useScoringStore } from '../stores/scoringStore';
import { useGameTick } from '../hooks/useGameTick';
import { useRecipeEval } from '../hooks/useRecipeEval';
import { useOrderGenerator } from '../hooks/useOrderGenerator';
import type {
  StoreIngredient,
  Container,
  GameIngredientInstance,
  GameContainerInstance,
  GameEquipmentState,
  GameOrder,
  GameScoreEvent,
  EquipmentType,
} from '../types/db';
import type { ResolvedAction } from '../types/game';
import type { AttemptingItem } from '../lib/recipe/evaluate';
import RejectionPopup from '../components/game/RejectionPopup';
import WokBlockedPopup from '../components/game/WokBlockedPopup';
import { INSTANT_UNITS } from '../lib/interaction/constants';
import { SCORE_CONFIG } from '../lib/scoring/constants';
import { generatePresets } from '../lib/interaction/generatePresets';
import BillQueue from '../components/layout/BillQueue';

import GameKitchenView from '../components/game/GameKitchenView';
import SelectionDisplay from '../components/game/SelectionDisplay';
import type { FeedbackState } from '../components/game/SessionResultOverlay';
import { useClickInteraction } from '../hooks/useClickInteraction';
import { useSelectionStore } from '../stores/selectionStore';
import type { PanelLayout, PanelEquipment, PanelItem, PanelEquipmentType, SectionGrid, SectionCell } from '../types/db';
import type { MoveDirection } from '../types/section';
import NavigationHUD from '../components/game/NavigationHUD';
import MinimapHUD from '../components/game/MinimapHUD';
import Handbar from '../components/layout/Handbar';
import GameHeader from '../components/game/GameHeader';
import SessionResultOverlay from '../components/game/SessionResultOverlay';
import OrderSelectModal from '../components/ui/OrderSelectModal';
import QuantityInputModal from '../components/ui/QuantityInputModal';
import '../styles/gameVariables.css';
import styles from './GamePage.module.css';

// ── 세션 종료 결과 외부 스토어 (effect → render 브릿지, React setState 미사용) ──
type SessionResultSnapshot = { score: number; scoreEvents: GameScoreEvent[] } | null;
let _sessionResultData: SessionResultSnapshot = null;
const _sessionResultListeners = new Set<() => void>();

function emitSessionResult(data: SessionResultSnapshot) {
  _sessionResultData = data;
  _sessionResultListeners.forEach((l) => l());
}

function subscribeSessionResult(onStoreChange: () => void) {
  _sessionResultListeners.add(onStoreChange);
  return () => { _sessionResultListeners.delete(onStoreChange); };
}

function getSessionResultSnapshot(): SessionResultSnapshot {
  return _sessionResultData;
}

/** 패널 장비 타입 → 물리엔진 장비 타입 매핑 */
function panelToPhysicsType(panelType: PanelEquipmentType): EquipmentType | null {
  switch (panelType) {
    case 'burner': return 'wok';
    case 'sink': return 'sink';
    case 'four_box_fridge': return null;
    default: return null;
  }
}

const GamePage = () => {
  const navigate = useNavigate();
  const selectedStore = useAuthStore((s) => s.selectedStore)!;
  const storeId = useGameStore((s) => s.storeId) ?? selectedStore.id;
  const sessionId = useGameStore((s) => s.sessionId);
  const addActionLog = useScoringStore((s) => s.addActionLog);
  const addIngredientInstance = useGameStore((s) => s.addIngredientInstance);
  const incrementIngredientQuantity = useGameStore((s) => s.incrementIngredientQuantity);
  const decrementIngredientQuantity = useGameStore((s) => s.decrementIngredientQuantity);
  const addContainerInstance = useGameStore((s) => s.addContainerInstance);
  const moveContainer = useGameStore((s) => s.moveContainer);
  const incrementContainerPlateOrder = useGameStore((s) => s.incrementContainerPlateOrder);
  const removeContainerInstance = useGameStore((s) => s.removeContainerInstance);
  const setContainerDirty = useGameStore((s) => s.setContainerDirty);
  const bulkMoveIngredients = useGameStore((s) => s.bulkMoveIngredients);
  const openQuantityModal = useUiStore((s) => s.openQuantityModal);
  const openRejectionPopup = useUiStore((s) => s.openRejectionPopup);
  const openOrderSelectModal = useUiStore((s) => s.openOrderSelectModal);
  const openWokBlockedPopup = useUiStore((s) => s.openWokBlockedPopup);

  const setEquipments = useEquipmentStore((s) => s.setEquipments);
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const setWokAtSink = useEquipmentStore((s) => s.setWokAtSink);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const containerInstances = useGameStore((s) => s.containerInstances);
  const setOrders = useGameStore((s) => s.setOrders);
  const markContainerServed = useGameStore((s) => s.markContainerServed);
  const updateOrderStatus = useGameStore((s) => s.updateOrderStatus);
  const addScoreEvent = useScoringStore((s) => s.addScoreEvent);
  const addRecipeResult = useScoringStore((s) => s.addRecipeResult);

  // 물리엔진 tick 활성화
  useGameTick();

  // 주문 자동 생성
  useOrderGenerator();

  // 레시피 판별
  const { loadRecipes, evaluateAll, getRecipeName, getRecipeIngredients, getRecipeNaturalText, evaluateAttempt, getRecipe } = useRecipeEval(storeId);

  /** 액션 단위 dry-run → 차단되면 거부 팝업 표시. true 반환 시 호출자가 액션을 즉시 중단해야 함. */
  const tryRejectAndShowPopup = useCallback(
    (containerInstanceId: string, attemptingItems: AttemptingItem[]): boolean => {
      const result = evaluateAttempt(containerInstanceId, attemptingItems);
      if (!result || !result.blocked) return false;
      const ci = useGameStore.getState().containerInstances.find((c) => c.id === containerInstanceId);
      const order = ci?.assigned_order_id
        ? useGameStore.getState().orders.find((o) => o.id === ci.assigned_order_id)
        : null;
      if (!ci || !order) return true;
      const recipe = getRecipe(order.recipe_id);
      openRejectionPopup({
        recipeName: recipe?.name ?? '레시피',
        attemptingItems: attemptingItems.map((it) => ({
          ingredientId: it.ingredientId,
          quantity: it.quantity,
        })),
        errorsByIngredientId: result.errorsByIngredientId,
        blockReason: result.blockReason!,
        missingForThisAction: result.missingForThisAction,
        correctRecipe: [...result.filteredRecipeIngredients].sort(
          (a, b) => a.plate_order - b.plate_order,
        ),
      });
      return true;
    },
    [evaluateAttempt, getRecipe, openRejectionPopup],
  );

  // recipes + game_orders 1회 로딩
  useEffect(() => {
    loadRecipes();

    if (sessionId) {
      supabase
        .from('game_orders')
        .select('*')
        .eq('session_id', sessionId)
        .order('order_sequence', { ascending: true })
        .then(({ data }) => {
          if (data) setOrders(data as GameOrder[]);
        });
    }
  }, [loadRecipes, storeId, sessionId, setOrders]);

  // ingredientInstances 변경 시 레시피 판별
  const prevIngredientsRef = useRef(ingredientInstances);
  useEffect(() => {
    if (ingredientInstances !== prevIngredientsRef.current) {
      prevIngredientsRef.current = ingredientInstances;
      evaluateAll();
    }
  }, [ingredientInstances, evaluateAll]);

  // 패널 레이아웃 (인게임 주방 렌더링) — 다중 행 지원
  const [allLayouts, setAllLayouts] = useState<PanelLayout[]>([]);
  const [allEquipmentByRow, setAllEquipmentByRow] = useState<Map<number, PanelEquipment[]>>(new Map());
  const [allItemsByRow, setAllItemsByRow] = useState<Map<number, PanelItem[]>>(new Map());
  const [sectionCells, setSectionCells] = useState<SectionCell[]>([]);
  const [gridRows, setGridRows] = useState(1);
  const [gridCols, setGridCols] = useState(1);

  // 현재 행 기준 패널 데이터 (uiStore.currentRow에서 파생)
  const currentRow = useUiStore((s) => s.currentRow);
  const cameraCenterX = useUiStore((s) => s.cameraCenterX);
  const movableDirections = useUiStore((s) => s.movableDirections);
  const currentSection = useUiStore((s) => s.currentSection);
  const initSectionGrid = useUiStore((s) => s.initSectionGrid);
  const moveSection = useUiStore((s) => s.moveSection);

  const panelLayout = useMemo(() =>
    allLayouts.find((l) => l.row_index === currentRow) ?? null,
  [allLayouts, currentRow]);
  const panelEquipmentList = useMemo(() =>
    allEquipmentByRow.get(currentRow) ?? [],
  [allEquipmentByRow, currentRow]);
  const panelItemList = useMemo(() =>
    allItemsByRow.get(currentRow) ?? [],
  [allItemsByRow, currentRow]);
  // 전 행 통합 장비 (equipment state 초기화용)
  const allPanelEquipment = useMemo(() => {
    const all: PanelEquipment[] = [];
    for (const eqs of allEquipmentByRow.values()) all.push(...eqs);
    return all;
  }, [allEquipmentByRow]);

  // panelEquipmentId → gameEquipmentStateId 매핑
  const [panelToStateIdMap, setPanelToStateIdMap] = useState<Map<string, string>>(new Map());

  // store_ingredients + containers 1회 로딩 캐시
  const storeIngredientsMap = useGameStore((s) => s.storeIngredientsMap);
  const [containersMap, setContainersMap] = useState<Map<string, Container>>(new Map());

  // 레시피 요구량 조회 (클릭 투입 프리셋용)
  const findRecipeQuantity = useCallback(
    (ingredientId: string): number | null => {
      const { orders } = useGameStore.getState();
      for (const order of orders) {
        if (order.status !== 'pending' && order.status !== 'in_progress') continue;
        const ris = getRecipeIngredients(order.recipe_id);
        const match = ris.find((ri) => ri.ingredient_id === ingredientId);
        if (match) return match.quantity;
      }
      return null;
    },
    [getRecipeIngredients],
  );

  // 클릭 인터랙션 비즈니스 액션 핸들러
  const handleResolvedAction = useCallback((action: ResolvedAction) => {
    if (action.type === 'add-ingredient') {
      const { ingredientId, destination, instanceId } = action;
      if (!ingredientId || !destination) return;

      // 목적지별 location 필드 결정
      let equipmentStateId: string | null = null;
      let containerInstanceId: string | null = null;
      const locationType = destination.locationType;

      if (locationType === 'equipment') {
        if (!destination.equipmentId) return;
        equipmentStateId = panelToStateIdMap.get(destination.equipmentId) ?? null;
        if (!equipmentStateId) return;

        // 웍이면 sink/dirty/burned 상태 차단 + 팝업
        const equip = useEquipmentStore.getState().equipments.find((e) => e.id === equipmentStateId);
        if (equip?.equipment_type === 'wok') {
          const wokAtSink = useEquipmentStore.getState().wok_at_sink;
          if (wokAtSink.has(equipmentStateId)) {
            openWokBlockedPopup('at_sink');
            return;
          }
          if (equip.wok_status === 'dirty' || equip.wok_status === 'burned') {
            openWokBlockedPopup(equip.wok_status);
            return;
          }
        }
      } else if (locationType === 'container') {
        containerInstanceId = destination.containerInstanceId ?? null;
        if (!containerInstanceId) return;
      }

      // 사전 검증 (액션 단위 dry-run): 컨테이너에 잘못된 재료 추가 거부 + 팝업 표시
      if (locationType === 'container' && containerInstanceId) {
        const rejected = tryRejectAndShowPopup(containerInstanceId, [{
          ingredientId,
          quantity: 0, // 차단 결정에 quantity는 사용하지 않음 (수량 오류는 비차단)
          actionHistory: [],
        }]);
        if (rejected) return;
      }

      // StoreIngredient 조회
      const si = storeIngredientsMap.get(ingredientId);
      const unit = si?.unit;

      // 같은 재료 기존 인스턴스 검색
      const existing = useGameStore.getState().ingredientInstances.find(
        (i) => i.ingredient_id === ingredientId
          && i.location_type === locationType
          && i.equipment_state_id === equipmentStateId
          && i.container_instance_id === containerInstanceId,
      );

      if (instanceId) {
        // ===== 유한 소스 (핸드바) =====
        const sourceInst = useGameStore.getState().ingredientInstances.find((i) => i.id === instanceId);
        if (!sourceInst || sourceInst.quantity <= 0) return;

        const doTransfer = (qty: number) => {
          const clamped = Math.min(qty, sourceInst.quantity);
          if (existing) {
            incrementIngredientQuantity(existing.id, clamped);
          } else {
            const newPlateOrder =
              locationType === 'container' && containerInstanceId
                ? incrementContainerPlateOrder(containerInstanceId)
                : null;
            addIngredientInstance({
              id: crypto.randomUUID(),
              session_id: sessionId!,
              ingredient_id: ingredientId,
              quantity: clamped,
              location_type: locationType,
              zone_id: null,
              equipment_state_id: equipmentStateId,
              container_instance_id: containerInstanceId,
              action_history: [],
              plate_order: newPlateOrder,
            });
          }
          decrementIngredientQuantity(instanceId, clamped);
          // 소스 소진 시 선택 해제
          const stillExists = useGameStore.getState().ingredientInstances.some((i) => i.id === instanceId);
          if (!stillExists) {
            useSelectionStore.getState().deselect();
          }
        };

        if (si?.allow_direct_input) {
          openQuantityModal(unit ?? 'g', [], doTransfer, {
            mode: 'direct',
            defaultQty: si?.default_quantity ?? 1,
            maxQty: sourceInst.quantity,
          });
        } else if (INSTANT_UNITS.has(unit ?? '')) {
          doTransfer(1);
        } else {
          const presets = generatePresets(sourceInst.quantity);
          openQuantityModal(unit ?? 'g', presets, doTransfer);
        }
      } else {
        // ===== 무한 소스 (서랍/바구니/냉장고) =====
        const defaultQty = si?.default_quantity ?? 1;

        const createOrIncrement = (qty: number) => {
          if (existing) {
            incrementIngredientQuantity(existing.id, qty);
          } else {
            const newPlateOrder =
              locationType === 'container' && containerInstanceId
                ? incrementContainerPlateOrder(containerInstanceId)
                : null;
            addIngredientInstance({
              id: crypto.randomUUID(),
              session_id: sessionId!,
              ingredient_id: ingredientId,
              quantity: qty,
              location_type: locationType,
              zone_id: null,
              equipment_state_id: equipmentStateId,
              container_instance_id: containerInstanceId,
              action_history: [],
              plate_order: newPlateOrder,
            });
          }
        };

        if (si?.allow_direct_input) {
          openQuantityModal(unit ?? 'g', [], createOrIncrement, {
            mode: 'direct',
            defaultQty,
          });
        } else if (INSTANT_UNITS.has(unit ?? '')) {
          createOrIncrement(1);
        } else {
          const recipeQty = findRecipeQuantity(ingredientId);
          const presets = generatePresets(recipeQty ?? defaultQty);
          openQuantityModal(unit ?? 'g', presets, createOrIncrement);
        }
      }

      addActionLog({
        session_id: sessionId!,
        action_type: 'click_add_ingredient',
        timestamp_ms: Date.now(),
        metadata: {
          ingredient_id: ingredientId,
          destination_type: locationType,
          equipment_state_id: equipmentStateId,
          container_instance_id: containerInstanceId,
          source_instance_id: instanceId ?? null,
        },
      });
    }

    if (action.type === 'place-container') {
      const { containerId, equipmentId, localRatio } = action;
      if (!containerId || !equipmentId || !localRatio) return;

      const containerInstance: GameContainerInstance = {
        id: crypto.randomUUID(),
        session_id: sessionId!,
        container_id: containerId,
        assigned_order_id: null,
        is_complete: false,
        is_served: false,
        current_plate_order: 0,
        is_dirty: false,
        placed_equipment_id: equipmentId,
        placed_local_x: localRatio.x,
        placed_local_y: localRatio.y,
      };

      addContainerInstance(containerInstance);

      // 그릇을 올린 직후 주문 선택 모달 자동 호출 (그릇 → 주문 매핑)
      openOrderSelectModal(containerInstance.id);

      addActionLog({
        session_id: sessionId!,
        action_type: 'click_place_container',
        timestamp_ms: Date.now(),
        metadata: {
          container_id: containerId,
          equipment_id: equipmentId,
          local_x: localRatio.x,
          local_y: localRatio.y,
        },
      });
    }

    if (action.type === 'move-container') {
      const { containerInstanceId, equipmentId, localRatio } = action;
      if (!containerInstanceId || !equipmentId || !localRatio) return;

      moveContainer(containerInstanceId, {
        placed_equipment_id: equipmentId,
        placed_local_x: localRatio.x,
        placed_local_y: localRatio.y,
      });

      addActionLog({
        session_id: sessionId!,
        action_type: 'click_move_container',
        timestamp_ms: Date.now(),
        metadata: {
          container_instance_id: containerInstanceId,
          target_equipment_id: equipmentId,
          local_x: localRatio.x,
          local_y: localRatio.y,
        },
      });
    }

    if (action.type === 'pour') {
      const { source, destination } = action;
      if (!source || !destination) return;

      // destination이 equipment(웍)일 때 sink/dirty/burned 차단 + 팝업
      if (destination.locationType === 'equipment') {
        const destStateId = panelToStateIdMap.get(destination.equipmentId!) ?? null;
        if (!destStateId) return;
        const destEquip = useEquipmentStore.getState().equipments.find((e) => e.id === destStateId);
        if (destEquip?.equipment_type === 'wok') {
          const wokAtSink = useEquipmentStore.getState().wok_at_sink;
          if (wokAtSink.has(destStateId)) {
            openWokBlockedPopup('at_sink');
            return;
          }
          if (destEquip.wok_status === 'dirty' || destEquip.wok_status === 'burned') {
            openWokBlockedPopup(destEquip.wok_status);
            return;
          }
        }
      }

      // 1. source 재료 목록 조회
      const allIngredients = useGameStore.getState().ingredientInstances;
      let sourceIngredients: GameIngredientInstance[];

      if (source.locationType === 'equipment') {
        sourceIngredients = allIngredients.filter(
          (i) => i.location_type === 'equipment' && i.equipment_state_id === source.equipmentStateId,
        );
      } else {
        sourceIngredients = allIngredients.filter(
          (i) => i.location_type === 'container' && i.container_instance_id === source.containerInstanceId,
        );
      }
      if (sourceIngredients.length === 0) return;

      // 1.5. destination이 container인 경우 액션 단위 dry-run 검증
      if (destination.locationType === 'container' && destination.containerInstanceId) {
        const attemptingItems: AttemptingItem[] = sourceIngredients.map((i) => ({
          ingredientId: i.ingredient_id,
          quantity: i.quantity,
          actionHistory: i.action_history,
        }));
        const rejected = tryRejectAndShowPopup(destination.containerInstanceId, attemptingItems);
        if (rejected) return;
      }

      // 2. destination 업데이트 구성
      const instanceIds = sourceIngredients.map((i) => i.id);
      let updates: Partial<GameIngredientInstance>;

      if (destination.locationType === 'container') {
        const newPlateOrder = incrementContainerPlateOrder(destination.containerInstanceId!);
        updates = {
          location_type: 'container',
          equipment_state_id: null,
          container_instance_id: destination.containerInstanceId!,
          zone_id: null,
          plate_order: newPlateOrder,
        };
      } else {
        const destStateId = panelToStateIdMap.get(destination.equipmentId!) ?? null;
        if (!destStateId) return;
        updates = {
          location_type: 'equipment',
          equipment_state_id: destStateId,
          container_instance_id: null,
          zone_id: null,
          plate_order: null,
        };
      }

      // 3. bulk 이동
      bulkMoveIngredients(instanceIds, updates);

      // 4. dirty 처리
      if (source.locationType === 'equipment' && source.equipmentStateId) {
        const equip = useEquipmentStore.getState().equipments.find((e) => e.id === source.equipmentStateId);
        if (equip?.equipment_type === 'wok') {
          updateEquipment(source.equipmentStateId, { wok_status: 'dirty' });
        }
      }
      if (source.locationType === 'container' && source.containerInstanceId) {
        setContainerDirty(source.containerInstanceId);
      }

      // 5. 액션 로그
      addActionLog({
        session_id: sessionId!,
        action_type: 'click_pour',
        timestamp_ms: Date.now(),
        metadata: {
          source_type: source.locationType,
          source_id: source.equipmentStateId ?? source.containerInstanceId,
          destination_type: destination.locationType,
          destination_id: destination.containerInstanceId ?? destination.equipmentId,
        },
      });
    }

    if (action.type === 'dispose') {
      const { containerInstanceId } = action;
      if (!containerInstanceId) return;

      // 빈 그릇만 dispose 허용 (resolveAction은 순수함수라 여기서 체크)
      const containerIngs = useGameStore.getState().ingredientInstances.filter(
        (i) => i.container_instance_id === containerInstanceId && i.location_type === 'container',
      );
      if (containerIngs.length > 0) return;

      // 방어적: 혹시 남은 ingredient 참조 정리
      const allRelated = useGameStore.getState().ingredientInstances.filter(
        (i) => i.container_instance_id === containerInstanceId,
      );
      if (allRelated.length > 0) {
        bulkMoveIngredients(allRelated.map((i) => i.id), {
          location_type: 'disposed',
          equipment_state_id: null,
          container_instance_id: null,
          zone_id: null,
          plate_order: null,
        });
      }

      removeContainerInstance(containerInstanceId);

      addActionLog({
        session_id: sessionId!,
        action_type: 'click_dispose',
        timestamp_ms: Date.now(),
        metadata: { container_instance_id: containerInstanceId },
      });
    }

    if (action.type === 'move-wok-to-sink') {
      const wokStateId = action.equipmentStateId;
      const sinkPanelId = action.equipmentId;
      if (!wokStateId || !sinkPanelId) return;

      // 1. 웍 안 재료 모두 dispose
      const wokIngs = useGameStore.getState().ingredientInstances.filter(
        (i) => i.location_type === 'equipment' && i.equipment_state_id === wokStateId,
      );
      if (wokIngs.length > 0) {
        bulkMoveIngredients(wokIngs.map((i) => i.id), {
          location_type: 'disposed',
          equipment_state_id: null,
          container_instance_id: null,
          zone_id: null,
          plate_order: null,
        });
      }

      // 2. wok_at_sink 매핑 등록 (key = wok stateId, value = sink panel id)
      setWokAtSink(wokStateId, sinkPanelId);

      // 3. 화구 강제 OFF + 웍 dirty 화면 (이미 dirty면 그대로)
      const wokState = useEquipmentStore.getState().equipments.find((e) => e.id === wokStateId);
      if (wokState && wokState.wok_status !== 'dirty') {
        updateEquipment(wokStateId, { wok_status: 'dirty', wok_temp: 25, burner_level: 0 });
      } else if (wokState) {
        updateEquipment(wokStateId, { burner_level: 0 });
      }

      // 4. 선택 해제
      useSelectionStore.getState().deselect();
    }

    if (action.type === 'serve-order') {
      const { orderId } = action;
      if (!orderId) return;
      const order = useGameStore.getState().orders.find((o) => o.id === orderId);
      if (!order || order.status === 'completed') return;

      // 1. 같은 주문의 모든 컨테이너
      const targetContainers = useGameStore.getState().containerInstances.filter(
        (c) => c.assigned_order_id === orderId,
      );
      if (targetContainers.length === 0) return;

      // 2. 모두 is_complete여야 함 (안전장치)
      if (!targetContainers.every((c) => c.is_complete)) return;

      // 3. 서빙 시간 계산
      const createdAt = new Date(order.created_at).getTime();
      const now = Date.now();
      const serveTimeMs = now - createdAt;

      // 4. 서빙 시간 점수 (기존 SCORE_CONFIG 연결)
      let scoreEventType: 'fast_serve' | 'slow_serve' | 'very_slow_serve' | null = null;
      let scorePoints = 0;
      if (serveTimeMs < SCORE_CONFIG.FAST_SERVE_THRESHOLD) {
        scoreEventType = 'fast_serve';
        scorePoints = SCORE_CONFIG.FAST_SERVE;
      } else if (serveTimeMs >= SCORE_CONFIG.VERY_SLOW_SERVE_THRESHOLD) {
        scoreEventType = 'very_slow_serve';
        scorePoints = SCORE_CONFIG.VERY_SLOW_SERVE;
      } else if (serveTimeMs >= SCORE_CONFIG.SLOW_SERVE_THRESHOLD) {
        scoreEventType = 'slow_serve';
        scorePoints = SCORE_CONFIG.SLOW_SERVE;
      }
      if (scoreEventType) {
        addScoreEvent({
          session_id: sessionId!,
          event_type: scoreEventType,
          points: scorePoints,
          timestamp_ms: now,
          metadata: { order_id: orderId, serve_time_ms: serveTimeMs },
        });
      }

      // 5. RecipeResult 기록
      const errorCount = useScoringStore.getState().recipeErrors.filter(
        (e) => e.order_id === orderId,
      ).length;
      addRecipeResult({
        session_id: sessionId!,
        order_id: orderId,
        recipe_id: order.recipe_id,
        is_success: true,
        error_count: errorCount,
        serve_time_ms: serveTimeMs,
        created_at: new Date(now).toISOString(),
      });

      // 6. 모든 컨테이너 markContainerServed
      for (const c of targetContainers) {
        markContainerServed(c.id);
      }

      // 7. 주문 상태 갱신
      updateOrderStatus(orderId, 'completed');

      // 8. action log
      addActionLog({
        session_id: sessionId!,
        action_type: 'serve',
        timestamp_ms: now,
        metadata: { order_id: orderId, serve_time_ms: serveTimeMs, container_count: targetContainers.length },
      });
    }
  }, [sessionId, addIngredientInstance, incrementIngredientQuantity, decrementIngredientQuantity, addContainerInstance, moveContainer, openQuantityModal, addActionLog, findRecipeQuantity, bulkMoveIngredients, incrementContainerPlateOrder, updateEquipment, setContainerDirty, removeContainerInstance, panelToStateIdMap, tryRejectAndShowPopup, openOrderSelectModal, openWokBlockedPopup, setWokAtSink, markContainerServed, updateOrderStatus, addScoreEvent, addRecipeResult, storeIngredientsMap]);

  // 클릭/선택 인터랙션 시스템
  const { selection, handleSceneClick, deselect } = useClickInteraction({
    getIngredientLabel: (id) => storeIngredientsMap.get(id)?.display_name ?? id,
    getContainerLabel: (id) => containersMap.get(id)?.name ?? id,
    onAction: handleResolvedAction,
  });

  // 바구니 접기 신호: GameKitchenView → HUD 전달
  const collapseAllBasketsRef = useRef<(() => void) | null>(null);
  const handleRegisterCollapseBaskets = useCallback((fn: () => void) => {
    collapseAllBasketsRef.current = fn;
  }, []);
  const collapseBaskets = useCallback(() => {
    collapseAllBasketsRef.current?.();
  }, []);

  // 웍 내용물 맵 (홀로그램 텍스트 표시용)
  const wokContentsMap = useMemo(() => {
    const map = new Map<string, { ingredientId: string; displayName: string; quantity: number; unit: string }[]>();
    const stateToPanel = new Map<string, string>();
    for (const [panelId, stateId] of panelToStateIdMap) {
      stateToPanel.set(stateId, panelId);
    }
    for (const inst of ingredientInstances) {
      if (inst.location_type !== 'equipment' || !inst.equipment_state_id) continue;
      const panelId = stateToPanel.get(inst.equipment_state_id);
      if (!panelId) continue;
      const si = storeIngredientsMap.get(inst.ingredient_id);
      const entry = {
        ingredientId: inst.ingredient_id,
        displayName: si?.display_name ?? inst.ingredient_id,
        quantity: inst.quantity,
        unit: si?.unit ?? '',
      };
      const arr = map.get(panelId) ?? [];
      arr.push(entry);
      map.set(panelId, arr);
    }
    return map;
  }, [ingredientInstances, panelToStateIdMap, storeIngredientsMap]);

  // 올려놓인 그릇 파생 데이터
  const placedContainers = useMemo(() => {
    // 주문별 "모든 그릇 완료" 여부 사전 계산 (서빙 버튼 표시 조건)
    const orderAllComplete = new Map<string, boolean>();
    for (const ci of containerInstances) {
      if (!ci.assigned_order_id || ci.is_served) continue;
      if (orderAllComplete.has(ci.assigned_order_id)) continue;
      const peers = containerInstances.filter(
        (c) => c.assigned_order_id === ci.assigned_order_id && !c.is_served,
      );
      const allDone = peers.length > 0 && peers.every((c) => c.is_complete);
      orderAllComplete.set(ci.assigned_order_id, allDone);
    }

    return containerInstances
      .filter((ci) => ci.placed_equipment_id !== null && !ci.is_served)
      .map((ci) => {
        const container = containersMap.get(ci.container_id);
        const contents = ingredientInstances
          .filter((ii) => ii.container_instance_id === ci.id && ii.location_type === 'container')
          .map((ii) => {
            const si = storeIngredientsMap.get(ii.ingredient_id);
            return `${si?.display_name ?? '재료'} ${ii.quantity}${si?.unit ?? ''}`;
          });
        const canServe = !!ci.assigned_order_id && (orderAllComplete.get(ci.assigned_order_id) ?? false);
        return {
          instanceId: ci.id,
          equipmentId: ci.placed_equipment_id!,
          localX: ci.placed_local_x!,
          localY: ci.placed_local_y!,
          label: container?.name ?? '그릇',
          contents,
          isComplete: ci.is_complete,
          orderId: ci.assigned_order_id,
          canServe,
        };
      });
  }, [containerInstances, ingredientInstances, containersMap, storeIngredientsMap]);

  // 패널 레이아웃 + 섹션 그리드 로드 (다중 행)
  useEffect(() => {
    const loadAll = async () => {
      // 1. section_grid
      const { data: gridData } = await supabase
        .from('section_grid')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle();
      const gr = (gridData as SectionGrid | null)?.grid_rows ?? 1;
      const gc = (gridData as SectionGrid | null)?.grid_cols ?? 1;
      setGridRows(gr);
      setGridCols(gc);

      // 2. section_cells
      const { data: cellsData } = await supabase
        .from('section_cells')
        .select('*')
        .eq('store_id', storeId);
      const cells = (cellsData ?? []) as SectionCell[];
      setSectionCells(cells);

      // 3. 전 행 panel_layouts
      const { data: layoutsData } = await supabase
        .from('panel_layouts')
        .select('*')
        .eq('store_id', storeId)
        .order('row_index');
      const layouts = (layoutsData ?? []) as PanelLayout[];
      setAllLayouts(layouts);

      // 4. 행별 equipment/items 로드
      const eqMap = new Map<number, PanelEquipment[]>();
      const itemMap = new Map<number, PanelItem[]>();
      for (const ld of layouts) {
        const { data: eqData } = await supabase
          .from('panel_equipment')
          .select('*')
          .eq('layout_id', ld.id)
          .order('sort_order');
        eqMap.set(ld.row_index, (eqData ?? []) as PanelEquipment[]);

        const { data: itemData } = await supabase
          .from('panel_items')
          .select('*')
          .eq('layout_id', ld.id)
          .order('sort_order');
        itemMap.set(ld.row_index, (itemData ?? []) as PanelItem[]);
      }
      setAllEquipmentByRow(eqMap);
      setAllItemsByRow(itemMap);

      // 5. uiStore 섹션 그리드 초기화
      initSectionGrid(gr, gc, cells, eqMap);
    };

    loadAll();
  }, [storeId, initSectionGrid]);

  useEffect(() => {
    // store_ingredients + ingredients_master('물') 병렬 로딩
    Promise.all([
      supabase.from('store_ingredients').select('*').eq('store_id', storeId),
      supabase.from('ingredients_master').select('id').eq('name', '물'),
    ]).then(([siResult, masterResult]) => {
      const data = siResult.data;
      if (data) {
        const map = new Map<string, StoreIngredient>();
        (data as StoreIngredient[]).forEach((si) => map.set(si.id, si));
        useGameStore.getState().setStoreIngredientsMap(map);

        // 물 재료 ID Set 캐싱
        const masters = masterResult.data;
        if (masters && masters.length > 0) {
          const waterMasterIds = new Set(masters.map((m: { id: string }) => m.id));
          const waterIds = new Set<string>();
          (data as StoreIngredient[]).forEach((si) => {
            if (waterMasterIds.has(si.master_id)) waterIds.add(si.id);
          });
          useGameStore.getState().setWaterIngredientIds(waterIds);
        } else {
          console.warn('[GamePage] ingredients_master에 "물" 레코드가 없습니다');
        }
      }
    });

    // containers 로딩
    supabase
      .from('containers')
      .select('*')
      .eq('store_id', storeId)
      .then(({ data }) => {
        if (data) {
          const map = new Map<string, Container>();
          (data as Container[]).forEach((c) => map.set(c.id, c));
          setContainersMap(map);
        }
      });

  }, [storeId]);

  // 장비 상태 초기화: 전 행 panel_equipment 기반으로 game_equipment_state 생성
  useEffect(() => {
    if (!sessionId || allPanelEquipment.length === 0) return;

    // 물리엔진 대상 장비만 필터 (burner→wok, sink→sink)
    const physicsEquipment = allPanelEquipment
      .map((pe) => ({ pe, physicsType: panelToPhysicsType(pe.equipment_type) }))
      .filter((item): item is { pe: PanelEquipment; physicsType: EquipmentType } => item.physicsType !== null);

    if (physicsEquipment.length === 0) return;

    const upsertRows = physicsEquipment.map(({ pe, physicsType }) => {
      const base = {
        session_id: sessionId,
        equipment_type: physicsType,
        equipment_index: pe.equipment_index,
        panel_equipment_id: pe.id,
      };

      switch (physicsType) {
        case 'wok':
          return { ...base, wok_status: 'clean' as const, wok_temp: 25, burner_level: 0 };
        default:
          return base;
      }
    });

    supabase
      .from('game_equipment_state')
      .upsert(upsertRows, { onConflict: 'session_id,equipment_type,equipment_index' })
      .select('*')
      .then(({ data: result, error }) => {
        if (!error && result) {
          setEquipments(result as GameEquipmentState[]);

          // panelEquipmentId → gameEquipmentStateId 매핑 (전 행 통합)
          const mapping = new Map<string, string>();
          for (const ges of result as GameEquipmentState[]) {
            if (ges.panel_equipment_id) {
              mapping.set(ges.panel_equipment_id, ges.id);
            }
          }
          setPanelToStateIdMap(mapping);
        } else if (error) {
          console.error('[GamePage] equipment init error:', error);
        }
      });
  }, [sessionId, allPanelEquipment, setEquipments]);

  // 세션 결과 오버레이 상태 (useSyncExternalStore: effect 내 setState 회피)
  const sessionResult = useSyncExternalStore(subscribeSessionResult, getSessionResultSnapshot);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');

  // 마운트 시 외부 스토어 초기화 (세션 재진입 대응)
  useEffect(() => {
    emitSessionResult(null);
    return () => { emitSessionResult(null); };
  }, []);

  // unmount 후 setState 가드
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const onRequestFeedback = useCallback(() => {
    setFeedbackState((prev) => {
      if (typeof prev === 'object') return prev;   // 이미 텍스트 있음
      if (prev === 'failed') return prev;
      return 'loading';
    });
  }, []);

  // 종료 플래그 (중복 호출 방지)
  const sessionEndTriggered = useRef(false);

  const persistAndFetchFeedback = useCallback(async () => {
    try {
      const { actionLogs, scoreEvents, recipeErrors, recipeResults, currentScore }
        = useScoringStore.getState();
      const { orders } = useGameStore.getState();

      const errors: string[] = [];

      // 1. game_orders UPSERT (클라이언트에서 생성된 주문을 DB에 저장 — FK 선행)
      if (orders.length > 0) {
        const { error } = await supabase
          .from('game_orders')
          .upsert(orders, { onConflict: 'id' });
        if (error) errors.push(`orders: ${error.message}`);
      }

      // 2. game_action_logs INSERT (batch)
      if (actionLogs.length > 0) {
        const { error } = await supabase
          .from('game_action_logs')
          .insert(actionLogs);
        if (error) errors.push(`action_logs: ${error.message}`);
      }

      // 3. game_score_events INSERT (batch)
      if (scoreEvents.length > 0) {
        const { error } = await supabase
          .from('game_score_events')
          .insert(scoreEvents);
        if (error) errors.push(`score_events: ${error.message}`);
      }

      // 4. game_recipe_errors INSERT (batch)
      if (recipeErrors.length > 0) {
        const { error } = await supabase
          .from('game_recipe_errors')
          .insert(recipeErrors);
        if (error) errors.push(`recipe_errors: ${error.message}`);
      }

      // 5. game_recipe_results INSERT (batch)
      if (recipeResults.length > 0) {
        const { error } = await supabase
          .from('game_recipe_results')
          .insert(recipeResults);
        if (error) errors.push(`recipe_results: ${error.message}`);
      }

      // 6. game_sessions UPDATE (score, ended_at, status='completed')
      {
        const { error } = await supabase
          .from('game_sessions')
          .update({
            score: currentScore,
            ended_at: new Date().toISOString(),
            status: 'completed',
          })
          .eq('id', sessionId);
        if (error) errors.push(`sessions: ${error.message}`);
      }

      if (errors.length > 0) {
        console.warn('[GamePage] DB 저장 부분 실패:', errors);
      }

      // 7. generate-feedback Edge Function 호출
      let feedbackText: string | null = null;
      try {
        const idle5s = scoreEvents.filter((e) => e.event_type === 'short_idle').length;
        const idle10s = scoreEvents.filter((e) => e.event_type === 'long_idle').length;
        const redundantNav = scoreEvents.filter((e) => e.event_type === 'redundant_nav').length;

        const completedResults = recipeResults.filter((r) => r.is_success);
        const failedResults = recipeResults.filter((r) => !r.is_success);

        const serveTimes = recipeResults
          .filter((r) => r.serve_time_ms != null)
          .map((r) => ({
            recipe_name: getRecipeName(r.recipe_id),
            time_ms: r.serve_time_ms!,
          }));

        const avgServeTime = serveTimes.length > 0
          ? serveTimes.reduce((sum, s) => sum + s.time_ms, 0) / serveTimes.length
          : 0;

        // recipe_errors에 사람이 읽을 수 있는 이름 추가 (AI 프롬프트 품질 개선)
        const { storeIngredientsMap } = useGameStore.getState();
        const enrichedErrors = recipeErrors.map((e) => ({
          ...e,
          details: {
            ...e.details,
            recipe_name: getRecipeName(e.recipe_id),
            ...(e.details.ingredient_id
              ? {
                  ingredient_name:
                    storeIngredientsMap.get(e.details.ingredient_id as string)?.display_name
                    ?? String(e.details.ingredient_id),
                }
              : {}),
          },
        }));

        const { data: fbData, error: fbError } = await supabase.functions.invoke(
          'generate-feedback',
          {
            body: {
              session_id: sessionId,
              score: currentScore,
              score_events: scoreEvents,
              recipe_errors: enrichedErrors,
              action_log_summary: {
                total_actions: actionLogs.length,
                idle_count_5s: idle5s,
                idle_count_10s: idle10s,
                redundant_nav_count: redundantNav,
                avg_serve_time_ms: avgServeTime,
                recipes_completed: completedResults.map((r) => getRecipeName(r.recipe_id)),
                recipes_failed: failedResults.map((r) => getRecipeName(r.recipe_id)),
              },
              serving_times: serveTimes,
            },
          },
        );

        if (fbError) {
          console.warn('[GamePage] AI 피드백 생성 실패:', fbError);
        } else {
          feedbackText = fbData?.feedback ?? null;
        }
      } catch (err) {
        console.warn('[GamePage] AI 피드백 호출 실패:', err);
      }

      // 8. 피드백 상태 갱신 (오버레이는 이미 떠 있음)
      if (!mountedRef.current) return;
      if (feedbackText) {
        setFeedbackState({ text: feedbackText });
      } else {
        setFeedbackState('failed');
      }
    } catch (err) {
      console.error('[GamePage] persistAndFetchFeedback 실패:', err);
      if (mountedRef.current) {
        setFeedbackState('failed');
      }
    }
  }, [sessionId, getRecipeName]);

  // 게임 자동 종료 감지
  const orders = useGameStore((s) => s.orders);
  const totalOrderCount = useGameStore((s) => s.totalOrderCount);

  useEffect(() => {
    if (orders.length === 0) return;
    if (sessionEndTriggered.current) return;

    const completedCount = orders.filter((o) => o.status === 'completed').length;
    if (completedCount < totalOrderCount) return;

    // 중복 종료 방지
    sessionEndTriggered.current = true;

    // 외부 스토어에 점수 스냅샷 발행 (React setState 미사용)
    const { currentScore, scoreEvents } = useScoringStore.getState();
    emitSessionResult({ score: currentScore, scoreEvents });

    // 비동기 스케줄링: persistAndFetchFeedback 내부에서 setFeedbackState를 호출하므로
    // effect 본문의 동기 호출 체인에서 분리하여 set-state-in-effect 회피
    const fn = persistAndFetchFeedback;
    setTimeout(() => { void fn(); }, 0);
  }, [orders, totalOrderCount, persistAndFetchFeedback]);



  return (
    <>
      <div className={styles.gamePage}>
        <div className={styles.gameArea} onContextMenu={(e) => e.preventDefault()}>
          <GameHeader />
          <div className={styles.mainViewport}>
            <GameKitchenView
              panelHeights={panelLayout?.panel_heights ?? [0.3, 0.4, 0.3]}
              perspectiveDeg={panelLayout?.perspective_deg ?? 45}
              previewYOffset={panelLayout?.preview_y_offset ?? 0.5}
              backgroundImageUrl={panelLayout?.background_image_url ?? null}
              cameraCenterX={cameraCenterX}
              imageFitMode={panelLayout?.image_fit_mode ?? 'cover'}
              equipment={panelEquipmentList.map((eq) => ({
                id: eq.id,
                panelIndex: eq.panel_number - 1,
                equipmentType: eq.equipment_type,
                x: eq.x,
                y: eq.y,
                width: eq.width,
                height: eq.height,
                equipmentIndex: eq.equipment_index,
                config: eq.config,
                placeable: eq.placeable,
                sortOrder: eq.sort_order,
              }))}
              items={panelItemList.map((item) => {
                let label = '';
                if (item.item_type === 'ingredient' && item.ingredient_id) {
                  label = storeIngredientsMap.get(item.ingredient_id)?.display_name ?? '';
                } else if (item.item_type === 'container' && item.container_id) {
                  label = containersMap.get(item.container_id)?.name ?? '';
                }
                return {
                  id: item.id,
                  panelIndex: item.panel_number - 1,
                  itemType: item.item_type,
                  x: item.x,
                  y: item.y,
                  width: item.width,
                  height: item.height,
                  label,
                  ingredientId: item.ingredient_id ?? undefined,
                  containerId: item.container_id ?? undefined,
                };
              })}
              ingredientLabelsMap={new Map(
                Array.from(storeIngredientsMap.entries()).map(([id, si]) => [id, si.display_name])
              )}
              wokContentsMap={wokContentsMap}
              placedContainers={placedContainers}
              hasSelection={!!selection}
              selection={selection}
              panelToStateIdMap={panelToStateIdMap}
              onSceneClick={handleSceneClick}
              onRegisterCollapseBaskets={handleRegisterCollapseBaskets}
            >
              <BillQueue getRecipeName={getRecipeName} getRecipeNaturalText={getRecipeNaturalText} />
            </GameKitchenView>
          </div>
          {/* HUD: 미니맵 + 이동 */}
          <MinimapHUD
            gridRows={gridRows}
            gridCols={gridCols}
            cells={sectionCells}
            currentSection={currentSection}
          />
          <NavigationHUD
            movable={movableDirections}
            onMove={(dir: MoveDirection) => moveSection(dir, allEquipmentByRow)}
          />
          {/* HUD: 좌측 상단 (선택 표시 + 핸드바) */}
          <div className={styles.topLeftHud}>
            <SelectionDisplay selection={selection} onDeselect={deselect} onCollapseBaskets={collapseBaskets} />
            <Handbar onCollapseBaskets={collapseBaskets} onIngredientToHandbar={(sel) => {
              if (sel.ingredientId) {
                handleResolvedAction({
                  type: 'add-ingredient',
                  ingredientId: sel.ingredientId,
                  sourceEquipmentId: sel.sourceEquipmentId,
                  destination: { locationType: 'hand' },
                });
              }
            }} />
          </div>
        </div>
      </div>
      <OrderSelectModal getRecipeName={getRecipeName} />
      <QuantityInputModal />
      <RejectionPopup storeIngredientsMap={storeIngredientsMap} />
      <WokBlockedPopup />
      {sessionResult && (
        <SessionResultOverlay
          score={sessionResult.score}
          scoreEvents={sessionResult.scoreEvents}
          feedbackState={feedbackState}
          onRequestFeedback={onRequestFeedback}
          onFeed={() => navigate('/feed')}
          onClose={() => navigate('/game/setup')}
        />
      )}
    </>
  );
};

export default GamePage;
