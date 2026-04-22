// Practice runtime Zustand store.
// sim store와 완전 분리. engine/* 순수 함수만 호출.

import { create } from 'zustand';
import type {
  PracticeSession,
  PracticeActionType,
} from '../types/practice';
import type {
  PracticeEngineState,
  PlaceResult,
  ActionResult as EnginePlaceActionResult,
  PourResult,
} from '../lib/practice/engine';
import {
  bootstrapEngineState,
  tryPlaceIngredient,
  tryExecuteAction,
  tryPour,
} from '../lib/practice/engine';

// store-level sentinel: session 또는 engineState 가 준비되기 전에 호출된 경우.
// adapter 가 이를 spec rejection_code('session_not_active')로 번역한다.
export type NotActiveResult = {
  allowed: false;
  reason: 'not-active';
};
export type StorePlaceResult = PlaceResult | NotActiveResult;
export type StoreActionResult = EnginePlaceActionResult | NotActiveResult;
export type StorePourResult = PourResult | NotActiveResult;
import type { PracticeDerivedData } from '../lib/practice/runtime';
import {
  hydrateEngineState,
  dehydrateInstances,
  dehydrateProgress,
  computeDerivedData,
} from '../lib/practice/runtime';
import {
  fetchPracticeMenuBundle,
  fetchPracticeSession,
  createPracticeSession,
  updatePracticeSessionStatus,
  fetchPracticeIngredientInstances,
  fetchPracticeNodeProgress,
  upsertPracticeIngredientInstances,
  upsertPracticeNodeProgress,
} from '../lib/practice/queries';

// ——— Types ———

export type PracticePhase = 'idle' | 'loading' | 'active' | 'completed' | 'abandoned' | 'error';

export interface PracticeState {
  phase: PracticePhase;
  session: PracticeSession | null;
  error: string | null;
  engineState: PracticeEngineState | null;
  derived: PracticeDerivedData | null;
  persistInFlight: boolean;
  persistError: string | null;

  startSession: (menuId: string, storeId: string, storeUserId: string) => Promise<void>;
  resumeSession: (sessionId: string) => Promise<void>;
  placeIngredient: (ingredientId: string, targetLocationId: string) => StorePlaceResult;
  executeAction: (actionType: PracticeActionType, locationId: string) => StoreActionResult;
  pour: (sourceLocationId: string, targetLocationId: string) => StorePourResult;
  completeSession: () => Promise<void>;
  abandonSession: () => Promise<void>;
  reset: () => void;
}

// ——— Serialized persist queue (module-level private) ———

let persistChain: Promise<void> = Promise.resolve();
let latestRevision = 0;
let lastPersistError: string | null = null;
let queueGeneration = 0;

function enqueuePersist(
  sessionId: string,
  newState: PracticeEngineState,
  set: (partial: Partial<PracticeState>) => void,
): void {
  const myRevision = ++latestRevision;
  const myGeneration = queueGeneration;
  set({ persistInFlight: true, persistError: null });

  persistChain = persistChain
    .then(async () => {
      if (myGeneration !== queueGeneration) return;
      if (myRevision < latestRevision) return;

      const instanceRows = dehydrateInstances(sessionId, newState.ingredient_instances);
      const progressRows = dehydrateProgress(sessionId, newState.node_progress);
      await Promise.all([
        upsertPracticeIngredientInstances(instanceRows),
        upsertPracticeNodeProgress(progressRows),
      ]);

      if (myGeneration !== queueGeneration) return;
      lastPersistError = null;
      set({ persistError: null });
    })
    .catch((e: unknown) => {
      if (myGeneration !== queueGeneration) return;
      if (myRevision < latestRevision) return;
      const msg = e instanceof Error ? e.message : String(e);
      lastPersistError = msg;
      set({ persistError: msg });
    })
    .finally(() => {
      if (myGeneration !== queueGeneration) return;
      if (myRevision >= latestRevision) {
        set({ persistInFlight: false });
      }
    });
}

async function flushPersist(): Promise<void> {
  await persistChain;
  if (lastPersistError !== null) {
    throw new Error(`persist flush failed: ${lastPersistError}`);
  }
}

/** 테스트용: 큐 상태 초기화 */
export function resetPersistQueue(): void {
  persistChain = Promise.resolve();
  latestRevision = 0;
  lastPersistError = null;
  queueGeneration++;
}

// ——— Initial state ———

