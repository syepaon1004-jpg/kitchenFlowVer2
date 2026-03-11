import { create } from 'zustand';
import type {
  GameActionLog,
  GameScoreEvent,
  GameRecipeError,
  GameRecipeResult,
  ScoreEventType,
} from '../types/db';
import { SCORE_CONFIG } from '../lib/scoring/constants';

interface ScoringState {
  actionLogs: GameActionLog[];
  scoreEvents: GameScoreEvent[];
  recipeErrors: GameRecipeError[];
  recipeResults: GameRecipeResult[];
  currentScore: number;
  lastActionTimestamp: number;
  consecutiveNavCount: number;
  lastNavZoneId: string | null;
  idlePenaltyLevel: number; // 0: 없음, 1: 5초 적용됨, 2: 10초 적용됨

  addActionLog: (log: Omit<GameActionLog, 'id'>) => void;
  addScoreEvent: (event: Omit<GameScoreEvent, 'id'>) => void;
  addRecipeError: (error: Omit<GameRecipeError, 'id'>) => void;
  addRecipeResult: (result: Omit<GameRecipeResult, 'id'>) => void;
  checkIdlePenalty: (now: number) => void;
  resetForNewSession: () => void;
}

export const useScoringStore = create<ScoringState>((set, get) => ({
  actionLogs: [],
  scoreEvents: [],
  recipeErrors: [],
  recipeResults: [],
  currentScore: SCORE_CONFIG.INITIAL_SCORE,
  lastActionTimestamp: Date.now(),
  consecutiveNavCount: 0,
  lastNavZoneId: null,
  idlePenaltyLevel: 0,

  addActionLog: (log) => {
    const id = crypto.randomUUID();
    const newLog: GameActionLog = { ...log, id };
    const state = get();

    let consecutiveNavCount = state.consecutiveNavCount;
    let lastNavZoneId = state.lastNavZoneId;
    let scoreEvents = state.scoreEvents;
    let currentScore = state.currentScore;

    if (log.action_type === 'navigate_open') {
      const zoneId = log.metadata.zone_id as string;

      if (lastNavZoneId === zoneId) {
        consecutiveNavCount++;
      } else {
        consecutiveNavCount = 1;
        lastNavZoneId = zoneId;
      }

      // 정확히 REDUNDANT_NAV_COUNT 도달 시 1회만 감점
      if (consecutiveNavCount === SCORE_CONFIG.REDUNDANT_NAV_COUNT) {
        const penaltyEvent: GameScoreEvent = {
          id: crypto.randomUUID(),
          session_id: log.session_id,
          event_type: 'redundant_nav',
          points: SCORE_CONFIG.REDUNDANT_NAV,
          timestamp_ms: Date.now(),
          metadata: { zone_id: zoneId, count: consecutiveNavCount },
        };
        scoreEvents = [...scoreEvents, penaltyEvent];
        currentScore = Math.max(0, currentScore + SCORE_CONFIG.REDUNDANT_NAV);
      }
    } else {
      // navigate가 아닌 다른 액션 → 카운트 리셋
      consecutiveNavCount = 0;
      lastNavZoneId = null;
    }

    set({
      actionLogs: [...state.actionLogs, newLog],
      lastActionTimestamp: Date.now(),
      idlePenaltyLevel: 0,
      consecutiveNavCount,
      lastNavZoneId,
      scoreEvents,
      currentScore,
    });
  },

  addScoreEvent: (event) => {
    const id = crypto.randomUUID();
    const newEvent: GameScoreEvent = { ...event, id };

    set((s) => ({
      scoreEvents: [...s.scoreEvents, newEvent],
      currentScore: Math.max(0, s.currentScore + event.points),
    }));
  },

  addRecipeError: (error) => {
    const id = crypto.randomUUID();
    const newError: GameRecipeError = { ...error, id };

    set((s) => ({
      recipeErrors: [...s.recipeErrors, newError],
    }));
  },

  addRecipeResult: (result) => {
    const id = crypto.randomUUID();
    const newResult: GameRecipeResult = { ...result, id };

    set((s) => ({
      recipeResults: [...s.recipeResults, newResult],
    }));
  },

  checkIdlePenalty: (now) => {
    const state = get();
    const idleMs = now - state.lastActionTimestamp;

    if (idleMs >= SCORE_CONFIG.LONG_IDLE_THRESHOLD && state.idlePenaltyLevel < 2) {
      let scoreEvents = state.scoreEvents;
      let currentScore = state.currentScore;

      if (state.idlePenaltyLevel === 1) {
        // 5초 감점을 10초 감점으로 대체: 마지막 short_idle 이벤트 제거 + 점수 되돌림
        const lastShortIdleIdx = findLastIndex(scoreEvents, (e) => e.event_type === 'short_idle');
        if (lastShortIdleIdx !== -1) {
          scoreEvents = [
            ...scoreEvents.slice(0, lastShortIdleIdx),
            ...scoreEvents.slice(lastShortIdleIdx + 1),
          ];
          currentScore = Math.max(0, currentScore - SCORE_CONFIG.SHORT_IDLE);
        }
      }

      // LONG_IDLE 감점 추가
      const penaltyEvent: GameScoreEvent = {
        id: crypto.randomUUID(),
        session_id: state.actionLogs.length > 0 ? state.actionLogs[0].session_id : '',
        event_type: 'long_idle' as ScoreEventType,
        points: SCORE_CONFIG.LONG_IDLE,
        timestamp_ms: now,
        metadata: { idle_ms: idleMs },
      };

      set({
        scoreEvents: [...scoreEvents, penaltyEvent],
        currentScore: Math.max(0, currentScore + SCORE_CONFIG.LONG_IDLE),
        idlePenaltyLevel: 2,
      });
    } else if (idleMs >= SCORE_CONFIG.SHORT_IDLE_THRESHOLD && state.idlePenaltyLevel < 1) {
      const penaltyEvent: GameScoreEvent = {
        id: crypto.randomUUID(),
        session_id: state.actionLogs.length > 0 ? state.actionLogs[0].session_id : '',
        event_type: 'short_idle' as ScoreEventType,
        points: SCORE_CONFIG.SHORT_IDLE,
        timestamp_ms: now,
        metadata: { idle_ms: idleMs },
      };

      set((s) => ({
        scoreEvents: [...s.scoreEvents, penaltyEvent],
        currentScore: Math.max(0, s.currentScore + SCORE_CONFIG.SHORT_IDLE),
        idlePenaltyLevel: 1,
      }));
    }
  },

  resetForNewSession: () => {
    set({
      actionLogs: [],
      scoreEvents: [],
      recipeErrors: [],
      recipeResults: [],
      currentScore: SCORE_CONFIG.INITIAL_SCORE,
      lastActionTimestamp: Date.now(),
      consecutiveNavCount: 0,
      lastNavZoneId: null,
      idlePenaltyLevel: 0,
    });
  },
}));

/** 배열에서 조건을 만족하는 마지막 요소의 인덱스를 반환 */
function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
