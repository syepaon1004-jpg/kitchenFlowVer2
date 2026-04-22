import {
  useKitchenModeAdapter,
  type RejectionModel,
} from '../../lib/kitchen-mode';
import {
  pickDispatchableLegalAction,
  dispatchLegalAction,
} from './practiceDispatch';
import styles from './PracticeSessionHud.module.css';

// Practice main route의 최소 shared-kitchen HUD surface.
// text-first formatter 의존 없음. adapter 경계로만 read.
// Gate B Axis 3: 텍스트형 actiondump 포맷 금지.

export function PracticeHudProgress() {
  const adapter = useKitchenModeAdapter();
  if (!adapter) return null;
  const hud = adapter.getHudModel();
  return (
    <div className={styles.progressBadge}>
      {hud.title && <div className={styles.progressTitle}>{hud.title}</div>}
      {hud.progress && (
        <div className={styles.progressCount}>
          {hud.progress.completed} / {hud.progress.total}
        </div>
      )}
    </div>
  );
}

export function PracticeHudStepGroup() {
  const adapter = useKitchenModeAdapter();
  if (!adapter) return null;
  const current = adapter.getPrimaryStepGroup();
  const groups = adapter.getCurrentStepGroups();
  const next = groups.find((g) => !g.is_primary) ?? null;

  if (!current && !next) return null;

  return (
    <div className={styles.stepGroupCard}>
      {current && (
        <div className={styles.stepGroupPrimary}>
          <span className={styles.stepNo}>Step {current.display_step_no}</span>
          <span className={styles.stepTitle}>{current.title}</span>
          {current.summary && (
            <p className={styles.stepSummary}>{current.summary}</p>
          )}
        </div>
      )}
      {next && (
        <div className={styles.stepGroupNext}>
          <span className={styles.nextLabel}>다음</span>
          <span className={styles.nextStepNo}>Step {next.display_step_no}</span>
          <span className={styles.nextTitle}>{next.title}</span>
        </div>
      )}
    </div>
  );
}

// Primary action trigger.
// dispatch rule 세부는 practiceDispatch.ts 참조.
export interface PracticePrimaryActionTriggerProps {
  onAfterDispatch?: () => void;
}

export function PracticePrimaryActionTrigger({
  onAfterDispatch,
}: PracticePrimaryActionTriggerProps) {
  const adapter = useKitchenModeAdapter();
  if (!adapter) return null;

  // 매 렌더마다 fresh enumerate — useMemo([adapter]) 로 동결하면 try* 성공 후 다음
  // legal action 으로 갱신되지 않아 사용자가 stale action 을 반복 dispatch 하게 된다.
  // 부모 page 가 derived 를 구독해 try* 성공마다 re-render 를 트리거한다.
  const legals = adapter.enumerateLegalActions();
  const dispatchable = pickDispatchableLegalAction(legals);
  const hasPourOnly = legals.length > 0 && dispatchable === null;

  const handleClick = () => {
    if (!dispatchable) return;
    dispatchLegalAction(adapter, dispatchable);
    onAfterDispatch?.();
  };

  if (hasPourOnly) {
    return (
      <div className={styles.triggerPanel}>
        <button type="button" className={styles.triggerButton} disabled>
          다음 동작 실행
        </button>
        <p className={styles.triggerHint}>
          현재 단계는 이 화면에서 실행할 수 없습니다 — legacy 경로를 이용해 주세요.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.triggerPanel}>
      <button
        type="button"
        className={styles.triggerButton}
        disabled={dispatchable === null}
        onClick={handleClick}
      >
        다음 동작 실행
      </button>
    </div>
  );
}

export interface PracticeRejectionToastProps {
  rejection: RejectionModel | null;
}

export function PracticeRejectionToast({ rejection }: PracticeRejectionToastProps) {
  if (!rejection) return null;
  return (
    <div className={styles.rejectionToast}>
      <span className={styles.rejectionLabel}>거절</span>
      <span className={styles.rejectionCode}>{rejection.rejection_code}</span>
    </div>
  );
}
