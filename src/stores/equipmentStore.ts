import { create } from 'zustand';
import type { GameEquipmentState, ActionType } from '../types/db';
import { tickWokPhysics, canAccumulateStir } from '../lib/physics/wok';
import { canAccumulateFry } from '../lib/physics/fryingBasket';
import { tickMicrowavePhysics, canAccumulateMicrowave } from '../lib/physics/microwave';
import { useGameStore } from './gameStore';
import { useScoringStore } from './scoringStore';
import { SCORE_CONFIG } from '../lib/scoring/constants';

/** action_history에 1초 추가 (기존 entry 있으면 +1, 없으면 새 entry) */
function appendActionHistory(instanceId: string, actionType: ActionType) {
  const { ingredientInstances, moveIngredient } = useGameStore.getState();
  const inst = ingredientInstances.find((i) => i.id === instanceId);
  if (!inst) return;

  const existing = inst.action_history.find((h) => h.actionType === actionType);
  const newHistory = existing
    ? inst.action_history.map((h) =>
        h.actionType === actionType ? { ...h, seconds: h.seconds + 1 } : h,
      )
    : [...inst.action_history, { actionType, seconds: 1 }];

  moveIngredient(instanceId, { action_history: newHistory });
}

interface EquipmentStoreState {
  equipments: GameEquipmentState[];
  washing_equipment_ids: Set<string>;
  stirring_equipment_ids: Set<string>;
  wok_at_sink: Map<string, string>; // wokEquipId → sinkEquipId
  setEquipments: (equipments: GameEquipmentState[]) => void;
  updateEquipment: (id: string, updates: Partial<GameEquipmentState>) => void;
  addWashing: (id: string) => void;
  removeWashing: (id: string) => void;
  addStirring: (id: string) => void;
  removeStirring: (id: string) => void;
  setWokAtSink: (wokId: string, sinkId: string) => void;
  clearWokAtSink: (wokId: string) => void;
  tickWok: (id: string) => void;
  tickBasket: (id: string) => void;
  tickMicrowave: (id: string) => void;
}

export const useEquipmentStore = create<EquipmentStoreState>((set, get) => ({
  equipments: [],
  washing_equipment_ids: new Set<string>(),
  stirring_equipment_ids: new Set<string>(),
  wok_at_sink: new Map<string, string>(),

  setEquipments: (equipments) => set({ equipments }),

  updateEquipment: (id, updates) =>
    set((s) => ({
      equipments: s.equipments.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  addWashing: (id) =>
    set((s) => {
      const next = new Set(s.washing_equipment_ids);
      next.add(id);
      return { washing_equipment_ids: next };
    }),

  removeWashing: (id) =>
    set((s) => {
      const next = new Set(s.washing_equipment_ids);
      next.delete(id);
      return { washing_equipment_ids: next };
    }),

  addStirring: (id) =>
    set((s) => {
      const next = new Set(s.stirring_equipment_ids);
      next.add(id);
      return { stirring_equipment_ids: next };
    }),

  removeStirring: (id) =>
    set((s) => {
      const next = new Set(s.stirring_equipment_ids);
      next.delete(id);
      return { stirring_equipment_ids: next };
    }),

  setWokAtSink: (wokId, sinkId) =>
    set((s) => {
      const next = new Map(s.wok_at_sink);
      next.set(wokId, sinkId);
      return { wok_at_sink: next };
    }),

  clearWokAtSink: (wokId) =>
    set((s) => {
      const next = new Map(s.wok_at_sink);
      next.delete(wokId);
      return { wok_at_sink: next };
    }),

  tickWok: (id) => {
    const equip = get().equipments.find((e) => e.id === id);
    if (!equip || equip.equipment_type !== 'wok') return;
    if (equip.wok_temp === null || equip.wok_status === null || equip.burner_level === null) return;

    // 웍 안 재료 조회 + 물 판별
    const { ingredientInstances, waterIngredientIds } = useGameStore.getState();
    const wokIngredients = ingredientInstances.filter(
      (i) => i.equipment_state_id === id && i.location_type === 'equipment',
    );
    const hasWater = wokIngredients.some((i) => waterIngredientIds.has(i.ingredient_id));

    const prevStatus = equip.wok_status;
    const result = tickWokPhysics({
      wok_temp: equip.wok_temp,
      wok_status: equip.wok_status,
      burner_level: equip.burner_level,
      hasWater,
    });

    // burned 전이 순간 1회만 감점
    if (prevStatus !== 'burned' && result.wok_status === 'burned') {
      const sessionId = useGameStore.getState().sessionId;
      if (sessionId) {
        const { addScoreEvent, addActionLog } = useScoringStore.getState();
        addScoreEvent({
          session_id: sessionId,
          event_type: 'wok_burned',
          points: SCORE_CONFIG.WOK_BURNED,
          timestamp_ms: Date.now(),
          metadata: { equipment_id: id },
        });
        addActionLog({
          session_id: sessionId,
          action_type: 'wok_burned',
          timestamp_ms: Date.now(),
          metadata: { equipment_id: id },
        });
      }
    }

    set((s) => ({
      equipments: s.equipments.map((e) =>
        e.id === id ? { ...e, wok_temp: result.wok_temp, wok_status: result.wok_status } : e,
      ),
    }));

    if (hasWater) {
      // 물 모드: 100도이면 모든 재료에 boil 자동 누적, stir 건너뜀
      if (result.wok_temp === 100) {
        for (const inst of wokIngredients) {
          appendActionHistory(inst.id, 'boil');
        }
      }
    } else {
      // stir 누적: clean + burner_level > 0 + 볶기 버튼 홀드 중
      if (canAccumulateStir(result.wok_status, equip.burner_level) && get().stirring_equipment_ids.has(id)) {
        for (const inst of wokIngredients) {
          appendActionHistory(inst.id, 'stir');
        }
      }
    }
  },

  tickBasket: (id) => {
    const equip = get().equipments.find((e) => e.id === id);
    if (!equip || equip.equipment_type !== 'frying_basket') return;
    if (equip.basket_status === null) return;

    if (canAccumulateFry(equip.basket_status)) {
      const ingredients = useGameStore
        .getState()
        .ingredientInstances.filter(
          (i) => i.equipment_state_id === id && i.location_type === 'equipment',
        );
      for (const inst of ingredients) {
        appendActionHistory(inst.id, 'fry');
      }
    }
  },

  tickMicrowave: (id) => {
    const equip = get().equipments.find((e) => e.id === id);
    if (!equip || equip.equipment_type !== 'microwave') return;
    if (equip.mw_status === null || equip.mw_remaining_sec === null) return;

    const result = tickMicrowavePhysics({
      mw_status: equip.mw_status,
      mw_remaining_sec: equip.mw_remaining_sec,
    });

    set((s) => ({
      equipments: s.equipments.map((e) =>
        e.id === id
          ? { ...e, mw_status: result.mw_status, mw_remaining_sec: result.mw_remaining_sec }
          : e,
      ),
    }));

    // microwave 누적 (running일 때만)
    if (canAccumulateMicrowave(equip.mw_status)) {
      const ingredients = useGameStore
        .getState()
        .ingredientInstances.filter(
          (i) => i.equipment_state_id === id && i.location_type === 'equipment',
        );
      for (const inst of ingredients) {
        appendActionHistory(inst.id, 'microwave');
      }
    }
  },
}));
