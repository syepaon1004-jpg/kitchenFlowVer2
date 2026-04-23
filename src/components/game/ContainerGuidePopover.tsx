import { useEffect, useMemo } from 'react';
import { useUiStore } from '../../stores/uiStore';
import { useGameStore } from '../../stores/gameStore';
import type { StoreIngredient } from '../../types/db';
import type { ContainerGuideBlocker } from '../../types/game';
import RecipeStepList from './RecipeStepList';
import styles from './ContainerGuidePopover.module.css';

interface Props {
  storeIngredientsMap: Map<string, StoreIngredient>;
}

const POPOVER_W = 300;
const POPOVER_H_ESTIMATED = 360;
const GAP = 10;

export default function ContainerGuidePopover({ storeIngredientsMap }: Props) {
  const isOpen = useUiStore((s) => s.containerGuideOpen);
  const anchor = useUiStore((s) => s.containerGuideAnchor);
  const data = useUiStore((s) => s.containerGuideData);
  const instanceId = useUiStore((s) => s.containerGuideInstanceId);
  const close = useUiStore((s) => s.closeContainerGuide);
  const currentSection = useUiStore((s) => s.currentSection);
  const containerInstances = useGameStore((s) => s.containerInstances);

  // ESC 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // 섹션 변경 시 자동 닫기 (앵커 위치 어긋남 방지)
  useEffect(() => {
    if (isOpen) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSection]);

  // 그릇이 사라지면(pour 등) 자동 닫기
  useEffect(() => {
    if (!isOpen || !instanceId) return;
    const exists = containerInstances.some(
      (c) => c.id === instanceId && c.placed_equipment_id !== null && !c.is_served,
    );
    if (!exists) close();
  }, [isOpen, instanceId, containerInstances, close]);

  const position = useMemo(() => {
    if (!anchor) return null;
    let left = anchor.x + anchor.w / 2 - POPOVER_W / 2;
    let top = anchor.y - POPOVER_H_ESTIMATED - GAP;
    if (top < 8) {
      top = anchor.y + anchor.h + GAP;
    }
    if (left < 8) left = 8;
    if (left + POPOVER_W > window.innerWidth - 8) left = window.innerWidth - POPOVER_W - 8;
    return { left, top };
  }, [anchor]);

  if (!isOpen || !data || !anchor || !position) return null;

  const getName = (id: string) => storeIngredientsMap.get(id)?.display_name ?? '재료';

  return (
    <>
      <div className={styles.backdrop} onClick={close} />
      <div
        className={styles.popover}
        style={{ left: `${position.left}px`, top: `${position.top}px`, width: `${POPOVER_W}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={styles.header}>
          <span className={styles.title}>{data.recipeName}</span>
          <button type="button" className={styles.closeBtn} onClick={close} aria-label="닫기">
            ×
          </button>
        </header>

        {data.blockers.length > 0 && (
          <section className={styles.blockerSection}>
            {data.blockers.map((b, i) => (
              <div key={i} className={styles.blocker}>
                {renderBlocker(b, getName)}
              </div>
            ))}
          </section>
        )}

        {data.isComplete && data.blockers.length === 0 && (
          <section className={styles.completeSection}>
            ✓ 이 그릇은 완료되었습니다. 서빙하세요!
          </section>
        )}

        <RecipeStepList data={data} storeIngredientsMap={storeIngredientsMap} />
      </div>
    </>
  );
}

function renderBlocker(
  b: ContainerGuideBlocker,
  getName: (id: string) => string,
): React.ReactNode {
  switch (b.kind) {
    case 'wrong_container':
      return <span>⚠ 이 그릇은 이 레시피에 사용할 수 없습니다</span>;
    case 'steps_remaining':
      return <span>▶ 다음: {b.nextPlateOrder}단계 투입이 필요합니다</span>;
    case 'existing_errors':
      return <span>⚠ 기존 재료 오류 {b.errors.length}건</span>;
    case 'deco_missing':
      return <span>🌿 데코 필요: {b.ingredientIds.map(getName).join(', ')}</span>;
    case 'peer_containers_incomplete':
      return <span>⏳ 같은 주문의 다른 그릇이 아직 완료되지 않았습니다</span>;
    default:
      return null;
  }
}
