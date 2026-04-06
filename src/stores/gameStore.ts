import { create } from 'zustand';
import type { GameIngredientInstance, GameContainerInstance, GameOrder, StoreIngredient, ActionType } from '../types/db';

interface GameState {
  sessionId: string | null;
  storeId: string | null;
  activeRecipeIds: string[];
  orders: GameOrder[];
  ingredientInstances: GameIngredientInstance[];
  containerInstances: GameContainerInstance[];
  storeIngredientsMap: Map<string, StoreIngredient>;
  waterIngredientIds: Set<string>;
  mixing_container_ids: Set<string>;
  totalOrderCount: number;

  setTotalOrderCount: (count: number) => void;
  addMixing: (id: string) => void;
  removeMixing: (id: string) => void;
  tickMix: (containerId: string) => void;
  setSession: (sessionId: string, storeId: string) => void;
  addOrder: (order: GameOrder) => void;
  addIngredientInstance: (instance: GameIngredientInstance) => void;
  incrementIngredientQuantity: (instanceId: string, amount: number) => void;
  decrementIngredientQuantity: (instanceId: string, amount: number) => void;
  moveIngredient: (instanceId: string, updates: Partial<GameIngredientInstance>) => void;
  bulkMoveIngredients: (instanceIds: string[], updates: Partial<GameIngredientInstance>) => void;
  moveContainer: (instanceId: string, updates: Partial<GameContainerInstance>) => void;
  addContainerInstance: (instance: GameContainerInstance) => void;
  assignOrderToContainer: (containerInstanceId: string, orderId: string) => void;
  markContainerComplete: (containerInstanceId: string) => void;
  markContainerServed: (containerInstanceId: string) => void;
  incrementContainerPlateOrder: (containerInstanceId: string) => number;
  setContainerDirty: (containerInstanceId: string) => void;
  removeContainerInstance: (containerInstanceId: string) => void;
  setOrders: (orders: GameOrder[]) => void;
  updateOrderStatus: (orderId: string, status: GameOrder['status']) => void;
  setActiveRecipeIds: (ids: string[]) => void;
  setStoreIngredientsMap: (map: Map<string, StoreIngredient>) => void;
  setWaterIngredientIds: (ids: Set<string>) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set, get) => ({
  sessionId: null,
  storeId: null,
  activeRecipeIds: [],
  orders: [],
  ingredientInstances: [],
  containerInstances: [],
  storeIngredientsMap: new Map(),
  totalOrderCount: 10,

  setTotalOrderCount: (count) => set({ totalOrderCount: count }),
  setSession: (sessionId, storeId) => set({ sessionId, storeId }),
  setActiveRecipeIds: (ids) => set({ activeRecipeIds: ids }),
  addOrder: (order) => set((s) => ({ orders: [...s.orders, order] })),
  addIngredientInstance: (instance) =>
    set((s) => ({ ingredientInstances: [...s.ingredientInstances, instance] })),
  incrementIngredientQuantity: (instanceId, amount) =>
    set((s) => ({
      ingredientInstances: s.ingredientInstances.map((i) =>
        i.id === instanceId ? { ...i, quantity: i.quantity + amount } : i
      ),
    })),
  decrementIngredientQuantity: (instanceId, amount) =>
    set((s) => ({
      ingredientInstances: s.ingredientInstances
        .map((i) => (i.id === instanceId ? { ...i, quantity: i.quantity - amount } : i))
        .filter((i) => i.quantity > 0),
    })),
  moveIngredient: (instanceId, updates) =>
    set((s) => ({
      ingredientInstances: s.ingredientInstances.map((i) =>
        i.id === instanceId ? { ...i, ...updates } : i
      ),
    })),
  bulkMoveIngredients: (instanceIds, updates) => {
    const idSet = new Set(instanceIds);
    set((s) => ({
      ingredientInstances: s.ingredientInstances.map((i) =>
        idSet.has(i.id) ? { ...i, ...updates } : i
      ),
    }));
  },
  moveContainer: (instanceId, updates) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === instanceId ? { ...c, ...updates } : c
      ),
    })),
  addContainerInstance: (instance) =>
    set((s) => ({ containerInstances: [...s.containerInstances, instance] })),
  assignOrderToContainer: (containerInstanceId, orderId) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === containerInstanceId ? { ...c, assigned_order_id: orderId } : c
      ),
    })),
  markContainerComplete: (containerInstanceId) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === containerInstanceId ? { ...c, is_complete: true } : c
      ),
    })),
  markContainerServed: (containerInstanceId) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === containerInstanceId ? { ...c, is_served: true } : c
      ),
    })),
  incrementContainerPlateOrder: (containerInstanceId) => {
    let newPlateOrder = 0;
    set((s) => ({
      containerInstances: s.containerInstances.map((c) => {
        if (c.id === containerInstanceId) {
          newPlateOrder = c.current_plate_order + 1;
          return { ...c, current_plate_order: newPlateOrder };
        }
        return c;
      }),
    }));
    return newPlateOrder;
  },
  setContainerDirty: (containerInstanceId) =>
    set((s) => ({
      containerInstances: s.containerInstances.map((c) =>
        c.id === containerInstanceId ? { ...c, is_dirty: true } : c
      ),
    })),
  removeContainerInstance: (containerInstanceId) =>
    set((s) => ({
      containerInstances: s.containerInstances.filter((c) => c.id !== containerInstanceId),
    })),
  setOrders: (orders) => set({ orders }),
  updateOrderStatus: (orderId, status) =>
    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status,
              completed_at:
                status === 'completed' || status === 'failed'
                  ? new Date().toISOString()
                  : o.completed_at,
            }
          : o,
      ),
    })),
  setStoreIngredientsMap: (map) => set({ storeIngredientsMap: map }),
  waterIngredientIds: new Set(),
  setWaterIngredientIds: (ids) => set({ waterIngredientIds: ids }),

  mixing_container_ids: new Set<string>(),
  addMixing: (id) =>
    set((s) => {
      const next = new Set(s.mixing_container_ids);
      next.add(id);
      return { mixing_container_ids: next };
    }),
  removeMixing: (id) =>
    set((s) => {
      const next = new Set(s.mixing_container_ids);
      next.delete(id);
      return { mixing_container_ids: next };
    }),
  reset: () => set({
    sessionId: null,
    storeId: null,
    activeRecipeIds: [],
    orders: [],
    ingredientInstances: [],
    containerInstances: [],
    storeIngredientsMap: new Map(),
    waterIngredientIds: new Set(),
    mixing_container_ids: new Set(),
    totalOrderCount: 10,
  }),
  tickMix: (containerId) => {
    if (!get().mixing_container_ids.has(containerId)) return;

    set((s) => ({
      ingredientInstances: s.ingredientInstances.map((inst) => {
        if (inst.container_instance_id !== containerId || inst.location_type !== 'container') {
          return inst;
        }
        const existing = inst.action_history.find((h) => h.actionType === 'mix');
        const newHistory = existing
          ? inst.action_history.map((h) =>
              h.actionType === 'mix' ? { ...h, seconds: h.seconds + 1 } : h,
            )
          : [...inst.action_history, { actionType: 'mix' as ActionType, seconds: 1 }];
        return { ...inst, action_history: newHistory };
      }),
    }));
  },
}));
