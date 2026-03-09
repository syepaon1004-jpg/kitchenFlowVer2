import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { useGameStore } from '../../stores/gameStore';
import { useUiStore } from '../../stores/uiStore';
import ContainerCard from './ContainerCard';
import type { Container, GameContainerInstance, RecipeStep, RecipeIngredient } from '../../types/db';
import styles from './RightSidebar.module.css';

interface Props {
  containersMap: Map<string, Container>;
  getRecipeName: (recipeId: string) => string;
  recipeSteps: RecipeStep[];
  getRecipeIngredients: (recipeId: string) => RecipeIngredient[];
}

export default function RightSidebar({ containersMap, getRecipeName, recipeSteps, getRecipeIngredients }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'right-sidebar' });
  const containerInstances = useGameStore((s) => s.containerInstances);
  const ingredientInstances = useGameStore((s) => s.ingredientInstances);
  const orders = useGameStore((s) => s.orders);
  const markContainerServed = useGameStore((s) => s.markContainerServed);
  const updateOrderStatus = useGameStore((s) => s.updateOrderStatus);

  const rightSidebarOpen = useUiStore((s) => s.rightSidebarOpen);
  const setRightSidebarOpen = useUiStore((s) => s.setRightSidebarOpen);
  const toggleRightSidebar = useUiStore((s) => s.toggleRightSidebar);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 사이드바 닫기
  useEffect(() => {
    if (!rightSidebarOpen) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setRightSidebarOpen(false);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [rightSidebarOpen, setRightSidebarOpen]);

  // 서빙된 컨테이너 제외
  const visibleContainers = useMemo(
    () => containerInstances.filter((c) => !c.is_served),
    [containerInstances],
  );

  // canServe: 해당 orderId의 모든 컨테이너가 is_complete === true
  const canServe = useCallback(
    (orderId: string): boolean => {
      const assigned = containerInstances.filter((c) => c.assigned_order_id === orderId);
      return assigned.length > 0 && assigned.every((c) => c.is_complete);
    },
    [containerInstances],
  );

  const handleServe = useCallback(
    (orderId: string) => {
      const assigned = containerInstances.filter((c) => c.assigned_order_id === orderId);
      for (const c of assigned) {
        markContainerServed(c.id);
      }
      updateOrderStatus(orderId, 'completed');
    },
    [containerInstances, markContainerServed, updateOrderStatus],
  );

  // 주문 라벨 맵
  const orderLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders) {
      map.set(order.id, `${getRecipeName(order.recipe_id)} #${order.order_sequence}`);
    }
    return map;
  }, [orders, getRecipeName]);

  // orderId → recipeId 맵
  const orderRecipeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const order of orders) {
      map.set(order.id, order.recipe_id);
    }
    return map;
  }, [orders]);

  // containerInstanceId → max plate_order 맵
  const containerMaxPlateOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const ing of ingredientInstances) {
      if (ing.container_instance_id && ing.plate_order !== null) {
        const current = map.get(ing.container_instance_id) ?? 0;
        if (ing.plate_order > current) {
          map.set(ing.container_instance_id, ing.plate_order);
        }
      }
    }
    return map;
  }, [ingredientInstances]);

  // `${recipeId}-${stepOrder}` → image_url 맵
  const recipeStepImageMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const step of recipeSteps) {
      map.set(`${step.recipe_id}-${step.step_order}`, step.image_url);
    }
    return map;
  }, [recipeSteps]);

  // 컨테이너 인스턴스의 표시 이미지 결정
  const getContainerImageUrl = useCallback(
    (ci: GameContainerInstance): string | null => {
      const container = containersMap.get(ci.container_id);

      if (!ci.assigned_order_id) {
        return container?.image_url ?? null;
      }

      const recipeId = orderRecipeMap.get(ci.assigned_order_id);
      if (!recipeId) return container?.image_url ?? null;

      const maxPlateOrder = containerMaxPlateOrder.get(ci.id) ?? 0;
      const stepImage = recipeStepImageMap.get(`${recipeId}-${maxPlateOrder}`);
      return stepImage ?? container?.image_url ?? null;
    },
    [containersMap, orderRecipeMap, containerMaxPlateOrder, recipeStepImageMap],
  );

  return (
    <div ref={wrapperRef} className={styles.rightSidebarWrapper}>
      <div
        ref={(node) => {
          sidebarRef.current = node;
          setNodeRef(node);
        }}
        className={`${styles.rightSidebar} ${rightSidebarOpen ? styles.open : ''}`}
      >
        <button
          id="right-sidebar-toggle"
          className={styles.toggleButton}
          onClick={toggleRightSidebar}
        >
          {rightSidebarOpen ? '>>' : '<<'}
        </button>
        <div
          className={styles.sidebarContent}
          style={isOver ? { outline: '2px solid #2196F3', outlineOffset: '-2px' } : undefined}
        >
          <div className={styles.header}>그릇</div>
          {visibleContainers.length === 0 ? (
            <div className={styles.empty}>그릇을 여기에 드롭하세요</div>
          ) : (
            <div className={styles.containerList}>
              {visibleContainers.map((ci) => (
                <ContainerCard
                  key={ci.id}
                  instance={ci}
                  container={containersMap.get(ci.container_id)}
                  imageUrl={getContainerImageUrl(ci)}
                  orderLabel={ci.assigned_order_id ? (orderLabelMap.get(ci.assigned_order_id) ?? null) : null}
                  showServeButton={!!ci.assigned_order_id && canServe(ci.assigned_order_id)}
                  onServe={() => ci.assigned_order_id && handleServe(ci.assigned_order_id)}
                  orders={orders}
                  getRecipeIngredients={getRecipeIngredients}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