const INITIAL_STATE: Omit<PracticeState,
  'startSession' | 'resumeSession' | 'placeIngredient' | 'executeAction' | 'pour' | 'completeSession' | 'abandonSession' | 'reset'
> = {
  phase: 'idle',
  session: null,
  error: null,
  engineState: null,
  derived: null,
  persistInFlight: false,
  persistError: null,
};

// ——— Store ———

export const usePracticeStore = create<PracticeState>((set, get) => {
  const finalizeSession = async (targetStatus: 'completed' | 'abandoned'): Promise<void> => {
    const { session } = get();
    if (!session) return;

    try {
      await flushPersist();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ phase: 'error', error: msg });
      return;
    }

    try {
      await updatePracticeSessionStatus(session.id, targetStatus);
      const now = new Date().toISOString();
      set({
        phase: targetStatus,
        session: { ...session, status: targetStatus, completed_at: now },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      set({ phase: 'error', error: msg });
    }
  };

  return {
    ...INITIAL_STATE,

    startSession: async (menuId, storeId, storeUserId) => {
      resetPersistQueue();
      set({ ...INITIAL_STATE, phase: 'loading' });
      try {
        const bundle = await fetchPracticeMenuBundle(menuId);
        const session = await createPracticeSession(menuId, storeId, storeUserId);
        const engineState = bootstrapEngineState(bundle);
        const derived = computeDerivedData(engineState);

        const progressRows = dehydrateProgress(session.id, engineState.node_progress);
        await upsertPracticeNodeProgress(progressRows);

        set({ phase: 'active', session, engineState, derived });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        set({ phase: 'error', error: msg });
      }
    },

    resumeSession: async (sessionId) => {
      resetPersistQueue();
      set({ ...INITIAL_STATE, phase: 'loading' });
      try {
        const session = await fetchPracticeSession(sessionId);
        if (!session) throw new Error(`session not found: ${sessionId}`);

        if (session.status === 'completed') {
          set({ phase: 'completed', session, engineState: null, derived: null });
          return;
        }
        if (session.status === 'abandoned') {
          set({ phase: 'abandoned', session, engineState: null, derived: null });
          return;
        }

        const bundle = await fetchPracticeMenuBundle(session.menu_id);
        const [dbInstances, dbProgress] = await Promise.all([
          fetchPracticeIngredientInstances(sessionId),
          fetchPracticeNodeProgress(sessionId),
        ]);
        const engineState = hydrateEngineState(bundle, dbInstances, dbProgress);
        const derived = computeDerivedData(engineState);

        set({ phase: 'active', session, engineState, derived });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        set({ phase: 'error', error: msg });
      }
    },

    placeIngredient: (ingredientId, targetLocationId) => {
      const { engineState, session } = get();
      if (!engineState || !session) {
        return { allowed: false, reason: 'not-active' };
      }

      const result = tryPlaceIngredient(ingredientId, targetLocationId, engineState);
      if (result.allowed) {
        const derived = computeDerivedData(result.newState);
        set({ engineState: result.newState, derived });
        enqueuePersist(session.id, result.newState, set);
      }
      return result;
    },

    executeAction: (actionType, locationId) => {
      const { engineState, session } = get();
      if (!engineState || !session) {
        return { allowed: false, reason: 'not-active' };
      }

      const result = tryExecuteAction(actionType, locationId, engineState);
      if (result.allowed) {
        const derived = computeDerivedData(result.newState);
        set({ engineState: result.newState, derived });
        enqueuePersist(session.id, result.newState, set);
      }
      return result;
    },

    pour: (sourceLocationId, targetLocationId) => {
      const { engineState, session } = get();
      if (!engineState || !session) {
        return { allowed: false, reason: 'not-active' };
      }

      const result = tryPour(sourceLocationId, targetLocationId, engineState);
      if (result.allowed) {
        // §14.4 empty-payload pour success는 committedNodeIds=[] + state 불변 — persist skip.
        if (result.committedNodeIds.length > 0) {
          const derived = computeDerivedData(result.newState);
          set({ engineState: result.newState, derived });
          enqueuePersist(session.id, result.newState, set);
        }
      }
      return result;
    },

    completeSession: () => finalizeSession('completed'),

    abandonSession: () => finalizeSession('abandoned'),

    reset: () => {
      resetPersistQueue();
      set({ ...INITIAL_STATE });
    },
  };
});
