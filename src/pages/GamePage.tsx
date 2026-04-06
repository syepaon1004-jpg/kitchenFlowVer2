import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { INSTANT_UNITS } from '../lib/interaction/constants';
import { generatePresets } from '../lib/interaction/generatePresets';
import BillQueue from '../components/layout/BillQueue';

import GameKitchenView from '../components/game/GameKitchenView';
import SelectionDisplay from '../components/game/SelectionDisplay';
import { useClickInteraction } from '../hooks/useClickInteraction';
import { useSelectionStore } from '../stores/selectionStore';
import type { PanelLayout, PanelEquipment, PanelItem, PanelEquipmentType } from '../types/db';
import Handbar from '../components/layout/Handbar';
import GameHeader from '../components/game/GameHeader';
import SessionResultOverlay from '../components/game/SessionResultOverlay';
import OrderSelectModal from '../components/ui/OrderSelectModal';
import QuantityInputModal from '../components/ui/QuantityInputModal';
import '../styles/gameVariables.css';
import styles from './GamePage.module.css';

/** 패널 장비 타입 → 물리엔진 장비 타입 매핑 */
function panelToPhysicsType(panelType: PanelEquipmentType): EquipmentType | null {
  switch (panelType) {
    case 'burner': return 'wok';
    case 'sink': return 'sink';
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

  const setEquipments = useEquipmentStore((s) => s.setEquipments);
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const containerInstances = useGameStore((s) => s.containerInstances);
  const setOrders = useGameStore((s) => s.setOrders);

  // 물리엔진 tick 활성화
  useGameTick();

  // 주문 자동 생성
  useOrderGenerator();

  // 레시피 판별
  const { loadRecipes, evaluateAll, getRecipeName, getRecipeIngredients, getRecipeNaturalText } = useRecipeEval(storeId);

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

  // 패널 레이아웃 (인게임 주방 렌더링)
  const [panelLayout, setPanelLayout] = useState<PanelLayout | null>(null);
  const [panelEquipmentList, setPanelEquipmentList] = useState<PanelEquipment[]>([]);
  const [panelItemList, setPanelItemList] = useState<PanelItem[]>([]);

  // panelEquipmentId → gameEquipmentStateId 매핑
  const [panelToStateIdMap, setPanelToStateIdMap] = useState<Map<string, string>>(new Map());

  // store_ingredients + containers 1회 로딩 캐시
  const storeIngredientsMapRef = useRef<Map<string, StoreIngredient>>(new Map());
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
      } else if (locationType === 'container') {
        containerInstanceId = destination.containerInstanceId ?? null;
        if (!containerInstanceId) return;
      }

      // StoreIngredient 조회
      const si = storeIngredientsMapRef.current.get(ingredientId);
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
              plate_order: null,
            });
          }
          decrementIngredientQuantity(instanceId, clamped);
          // 소스 소진 시 선택 해제
          const stillExists = useGameStore.getState().ingredientInstances.some((i) => i.id === instanceId);
          if (!stillExists) {
            useSelectionStore.getState().deselect();
          }
        };

        if (INSTANT_UNITS.has(unit ?? '')) {
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
              plate_order: null,
            });
          }
        };

        if (INSTANT_UNITS.has(unit ?? '')) {
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

      // destination이 equipment(웍)일 때 dirty/burned 차단
      if (destination.locationType === 'equipment') {
        const destStateId = panelToStateIdMap.get(destination.equipmentId!) ?? null;
        if (!destStateId) return;
        const destEquip = useEquipmentStore.getState().equipments.find((e) => e.id === destStateId);
        if (destEquip?.equipment_type === 'wok' && (destEquip.wok_status === 'dirty' || destEquip.wok_status === 'burned')) {
          return;
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
  }, [sessionId, addIngredientInstance, incrementIngredientQuantity, decrementIngredientQuantity, addContainerInstance, moveContainer, openQuantityModal, addActionLog, findRecipeQuantity, bulkMoveIngredients, incrementContainerPlateOrder, updateEquipment, setContainerDirty, removeContainerInstance, panelToStateIdMap]);

  // 클릭/선택 인터랙션 시스템
  const { selection, handleSceneClick, deselect } = useClickInteraction({
    getIngredientLabel: (id) => storeIngredientsMapRef.current.get(id)?.display_name ?? id,
    getContainerLabel: (id) => containersMap.get(id)?.name ?? id,
    onAction: handleResolvedAction,
  });

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
      const si = storeIngredientsMapRef.current.get(inst.ingredient_id);
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
  }, [ingredientInstances, panelToStateIdMap]);

  // 올려놓인 그릇 파생 데이터
  const placedContainers = useMemo(() => {
    return containerInstances
      .filter((ci) => ci.placed_equipment_id !== null && !ci.is_served)
      .map((ci) => {
        const container = containersMap.get(ci.container_id);
        const contents = ingredientInstances
          .filter((ii) => ii.container_instance_id === ci.id && ii.location_type === 'container')
          .map((ii) => {
            const si = storeIngredientsMapRef.current.get(ii.ingredient_id);
            return `${si?.display_name ?? '재료'} ${ii.quantity}${si?.unit ?? ''}`;
          });
        return {
          instanceId: ci.id,
          equipmentId: ci.placed_equipment_id!,
          localX: ci.placed_local_x!,
          localY: ci.placed_local_y!,
          label: container?.name ?? '그릇',
          contents,
        };
      });
  }, [containerInstances, ingredientInstances, containersMap]);

  // 패널 레이아웃 로드
  useEffect(() => {
    supabase
      .from('panel_layouts')
      .select('*')
      .eq('store_id', storeId)
      .maybeSingle()
      .then(async ({ data: layoutData }) => {
        if (!layoutData) return;
        setPanelLayout(layoutData as PanelLayout);

        const { data: eqData } = await supabase
          .from('panel_equipment')
          .select('*')
          .eq('layout_id', layoutData.id)
          .order('sort_order');

        if (eqData) setPanelEquipmentList(eqData as PanelEquipment[]);

        const { data: itemData } = await supabase
          .from('panel_items')
          .select('*')
          .eq('layout_id', layoutData.id)
          .order('sort_order');

        if (itemData) setPanelItemList(itemData as PanelItem[]);
      });
  }, [storeId]);

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
        storeIngredientsMapRef.current = map;
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

  // 장비 상태 초기화: panel_equipment 기반으로 game_equipment_state 생성
  useEffect(() => {
    if (!sessionId || panelEquipmentList.length === 0) return;

    // 물리엔진 대상 장비만 필터 (burner→wok, sink→sink)
    const physicsEquipment = panelEquipmentList
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

          // panelEquipmentId → gameEquipmentStateId 매핑 구축
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
  }, [sessionId, panelEquipmentList, setEquipments]);

  // 세션 결과 오버레이 상태
  const [sessionResult, setSessionResult] = useState<{
    score: number;
    scoreEvents: GameScoreEvent[];
    feedbackText: string | null;
  } | null>(null);

  const handleSessionEnd = useCallback(async () => {
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

      // 8. 결과 오버레이 표시
      setSessionResult({
        score: currentScore,
        scoreEvents,
        feedbackText,
      });
    } catch (err) {
      console.error('[GamePage] handleSessionEnd 실패:', err);
      setSessionResult({
        score: useScoringStore.getState().currentScore,
        scoreEvents: useScoringStore.getState().scoreEvents,
        feedbackText: null,
      });
    }
  }, [sessionId, getRecipeName]);

  // 게임 자동 종료 감지
  const orders = useGameStore((s) => s.orders);
  const totalOrderCount = useGameStore((s) => s.totalOrderCount);
  const sessionEndTriggered = useRef(false);

  useEffect(() => {
    if (orders.length === 0) return;
    if (sessionEndTriggered.current) return;

    const completedCount = orders.filter((o) => o.status === 'completed').length;
    if (completedCount < totalOrderCount) return;

    sessionEndTriggered.current = true;
    handleSessionEnd();
  }, [orders, totalOrderCount, handleSessionEnd]);



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
                  label = storeIngredientsMapRef.current.get(item.ingredient_id)?.display_name ?? '';
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
                Array.from(storeIngredientsMapRef.current.entries()).map(([id, si]) => [id, si.display_name])
              )}
              wokContentsMap={wokContentsMap}
              placedContainers={placedContainers}
              hasSelection={!!selection}
              panelToStateIdMap={panelToStateIdMap}
              onSceneClick={handleSceneClick}
            >
              <BillQueue getRecipeName={getRecipeName} getRecipeNaturalText={getRecipeNaturalText} />
            </GameKitchenView>
          </div>
          {/* HUD: 좌측 상단 (선택 표시 + 핸드바) */}
          <div className={styles.topLeftHud}>
            <SelectionDisplay selection={selection} onDeselect={deselect} />
            <Handbar onIngredientToHandbar={(sel) => {
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
      {sessionResult && (
        <SessionResultOverlay
          score={sessionResult.score}
          scoreEvents={sessionResult.scoreEvents}
          feedbackText={sessionResult.feedbackText}
          onFeed={() => navigate('/feed')}
          onClose={() => navigate('/game/setup')}
        />
      )}
    </>
  );
};

export default GamePage;
