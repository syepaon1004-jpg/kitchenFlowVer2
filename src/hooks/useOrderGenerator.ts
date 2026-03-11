import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import type { GameOrder } from '../types/db';

const ORDER_INTERVAL_MS = 10_000;
const MAX_PENDING_ORDERS = 5;

export function useOrderGenerator() {
  const sessionId = useGameStore((s) => s.sessionId);
  const activeRecipeIds = useGameStore((s) => s.activeRecipeIds);
  const orders = useGameStore((s) => s.orders);
  const totalOrderCount = useGameStore((s) => s.totalOrderCount);
  const addOrder = useGameStore((s) => s.addOrder);

  // refs로 최신 값 참조 (인터벌 클로저 stale 방지)
  const ordersRef = useRef(orders);
  ordersRef.current = orders;

  const totalOrderCountRef = useRef(totalOrderCount);
  totalOrderCountRef.current = totalOrderCount;

  const activeRecipeIdsRef = useRef(activeRecipeIds);
  activeRecipeIdsRef.current = activeRecipeIds;

  useEffect(() => {
    if (!sessionId || activeRecipeIds.length === 0) return;

    const interval = setInterval(() => {
      const currentOrders = ordersRef.current;
      const currentRecipeIds = activeRecipeIdsRef.current;
      if (currentRecipeIds.length === 0) return;

      // 총 주문 수 도달 → 생성 중단
      if (currentOrders.length >= totalOrderCountRef.current) return;

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
