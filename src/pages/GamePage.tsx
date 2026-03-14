import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, type DragStartEvent, type DragMoveEvent, type DragEndEvent } from '@dnd-kit/core';
import { polygonCollision } from '../lib/hitbox/collision';
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
  RecipeStep,
  GameIngredientInstance,
  GameContainerInstance,
  GameEquipmentState,
  GameOrder,
  GameScoreEvent,
  EquipmentType,
} from '../types/db';
import type { DragMeta } from '../types/game';
import BillQueue from '../components/layout/BillQueue';
import LeftSidebar from '../components/layout/LeftSidebar';
import MainViewport from '../components/layout/MainViewport';
import RightSidebar from '../components/layout/RightSidebar';
import Handbar from '../components/layout/Handbar';
import GameHeader from '../components/game/GameHeader';
import SessionResultOverlay from '../components/game/SessionResultOverlay';
import OrderSelectModal from '../components/ui/OrderSelectModal';
import QuantityInputModal from '../components/ui/QuantityInputModal';
import '../styles/gameVariables.css';
import styles from './GamePage.module.css';

/** equipment- 접두사에서 equipmentStateId를 추출하는 헬퍼 */
function extractEquipmentId(dropId: string): string | null {
  const prefixes = ['equipment-wok-', 'equipment-basket-', 'equipment-mw-', 'equipment-sink-'];
  for (const prefix of prefixes) {
    if (dropId.startsWith(prefix)) {
      return dropId.slice(prefix.length);
    }
  }
  return null;
}

function isEquipmentDrop(dropId: string): boolean {
  return (
    dropId.startsWith('equipment-wok-') ||
    dropId.startsWith('equipment-basket-') ||
    dropId.startsWith('equipment-mw-')
  );
}

