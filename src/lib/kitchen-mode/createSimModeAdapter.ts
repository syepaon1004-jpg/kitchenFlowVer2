import type {
  ActionResult,
  GhostGuideModel,
  HudModel,
  KitchenModeAdapter,
  LegalAction,
  OverlayModel,
  RejectionModel,
  StepGroupViewModel,
} from './KitchenModeAdapter';
import type { WokStatus } from '../../types/db';
import { useEquipmentStore } from '../../stores/equipmentStore';
import { useGameStore } from '../../stores/gameStore';
import { useScoringStore } from '../../stores/scoringStore';
import { SCORE_CONFIG } from '../scoring/constants';

// Sim mode adapter. Sim-only scoring/log ownership 계약 (TASK-20260421-208 / Phase 2 Slice 3):
// 1) shared runtime(equipmentStore, useGameTick)은 물리/상태 전이만 담당하며
//    sim-only 점수/로그를 발행하지 않는다.
// 2) sim-only scoring/log ownership(wok_burned score event, wok_burned/stir action log,
//    idle penalty)은 onRuntimeTick()이 보유한다.
// 3) onRuntimeTick()은 useEquipmentStore / useGameStore / useScoringStore의 getState()를
//    경계에 맞게(read-only snapshot + adapter가 소유한 sim-only store write) 사용한다
//    (SHARED_SHELL_BOUNDARY_APPENDIX §6.2).
// 4) 이 ownership은 sim 전용이며 createPracticeModeAdapter에는 전파되지 않는다.
//
// 잔존 skeleton 필드(stubResult/hud/overlay/미구현 getters)는 본 slice 범위 밖이며
// Phase 2 후속 slice에서 실체화된다.
export function createSimModeAdapter(): KitchenModeAdapter {
  const stubResult: ActionResult = { ok: false, rejection_code: 'skeleton_stub' };
  const hud: HudModel = { mode: 'sim' };
  const overlay: OverlayModel = {};
  const emptyLegal: LegalAction[] = [];
  const emptyStepGroups: StepGroupViewModel[] = [];
  const guide: GhostGuideModel | null = null;
  const rejection: RejectionModel | null = null;

  // prevWokStatuses = null ⇒ 아직 유효 baseline 미확보. hydration readiness gate
  // (equipments.length > 0)가 통과된 첫 tick에 baseline으로 승격된다.
  let prevWokStatuses: Map<string, WokStatus> | null = null;

  return {
    mode: 'sim',
    boot: () => {
      prevWokStatuses = null;
      return Promise.resolve();
    },
    getHudModel: () => hud,
    getOverlayModel: () => overlay,
    getOpenStep: () => null,
    enumerateLegalActions: () => emptyLegal,
    tryPlaceIngredient: () => stubResult,
    tryPerformAction: () => stubResult,
    tryPour: () => stubResult,
    onRuntimeTick: () => {
      const { equipments, stirring_equipment_ids } = useEquipmentStore.getState();
      const sessionId = useGameStore.getState().sessionId;
      const { addScoreEvent, addActionLog, checkIdlePenalty } = useScoringStore.getState();
      const now = Date.now();

      // hydration readiness gate — equipments 배열이 비어 있으면 아직 장비 initializer
      // (GamePage.tsx의 setEquipments)가 완료되지 않은 상태다. 이 순간을 baseline으로 삼으면
      // hydrate 직후 burned 상태가 들어올 때 "신규 burn"으로 오판한다.
      const equipmentHydrated = equipments.length > 0;

      // 현재 wok 상태 스냅샷 (hydrate 여부 무관하게 계산 — 비어 있으면 빈 Map)
      const currentStatuses = new Map<string, WokStatus>();
      for (const equip of equipments) {
        if (equip.equipment_type === 'wok' && equip.wok_status !== null) {
          currentStatuses.set(equip.id, equip.wok_status);
        }
      }

      // 1) burn 신규 전이 감지 — hydrate 완료 + 유효 baseline 확보 후에만
      if (equipmentHydrated && prevWokStatuses !== null && sessionId) {
        for (const [id, curr] of currentStatuses) {
          const prev = prevWokStatuses.get(id) ?? null;
          if (prev !== 'burned' && curr === 'burned') {
            addScoreEvent({
              session_id: sessionId,
              event_type: 'wok_burned',
              points: SCORE_CONFIG.WOK_BURNED,
              timestamp_ms: now,
              metadata: { equipment_id: id },
            });
            addActionLog({
              session_id: sessionId,
              action_type: 'wok_burned',
              timestamp_ms: now,
              metadata: { equipment_id: id },
            });
          }
        }
      }

      // baseline 승격도 hydrate 완료 시에만. 빈 Map은 baseline 자격 없음.
      if (equipmentHydrated) {
        prevWokStatuses = currentStatuses;
      }

      // 2) stir 지속 로그 (기존 useGameTick 스루 동일 조건·shape)
      if (sessionId && stirring_equipment_ids.size > 0) {
        for (const equipId of stirring_equipment_ids) {
          addActionLog({
            session_id: sessionId,
            action_type: 'stir',
            timestamp_ms: now,
            metadata: { equipment_id: equipId },
          });
        }
      }

      // 3) idle penalty — timestamp 기반, hydration 무관
      checkIdlePenalty(now);
    },
    getCurrentStepGroups: () => emptyStepGroups,
    getPrimaryStepGroup: () => null,
    getGhostGuide: () => guide,
    getRejectionModel: () => rejection,
  };
}
