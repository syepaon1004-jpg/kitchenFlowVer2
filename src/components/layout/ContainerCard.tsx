import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { useGameStore } from '../../stores/gameStore';
import { useScoringStore } from '../../stores/scoringStore';
import { useShallow } from 'zustand/react/shallow';
import { SCORE_CONFIG } from '../../lib/scoring/constants';
import RecipeErrorPopup from '../game/RecipeErrorPopup';
import type {
  Container,
  GameContainerInstance,
  GameOrder,
  RecipeIngredient,
} from '../../types/db';
import styles from './ContainerCard.module.css';

const MIX_INTERVAL = 100; // 100ms UI 게이지 갱신 간격

interface ContainerCardProps {
  instance: GameContainerInstance;
  container: Container | undefined;
  imageUrl: string | null;
  orderLabel: string | null;
  showServeButton: boolean;
  onServe: () => void;
  orders: GameOrder[];
  getRecipeIngredients: (recipeId: string) => RecipeIngredient[];
}

export default function ContainerCard({
  instance,
  container,
  imageUrl,
  orderLabel,
  showServeButton,
  onServe,
  orders,
  getRecipeIngredients,
}: ContainerCardProps) {
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: `container-instance-${instance.id}`,
    disabled: instance.is_dirty,
  });

  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const storeIngredientsMap = useGameStore((s) => s.storeIngredientsMap);
  const addMixing = useGameStore((s) => s.addMixing);
  const removeMixing = useGameStore((s) => s.removeMixing);
  const isMixing = useGameStore((s) => s.mixing_container_ids.has(instance.id));

  // 오류 구독: 해당 order_id의 오류만 필터
  const orderErrors = useScoringStore(
    useShallow(
      (s) => s.recipeErrors.filter((e) => e.order_id === instance.assigned_order_id),
    ),
  );
  const hasErrors = orderErrors.length > 0;

  // 오류 팝업 표시 상태
  const [showErrorPopup, setShowErrorPopup] = useState(false);

  // mix 진행률 (로컬 state — UI 게이지 전용)
  const [mixProgress, setMixProgress] = useState(0);
  const mixTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 볼 안 재료 목록
  const containerIngredients = useMemo(
    () =>
      ingredientInstances.filter(
        (i) => i.container_instance_id === instance.id && i.location_type === 'container',
      ),
    [ingredientInstances, instance.id],
  );

  // mix 대상 recipe_ingredients 조회
  const mixRecipeIngredients = useMemo(() => {
    if (!instance.assigned_order_id) return [];
    const order = orders.find((o) => o.id === instance.assigned_order_id);
    if (!order) return [];
    const allRi = getRecipeIngredients(order.recipe_id);
    return allRi.filter((ri) => ri.required_action_type === 'mix');
  }, [instance.assigned_order_id, orders, getRecipeIngredients]);

  // bowl 타입만 섞기 가능
  const isBowl = container?.container_type === 'bowl';

  // mix 재료가 없는 레시피면 버튼 숨김 (bowl이 아니면 항상 false)
  const hasMixIngredients = isBowl && mixRecipeIngredients.length > 0;

  // mix 대상 재료가 볼 안에 tolerance 범위 내 수량으로 있는지 확인
  // evaluateContainer(evaluate.ts)와 동일한 quantity ± quantity_tolerance 기준
  const allMixIngredientsPresent = useMemo(() => {
    if (!hasMixIngredients) return false;
    // 같은 ingredient_id의 quantity를 합산
    const qtyMap = new Map<string, number>();
    for (const i of containerIngredients) {
      qtyMap.set(i.ingredient_id, (qtyMap.get(i.ingredient_id) ?? 0) + i.quantity);
    }
    return mixRecipeIngredients.every((ri) => {
      const qty = qtyMap.get(ri.ingredient_id) ?? 0;
      const qtyMin = ri.quantity * (1 - ri.quantity_tolerance);
      const qtyMax = ri.quantity * (1 + ri.quantity_tolerance);
      return qty >= qtyMin && qty <= qtyMax;
    });
  }, [hasMixIngredients, mixRecipeIngredients, containerIngredients]);

  // 완료 여부: 모든 mix 대상 재료의 action_history.mix.seconds >= required_duration_min
  const isMixDone = useMemo(() => {
    if (!hasMixIngredients || !allMixIngredientsPresent) return false;
    return mixRecipeIngredients.every((ri) => {
      const inst = containerIngredients.find((i) => i.ingredient_id === ri.ingredient_id);
      if (!inst) return false;
      const mixEntry = inst.action_history.find((h) => h.actionType === 'mix');
      if (!mixEntry) return false;
      const minSeconds = ri.required_duration_min ?? 1;
      return mixEntry.seconds >= minSeconds;
    });
  }, [hasMixIngredients, allMixIngredientsPresent, mixRecipeIngredients, containerIngredients]);

  // UI 게이지 목표 시간 (recipe의 required_duration_min 기반)
  const mixTargetSeconds = useMemo(() => {
    if (mixRecipeIngredients.length === 0) return 5;
    return mixRecipeIngredients[0].required_duration_min ?? 5;
  }, [mixRecipeIngredients]);

  const { setNodeRef: dragRef, listeners, attributes } = useDraggable({
    id: `container-drag-${instance.id}`,
    data: {
      type: 'container' as const,
      containerId: instance.container_id,
      containerInstanceId: instance.id,
    },
    disabled: !(isMixDone || instance.is_dirty),
  });

  const canMix = hasMixIngredients && allMixIngredientsPresent && !isMixDone && !instance.is_complete && !instance.is_dirty;

  // 홀드 중단
  const stopMix = useCallback(() => {
    if (mixTimerRef.current) {
      clearInterval(mixTimerRef.current);
      mixTimerRef.current = null;
    }
    setMixProgress(0);
    removeMixing(instance.id);
  }, [instance.id, removeMixing]);

  // 홀드 시작
  const startMix = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!canMix) return;

      addMixing(instance.id);

      let elapsed = 0;
      mixTimerRef.current = setInterval(() => {
        elapsed += MIX_INTERVAL;
        setMixProgress(elapsed);
      }, MIX_INTERVAL);
    },
    [canMix, instance.id, addMixing],
  );

  // 버리기 실행
  const handleDispose = useCallback(() => {
    const { ingredientInstances: allIngs, moveIngredient, removeContainerInstance, updateOrderStatus } =
      useGameStore.getState();
    const { addScoreEvent, addActionLog } = useScoringStore.getState();
    const sessionId = useGameStore.getState().sessionId;

    // 1. 그릇 내 모든 재료 → location_type = 'disposed'
    const containerIngs = allIngs.filter(
      (i) => i.container_instance_id === instance.id && i.location_type === 'container',
    );
    for (const ing of containerIngs) {
      moveIngredient(ing.id, { location_type: 'disposed' });
    }

    // 2. container_instance 삭제
    removeContainerInstance(instance.id);

    // 3. 해당 주문의 다른 그릇이 남아있는지 확인 → 없으면 failed
    if (instance.assigned_order_id) {
      const remaining = useGameStore.getState().containerInstances.filter(
        (c) => c.assigned_order_id === instance.assigned_order_id,
      );
      if (remaining.length === 0) {
        updateOrderStatus(instance.assigned_order_id, 'failed');
      }
    }

    // 4. 감점: SCORE_DISPOSE (-2)
    addScoreEvent({
      session_id: sessionId!,
      event_type: 'dispose',
      points: SCORE_CONFIG.DISPOSE,
      timestamp_ms: Date.now(),
      metadata: { container_instance_id: instance.id, order_id: instance.assigned_order_id },
    });

    // 5. 액션 로그: dispose
    addActionLog({
      session_id: sessionId!,
      action_type: 'dispose',
      timestamp_ms: Date.now(),
      metadata: { container_instance_id: instance.id, order_id: instance.assigned_order_id },
    });

    // 6. recipeResult 기록 (실패)
    if (instance.assigned_order_id) {
      const order = orders.find((o) => o.id === instance.assigned_order_id);
      if (order) {
        const { addRecipeResult } = useScoringStore.getState();
        addRecipeResult({
          session_id: sessionId!,
          order_id: instance.assigned_order_id,
          recipe_id: order.recipe_id,
          is_success: false,
          error_count: orderErrors.length,
          serve_time_ms: null,
          created_at: new Date().toISOString(),
        });
      }
    }

    setShowErrorPopup(false);
  }, [instance.id, instance.assigned_order_id, orders, orderErrors.length]);

  // isMixDone이 true가 되면 자동 정지
  useEffect(() => {
    if (isMixDone && isMixing) {
      stopMix();
    }
  }, [isMixDone, isMixing, stopMix]);

  // 컴포넌트 unmount 시 클린업
  useEffect(() => {
    return () => {
      if (mixTimerRef.current) {
        clearInterval(mixTimerRef.current);
      }
      removeMixing(instance.id);
    };
  }, [instance.id, removeMixing]);

  return (
    <div
      ref={(node) => {
        dropRef(node);
        dragRef(node);
      }}
      {...listeners}
      {...attributes}
      className={`${styles.containerCard} ${instance.is_complete ? styles.complete : ''} ${hasErrors && !instance.is_complete ? styles.hasError : ''} ${instance.is_dirty ? styles.dirtyState : ''}`}
      style={{
        ...(isOver ? { outline: '2px solid var(--color-primary)', outlineOffset: '-2px' } : {}),
        ...((isMixDone || instance.is_dirty) ? { cursor: 'grab', touchAction: 'none' } : {}),
      }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={container?.name ?? '그릇'}
          className={styles.containerImage}
          draggable={false}
        />
      ) : (
        <div className={styles.containerPlaceholder}>
          {container?.name ?? '그릇'}
        </div>
      )}
      {orderLabel && <div className={styles.orderLabel}>{orderLabel}</div>}
      {instance.is_complete && <div className={styles.completeBadge}>완성</div>}
      {!instance.is_complete && hasErrors && (
        <div className={styles.errorBadge} onClick={() => setShowErrorPopup(true)}>
          잘못 조리됨 ({orderErrors.length})
        </div>
      )}
      {showErrorPopup && (
        <RecipeErrorPopup
          errors={orderErrors}
          storeIngredientsMap={storeIngredientsMap}
          onDispose={handleDispose}
          onClose={() => setShowErrorPopup(false)}
        />
      )}
      {instance.is_dirty && (
        <div className={styles.dirtyLabel}>세척 필요</div>
      )}

      {/* 그릇 안 재료 목록 */}
      {containerIngredients.length > 0 && (
        <ul className={styles.ingredientList}>
          {containerIngredients.map((inst) => {
            const si = storeIngredientsMap.get(inst.ingredient_id);
            return (
              <li key={inst.id} className={styles.ingredientItem}>
                {si?.display_name ?? '재료'} {inst.quantity}{si?.unit ?? ''}
              </li>
            );
          })}
        </ul>
      )}

      {/* 섞기 버튼: mix 재료가 있는 레시피만 표시 (dirty면 숨김) */}
      {hasMixIngredients && !instance.is_complete && !instance.is_dirty && (
        isMixDone ? (
          <div className={styles.mixDoneBadge}>섞기 완료</div>
        ) : (
          <button
            onPointerDown={startMix}
            onPointerUp={stopMix}
            onPointerLeave={stopMix}
            disabled={!canMix}
            className={styles.mixBtn}
            style={{
              background: isMixing ? '#5c2d91' : canMix ? 'var(--color-mix)' : '#ccc',
              cursor: canMix ? 'pointer' : 'not-allowed',
            }}
          >
            <div
              className={styles.progressBar}
              style={{
                width: `${Math.min((mixProgress / (mixTargetSeconds * 1000)) * 100, 100)}%`,
                transition: `width ${MIX_INTERVAL}ms linear`,
              }}
            />
            <span className={styles.progressLabel}>
              {isMixing
                ? `섞는 중 ${Math.min(Math.round((mixProgress / (mixTargetSeconds * 1000)) * 100), 100)}%`
                : '섞기 (꾹 누르기)'}
            </span>
          </button>
        )
      )}

      {showServeButton && (
        <button className={styles.serveButton} onClick={onServe}>
          서빙
        </button>
      )}
    </div>
  );
}
