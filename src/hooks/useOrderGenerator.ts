import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import type { GameOrder } from '../types/db';

const ORDER_INTERVAL_MS = 10_000;
const MAX_PENDING_ORDERS = 5;

export function useOrderGenerator() {
  const sessionId = useGameStore((s) => s.sessionId);
  const activeRecipeIds = useGameStore((s) => s.activeRecipeIds);
  const orders = useGameStore((s) => s.orders);
  const addOrder = useGameStore((s) => s.addOrder);

  // refs로 최신 값 참조 (인터벌 클로저 stale 방지)
  const ordersRef = useRef(orders);
  const activeRecipeIdsRef = useRef(activeRecipeIds);

  // ref sync — render 직후 최신 값으로 갱신
  useEffect(() => {
    ordersRef.current = orders;
    activeRecipeIdsRef.current = activeRecipeIds;
  });

  useEffect(() => {
    if (!sessionId || activeRecipeIds.length === 0) return;

    const interval = setInterval(() => {
      const currentOrders = ordersRef.current;
      const currentRecipeIds = activeRecipeIdsRef.current;
      if (currentRecipeIds.length === 0) return;

      // 설정한 총 주문 수에 도달했으면 더 이상 생성하지 않음
      const totalOrderCount = useGameStore.getState().totalOrderCount;
      if (totalOrderCount > 0 && currentOrders.length >= totalOrderCount) return;

      const pendingCount = currentOrders.filter(
        (o) => o.status !== 'completed' && o.status !== 'failed',
      ).length;
      if (pendingCount >= MAX_PENDING_ORDERS) return;

      const recipeId =
        currentRecipeIds[Math.floor(Math.random() * currentRecipeIds.length)];

      const newOrder: GameOrder = {
        id: crypto.randomUUID(),
        session_id: sessionId,
        recipe_id: recipeId,
        order_sequence: currentOrders.length + 1,
        status: 'pending',
        created_at: new Date().toISOString(),
        completed_at: null,
      };

      addOrder(newOrder);
    }, ORDER_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [sessionId, activeRecipeIds, addOrder]);
}