const GamePage = () => {
  const navigate = useNavigate();
  const selectedStore = useAuthStore((s) => s.selectedStore)!;
  const storeId = useGameStore((s) => s.storeId) ?? selectedStore.id;
  const sessionId = useGameStore((s) => s.sessionId);
  const addActionLog = useScoringStore((s) => s.addActionLog);
  const addIngredientInstance = useGameStore((s) => s.addIngredientInstance);
  const incrementIngredientQuantity = useGameStore((s) => s.incrementIngredientQuantity);
  const moveIngredient = useGameStore((s) => s.moveIngredient);
  const addContainerInstance = useGameStore((s) => s.addContainerInstance);
  const incrementContainerPlateOrder = useGameStore((s) => s.incrementContainerPlateOrder);
  const removeContainerInstance = useGameStore((s) => s.removeContainerInstance);
  const setContainerDirty = useGameStore((s) => s.setContainerDirty);
  const openOrderSelectModal = useUiStore((s) => s.openOrderSelectModal);
  const openQuantityModal = useUiStore((s) => s.openQuantityModal);
  const billQueueAreas = useUiStore((s) => s.billQueueAreas);
  const setEquipments = useEquipmentStore((s) => s.setEquipments);
  const updateEquipment = useEquipmentStore((s) => s.updateEquipment);
  const setWokAtSink = useEquipmentStore((s) => s.setWokAtSink);
  const clearWokAtSink = useEquipmentStore((s) => s.clearWokAtSink);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const setOrders = useGameStore((s) => s.setOrders);

  // 물리엔진 tick 활성화
  useGameTick();

  // 주문 자동 생성
  useOrderGenerator();

  // 레시피 판별
  const { loadRecipes, evaluateAll, getRecipeName, getRecipeIngredients, getRecipeNaturalText, getRecipeTargetContainerId } = useRecipeEval(storeId);

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

  // store_ingredients + containers 1회 로딩 캐시
  const storeIngredientsMapRef = useRef<Map<string, StoreIngredient>>(new Map());
  const [containersMap, setContainersMap] = useState<Map<string, Container>>(new Map());
  const [recipeSteps, setRecipeSteps] = useState<RecipeStep[]>([]);

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

    // recipe_steps 로딩
    supabase
      .from('recipe_steps')
      .select('*')
      .eq('store_id', storeId)
      .then(({ data }) => {
        if (data) setRecipeSteps(data as RecipeStep[]);
      });
  }, [storeId]);

  // 장비 상태 초기화: area_definitions의 equipment 히트박스 기준으로 game_equipment_state 생성
  useEffect(() => {
    if (!sessionId || !storeId) return;

    supabase
      .from('area_definitions')
      .select('equipment_type, equipment_index')
      .eq('store_id', storeId)
      .eq('area_type', 'equipment')
      .then(async ({ data: areas }) => {
        if (!areas || areas.length === 0) return;

        // 중복 제거
        const uniqueMap = new Map<string, { equipment_type: EquipmentType; equipment_index: number }>();
        for (const a of areas) {
          if (a.equipment_type && a.equipment_index !== null) {
            const key = `${a.equipment_type}-${a.equipment_index}`;
            uniqueMap.set(key, {
              equipment_type: a.equipment_type as EquipmentType,
              equipment_index: a.equipment_index as number,
            });
          }
        }

        const upsertRows = Array.from(uniqueMap.values()).map((eq) => {
          const base = {
            session_id: sessionId,
            equipment_type: eq.equipment_type,
            equipment_index: eq.equipment_index,
          };

          switch (eq.equipment_type) {
            case 'wok':
              return { ...base, wok_status: 'clean', wok_temp: 25, burner_level: 0 };
            case 'frying_basket':
              return { ...base, basket_status: 'up' };
            case 'microwave':
              return { ...base, mw_status: 'idle', mw_remaining_sec: 0 };
            default:
              return base;
          }
        });

        const { data: result, error } = await supabase
          .from('game_equipment_state')
          .upsert(upsertRows, { onConflict: 'session_id,equipment_type,equipment_index' })
          .select('*');

        if (!error && result) {
          setEquipments(result as GameEquipmentState[]);
        } else if (error) {
          console.error('[Phase4] equipment init error:', error);
        }
      });
  }, [storeId, sessionId, setEquipments]);

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

  // 드래그 상태 (DragOverlay용)
  const [dragImageUrl, setDragImageUrl] = useState<string | null>(null);
  const [dragImageSize, setDragImageSize] = useState<{ width: number; height: number } | null>(null);
  const [activeDragLabel, setActiveDragLabel] = useState<string | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as DragMeta;
      if (!data) return;

      // 드래그 원본 크기 저장 — initialRect 우선, 없으면 activatorEvent.target에서 fallback
      const initialRect = event.active.rect.current.initial;
      let size: { width: number; height: number } | null = null;
      if (initialRect) {
        size = { width: initialRect.width, height: initialRect.height };
      } else {
        const target = event.activatorEvent.target;
        if (target instanceof HTMLElement) {
          const bcr = target.getBoundingClientRect();
          size = { width: bcr.width, height: bcr.height };
        }
      }
      setDragImageSize(size);

      // 드래그 이미지 우선순위: drag_image_url → store_ingredients.image_url → 텍스트
      const dragImg = data.dragImageUrl ?? null;
      if (dragImg) {
        setDragImageUrl(dragImg);
        setActiveDragLabel(null);
      } else if (data.type === 'ingredient' && data.ingredientId) {
        const si = storeIngredientsMapRef.current.get(data.ingredientId);
        if (si?.image_url) {
          setDragImageUrl(si.image_url);
          setActiveDragLabel(null);
        } else {
          setDragImageUrl(null);
          setActiveDragLabel(si?.display_name ?? '재료');
        }
      } else if (data.type === 'container' && data.containerId) {
        const c = containersMap.get(data.containerId);
        if (c?.image_url) {
          setDragImageUrl(c.image_url);
          setActiveDragLabel(null);
        } else {
          setDragImageUrl(null);
          setActiveDragLabel(c?.name ?? '그릇');
        }
      } else if (data.type === 'equipment') {
        setDragImageUrl(null);
        setActiveDragLabel(data.equipmentType === 'wok' ? 'Wok' : data.equipmentType === 'frying_basket' ? '튀김채' : data.equipmentType ?? '장비');
      } else {
        setDragImageUrl(null);
        setActiveDragLabel(null);
      }

      if (sessionId) {
        addActionLog({
          session_id: sessionId,
          action_type: 'drag_start',
          timestamp_ms: Date.now(),
          metadata: {
            drag_source_type: data.type,
            ingredient_id: data.ingredientId ?? null,
            container_id: data.containerId ?? null,
            equipment_type: data.equipmentType ?? null,
          },
        });
      }
    },
    [containersMap, sessionId, addActionLog],
  );

  const handleDragMove = useCallback(
    (_event: DragMoveEvent) => {
      // 시점 이동 및 사이드바 펼침은 MainViewport useDndMonitor에서 처리
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDragImageUrl(null);
      setDragImageSize(null);
      setActiveDragLabel(null);

      if (!sessionId) return;

      const { active, over } = event;
      if (!over) return;

      const dragData = active.data.current as DragMeta;
      if (!dragData) return;
      const dropId = over.id as string;

      // Case 1: ingredient → handbar
      if (dragData.type === 'ingredient' && dropId === 'handbar') {
        const ingredientId = dragData.ingredientId;
        if (!ingredientId) return;

        // 이미 hand에 있는 인스턴스를 다시 handbar에 드롭하면 무시
        if (dragData.ingredientInstanceId) return;

        const si = storeIngredientsMapRef.current.get(ingredientId);
        const unit = si?.unit;
        const defaultQty = si?.default_quantity ?? 1;
        const isActionUnit = unit === 'spoon' || unit === 'portion' || unit === 'pinch' || unit === 'handful' || unit === 'spatula';

        // 같은 재료가 이미 hand에 있는지 검색
        const existing = ingredientInstances.find(
          (i) => i.ingredient_id === ingredientId && i.location_type === 'hand',
        );

        const createOrIncrement = (qty: number) => {
          if (existing) {
            incrementIngredientQuantity(existing.id, qty);
          } else {
            const instance: GameIngredientInstance = {
              id: crypto.randomUUID(),
              session_id: sessionId,
              ingredient_id: ingredientId,
              quantity: qty,
              location_type: 'hand',
              zone_id: null,
              equipment_state_id: null,
              container_instance_id: null,
              action_history: [],
              plate_order: null,
            };
            addIngredientInstance(instance);
          }
        };

        if (isActionUnit) {
          createOrIncrement(1);
        } else {
          openQuantityModal(unit ?? 'ea', defaultQty, createOrIncrement);
        }
        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: 'handbar', ingredient_id: ingredientId },
        });
        return;
      }

      // Case 2: container → right-sidebar
      if (dragData.type === 'container' && dropId === 'right-sidebar') {
        const containerId = dragData.containerId;
        if (!containerId) return;

        const containerInstance: GameContainerInstance = {
          id: crypto.randomUUID(),
          session_id: sessionId,
          container_id: containerId,
          assigned_order_id: null,
          is_complete: false,
          is_served: false,
          current_plate_order: 0,
          is_dirty: false,
        };

        addContainerInstance(containerInstance);
        openOrderSelectModal(containerInstance.id);
        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: 'right-sidebar', container_id: containerId },
        });
        return;
      }

      // Case 3: ingredient → equipment (wok/basket/mw)
      if (dragData.type === 'ingredient' && isEquipmentDrop(dropId)) {
        const equipmentStateId = extractEquipmentId(dropId);
        if (!equipmentStateId) return;

        const equip = useEquipmentStore.getState().equipments.find((e) => e.id === equipmentStateId);
        if (!equip) return;

        // 웍 dirty/burned 차단
        if (
          equip.equipment_type === 'wok' &&
          (equip.wok_status === 'dirty' || equip.wok_status === 'burned')
        ) {
          return;
        }

        if (dragData.ingredientInstanceId) {
          // 기존 인스턴스 이동 (hand → equipment)
          moveIngredient(dragData.ingredientInstanceId, {
            location_type: 'equipment',
            equipment_state_id: equipmentStateId,
            zone_id: null,
            container_instance_id: null,
            plate_order: null,
          });
        } else {
          // 히트박스에서 직접 드롭: unit에 따라 분기
          const ingredientId = dragData.ingredientId;
          if (!ingredientId) return;

          const si = storeIngredientsMapRef.current.get(ingredientId);
          const unit = si?.unit;
          const defaultQty = si?.default_quantity ?? 1;
          const isActionUnit = unit === 'spoon' || unit === 'portion' || unit === 'pinch' || unit === 'handful' || unit === 'spatula';

          // 같은 재료가 이미 같은 장비에 있는지 검색
          const existing = ingredientInstances.find(
            (i) => i.ingredient_id === ingredientId
              && i.equipment_state_id === equipmentStateId
              && i.location_type === 'equipment',
          );

          const createOrIncrement = (qty: number) => {
            if (existing) {
              incrementIngredientQuantity(existing.id, qty);
            } else {
              const instance: GameIngredientInstance = {
                id: crypto.randomUUID(),
                session_id: sessionId,
                ingredient_id: ingredientId,
                quantity: qty,
                location_type: 'equipment',
                zone_id: null,
                equipment_state_id: equipmentStateId,
                container_instance_id: null,
                action_history: [],
                plate_order: null,
              };
              addIngredientInstance(instance);
            }
          };

          if (isActionUnit) {
            createOrIncrement(1);
          } else {
            openQuantityModal(unit ?? 'ea', defaultQty, createOrIncrement);
          }
        }
        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, ingredient_id: dragData.ingredientId, equipment_type: equip.equipment_type },
        });
        return;
      }

      // Case 3.5: ingredient → container-instance (재료 직접 그릇에 드롭)
      if (dragData.type === 'ingredient' && dropId.startsWith('container-instance-')) {
        const containerInstanceId = dropId.replace('container-instance-', '');

        // dirty 볼 차단
        const targetContainer = useGameStore.getState().containerInstances.find((c) => c.id === containerInstanceId);
        if (targetContainer?.is_dirty) {
          return;
        }

        const newPlateOrder = incrementContainerPlateOrder(containerInstanceId);

        if (dragData.ingredientInstanceId) {
          moveIngredient(dragData.ingredientInstanceId, {
            location_type: 'container',
            equipment_state_id: null,
            zone_id: null,
            container_instance_id: containerInstanceId,
            plate_order: newPlateOrder,
          });
        } else {
          // 히트박스에서 직접 드롭: unit에 따라 분기
          const ingredientId = dragData.ingredientId;
          if (!ingredientId) return;

          const si = storeIngredientsMapRef.current.get(ingredientId);
          const unit = si?.unit;
          const defaultQty = si?.default_quantity ?? 1;
          const isActionUnit = unit === 'spoon' || unit === 'portion' || unit === 'pinch' || unit === 'handful' || unit === 'spatula';

          // 같은 재료가 이미 같은 컨테이너에 있는지 검색
          const existing = ingredientInstances.find(
            (i) => i.ingredient_id === ingredientId
              && i.container_instance_id === containerInstanceId
              && i.location_type === 'container',
          );

          const createOrIncrement = (qty: number) => {
            if (existing) {
              incrementIngredientQuantity(existing.id, qty);
            } else {
              const instance: GameIngredientInstance = {
                id: crypto.randomUUID(),
                session_id: sessionId,
                ingredient_id: ingredientId,
                quantity: qty,
                location_type: 'container',
                zone_id: null,
                equipment_state_id: null,
                container_instance_id: containerInstanceId,
                action_history: [],
                plate_order: newPlateOrder,
              };
              addIngredientInstance(instance);
            }
          };

          if (isActionUnit) {
            createOrIncrement(1);
          } else {
            openQuantityModal(unit ?? 'ea', defaultQty, createOrIncrement);
          }
        }
        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, ingredient_id: dragData.ingredientId, container_instance_id: containerInstanceId },
        });
        return;
      }

      // Case 4: equipment → container-instance (웍/튀김채 내용물 → 그릇)
      if (dragData.type === 'equipment' && dropId.startsWith('container-instance-')) {
        const containerInstanceId = dropId.replace('container-instance-', '');
        const equipmentStateId = dragData.equipmentStateId;
        if (!equipmentStateId) return;

        const equip = useEquipmentStore.getState().equipments.find((e) => e.id === equipmentStateId);
        if (!equip) return;

        // 해당 equipment의 재료 전부 container로 이동
        const equipIngredients = useGameStore
          .getState()
          .ingredientInstances.filter(
            (i) => i.equipment_state_id === equipmentStateId && i.location_type === 'equipment',
          );

        // 내용물 없으면 invalid
        if (equipIngredients.length === 0) return;

        const newPlateOrder = incrementContainerPlateOrder(containerInstanceId);

        equipIngredients.forEach((inst) => {
          moveIngredient(inst.id, {
            location_type: 'container',
            equipment_state_id: null,
            zone_id: null,
            container_instance_id: containerInstanceId,
            plate_order: newPlateOrder,
          });
        });

        // 웍이면 dirty 전환
        if (equip.equipment_type === 'wok') {
          updateEquipment(equipmentStateId, { wok_status: 'dirty' });
        }

        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, equipment_id: equipmentStateId, container_instance_id: containerInstanceId },
        });
        return;
      }

      // Case 4.5: container → equipment (그릇 내용물 → 웍/튀김채)
      if (dragData.type === 'container' && dragData.containerInstanceId && isEquipmentDrop(dropId)) {
        const sourceContainerInstanceId = dragData.containerInstanceId;
        const equipmentStateId = extractEquipmentId(dropId);
        if (!equipmentStateId) return;

        const equip = useEquipmentStore.getState().equipments.find((e) => e.id === equipmentStateId);
        if (!equip) return;

        // 웍 dirty/burned 차단
        if (
          equip.equipment_type === 'wok' &&
          (equip.wok_status === 'dirty' || equip.wok_status === 'burned')
        ) {
          return;
        }

        const containerIngredients = useGameStore
          .getState()
          .ingredientInstances.filter(
            (i) => i.container_instance_id === sourceContainerInstanceId && i.location_type === 'container',
          );

        if (containerIngredients.length === 0) return;

        containerIngredients.forEach((inst) => {
          moveIngredient(inst.id, {
            location_type: 'equipment',
            equipment_state_id: equipmentStateId,
            zone_id: null,
            container_instance_id: null,
            plate_order: null,
          });
        });

        // 소스 볼 dirty 전환
        setContainerDirty(sourceContainerInstanceId);

        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, source_container_id: sourceContainerInstanceId },
        });
        return;
      }

      // Case 4.6: container → container-instance (그릇 → 다른 그릇)
      if (dragData.type === 'container' && dragData.containerInstanceId && dropId.startsWith('container-instance-')) {
        const sourceContainerInstanceId = dragData.containerInstanceId;
        const targetContainerInstanceId = dropId.replace('container-instance-', '');

        // self-drop 방지
        if (sourceContainerInstanceId === targetContainerInstanceId) return;

        const containerIngredients = useGameStore
          .getState()
          .ingredientInstances.filter(
            (i) => i.container_instance_id === sourceContainerInstanceId && i.location_type === 'container',
          );

        if (containerIngredients.length === 0) return;

        const newPlateOrder = incrementContainerPlateOrder(targetContainerInstanceId);

        containerIngredients.forEach((inst) => {
          moveIngredient(inst.id, {
            location_type: 'container',
            equipment_state_id: null,
            zone_id: null,
            container_instance_id: targetContainerInstanceId,
            plate_order: newPlateOrder,
          });
        });

        // 소스 볼 dirty 전환
        setContainerDirty(sourceContainerInstanceId);

        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, source_container_id: sourceContainerInstanceId },
        });
        return;
      }

      // Case 4.7: container → sink (빈 그릇 → 싱크대 제거)
      if (dragData.type === 'container' && dragData.containerInstanceId && dropId.startsWith('equipment-sink-')) {
        const sourceContainerInstanceId = dragData.containerInstanceId;

        const containerIngredients = useGameStore
          .getState()
          .ingredientInstances.filter(
            (i) => i.container_instance_id === sourceContainerInstanceId && i.location_type === 'container',
          );

        // 재료가 남아있으면 차단
        if (containerIngredients.length > 0) return;

        removeContainerInstance(sourceContainerInstanceId);
        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, container_instance_id: sourceContainerInstanceId },
        });
        return;
      }

      // Case 5: equipment(웍) → sink (웍을 씽크대로 이동)
      if (dragData.type === 'equipment' && dropId.startsWith('equipment-sink-')) {
        const sourceEquipId = dragData.equipmentStateId;
        if (!sourceEquipId) return;

        const sourceEquip = useEquipmentStore.getState().equipments.find((e) => e.id === sourceEquipId);
        if (!sourceEquip || sourceEquip.equipment_type !== 'wok') return;

        const sinkEquipId = dropId.replace('equipment-sink-', '');

        // 내용물 있으면 전부 disposed 처리
        const equipIngredients = useGameStore
          .getState()
          .ingredientInstances.filter(
            (i) => i.equipment_state_id === sourceEquipId && i.location_type === 'equipment',
          );
        equipIngredients.forEach((inst) => {
          moveIngredient(inst.id, {
            location_type: 'disposed',
            equipment_state_id: null,
            zone_id: null,
            container_instance_id: null,
            plate_order: null,
          });
        });

        // 웍을 씽크대로 이동
        setWokAtSink(sourceEquipId, sinkEquipId);
        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, equipment_id: sourceEquipId },
        });
        return;
      }

      // Case 6: equipment(웍 at sink) → wok-station (웍을 원래 자리로 복귀)
      if (dragData.type === 'equipment' && dropId.startsWith('wok-station-')) {
        const wokEquipId = dragData.equipmentStateId;
        if (!wokEquipId) return;

        clearWokAtSink(wokEquipId);
        addActionLog({
          session_id: sessionId,
          action_type: 'drop_success',
          timestamp_ms: Date.now(),
          metadata: { drop_target: dropId, equipment_id: wokEquipId },
        });
        return;
      }

      // 그 외: 무효 처리
    },
    [
      sessionId,
      addIngredientInstance,
      incrementIngredientQuantity,
      moveIngredient,
      addContainerInstance,
      incrementContainerPlateOrder,
      openOrderSelectModal,
      openQuantityModal,
      updateEquipment,
      setWokAtSink,
      clearWokAtSink,
      removeContainerInstance,
      setContainerDirty,
      ingredientInstances,
      addActionLog,
    ],
  );

  return (
    <>
      <DndContext
        collisionDetection={polygonCollision}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.gamePage}>
          <div className={styles.gameArea}>
            <GameHeader />
            <div className={styles.mainViewport}>
              <MainViewport getRecipeName={getRecipeName} getRecipeNaturalText={getRecipeNaturalText} />
            </div>
            {(!billQueueAreas || billQueueAreas.length === 0) && (
              <div className={styles.billQueue}>
                <BillQueue getRecipeName={getRecipeName} getRecipeNaturalText={getRecipeNaturalText} />
              </div>
            )}
            <div className={styles.leftSidebar}>
              <LeftSidebar />
            </div>
            <div className={styles.rightSidebar}>
              <RightSidebar containersMap={containersMap} getRecipeName={getRecipeName} recipeSteps={recipeSteps} getRecipeIngredients={getRecipeIngredients} getRecipeTargetContainerId={getRecipeTargetContainerId} />
            </div>
            <div className={styles.handbar}>
              <Handbar />
            </div>
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {dragImageUrl ? (
            <img
              src={dragImageUrl}
              alt="drag"
              className={styles.dragImage}
              style={{
                width: dragImageSize?.width ?? 48,
                height: dragImageSize?.height ?? 48,
                transform: `translateY(-${(dragImageSize?.height ?? 48) * 0.1}px)`,
              }}
            />
          ) : activeDragLabel ? (
            <div className={styles.dragLabel}>
              {activeDragLabel}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
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
