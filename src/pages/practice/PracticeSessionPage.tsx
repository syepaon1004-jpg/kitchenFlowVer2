import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { usePracticeStore } from '../../stores/practiceStore';
import {
  createPracticeModeAdapter,
  KitchenModeAdapterProvider,
  type KitchenModeAdapter,
  type RejectionModel,
} from '../../lib/kitchen-mode';
import {
  SharedKitchenShell,
  SharedKitchenHudSlots,
} from '../../components/game/shared-shell';
import GameKitchenView from '../../components/game/GameKitchenView';
import {
  PracticeHudProgress,
  PracticeHudStepGroup,
  PracticePrimaryActionTrigger,
  PracticeRejectionToast,
} from '../../components/practice/PracticeSessionHud';
import {
  fetchPracticeKitchenAssets,
  type PracticeKitchenAssets,
} from './practiceKitchenAssets';
import '../../styles/gameVariables.css';
import styles from './PracticePlaceholder.module.css';

type AssetsState =
  | { status: 'loading' }
  | { status: 'ready'; assets: PracticeKitchenAssets }
  | { status: 'unsupported' };

type FetchedRecord = {
  storeId: string;
  result: PracticeKitchenAssets | null; // null = unsupported / fetch error
};

const PracticeSessionPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);

  const phase = usePracticeStore((s) => s.phase);
  const session = usePracticeStore((s) => s.session);
  const error = usePracticeStore((s) => s.error);
  // HUD reactivity: derived 참조가 매 try* 성공마다 `computeDerivedData` 로 새 객체로 교체되므로
  // 이 구독이 page re-render → HUD children(adapter 메서드 호출) 갱신 트리거가 된다.
  const derived = usePracticeStore((s) => s.derived);
  const isComplete = derived?.isComplete ?? false;

  const resumeSession = usePracticeStore((s) => s.resumeSession);
  const abandonSession = usePracticeStore((s) => s.abandonSession);
  const completeSession = usePracticeStore((s) => s.completeSession);
  const reset = usePracticeStore((s) => s.reset);

  const adapter: KitchenModeAdapter = useMemo(
    () => createPracticeModeAdapter(),
    [],
  );

  const [fetched, setFetched] = useState<FetchedRecord | null>(null);
  const [rejection, setRejection] = useState<RejectionModel | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const { phase: p, session: s } = usePracticeStore.getState();
    if (p === 'idle' || (s !== null && s.id !== sessionId)) {
      resumeSession(sessionId);
    }
    return () => {
      reset();
    };
  }, [sessionId, resumeSession, reset]);

  const storeId = selectedStore?.id ?? null;
  const userId = selectedUser?.id ?? null;
  const menuId = session?.menu_id ?? null;

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    fetchPracticeKitchenAssets(storeId)
      .then((result) => {
        if (!cancelled) setFetched({ storeId, result });
      })
      .catch(() => {
        if (!cancelled) setFetched({ storeId, result: null });
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const assetsState: AssetsState = (() => {
    if (!storeId) return { status: 'loading' };
    if (!fetched || fetched.storeId !== storeId) return { status: 'loading' };
    return fetched.result
      ? { status: 'ready', assets: fetched.result }
      : { status: 'unsupported' };
  })();

  useEffect(() => {
    if (!storeId || !userId || !sessionId || !menuId || phase !== 'active') return;
    void adapter.boot({
      store_id: storeId,
      user_id: userId,
      mode: 'practice',
      practice_menu_id: menuId,
    });
  }, [adapter, storeId, userId, sessionId, menuId, phase]);

  if (!sessionId) return null;

  const handleRejectionSync = () => {
    setRejection(adapter.getRejectionModel());
  };

  if (phase === 'idle') return null;

  if (phase === 'loading') {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>세션 불러오는 중...</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className={styles.container}>
        <h1>오류</h1>
        <p className={styles.errorText}>{error}</p>
        <div className={styles.buttonRow}>
          <button
            className={styles.retryButton}
            onClick={() => resumeSession(sessionId)}
          >
            다시 시도
          </button>
          <button
            className={styles.backButton}
            onClick={() => navigate('/practice')}
          >
            연습 목록으로
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'completed') {
    return (
      <div className={styles.container}>
        <h1>연습 완료</h1>
        {session?.completed_at && (
          <p className={styles.subtitle}>
            완료 시각: {new Date(session.completed_at).toLocaleString()}
          </p>
        )}
        <button
          className={styles.backButton}
          onClick={() => navigate('/practice')}
        >
          연습 목록으로
        </button>
      </div>
    );
  }

  if (phase === 'abandoned') {
    return (
      <div className={styles.container}>
        <h1>연습 포기됨</h1>
        <button
          className={styles.backButton}
          onClick={() => navigate('/practice')}
        >
          연습 목록으로
        </button>
      </div>
    );
  }

  // phase === 'active'
  if (assetsState.status === 'loading') {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>주방 데이터를 불러오는 중...</p>
      </div>
    );
  }

  if (assetsState.status === 'unsupported') {
    return (
      <div className={styles.container}>
        <h1>연습 세션</h1>
        <p className={styles.subtitle}>
          이 매장은 multi-row panel 구성 또는 panel_layout 미설정이라 현재 shared-kitchen
          practice session을 지원하지 않습니다. 아래 legacy 경로를 이용해 주세요.
        </p>
        <div className={styles.buttonRow}>
          <Link
            className={styles.retryButton}
            to={`/practice/session/${sessionId}/legacy`}
          >
            legacy 화면으로 이동
          </Link>
          <button
            className={styles.backButton}
            onClick={() => navigate('/practice')}
          >
            연습 목록으로
          </button>
        </div>
      </div>
    );
  }

  const assets = assetsState.assets;

  return (
    <div className={styles.container}>
      <KitchenModeAdapterProvider adapter={adapter}>
        <SharedKitchenShell
          hudSlots={
            <SharedKitchenHudSlots
              topLeft={<PracticeHudProgress />}
              modeSummary={<PracticeHudStepGroup />}
              bottomLeft={
                <PracticePrimaryActionTrigger onAfterDispatch={handleRejectionSync} />
              }
            />
          }
          overlaySlots={<PracticeRejectionToast rejection={rejection} />}
        >
          <GameKitchenView
            panelHeights={assets.layout.panel_heights}
            perspectiveDeg={assets.layout.perspective_deg}
            previewYOffset={assets.layout.preview_y_offset}
            backgroundImageUrl={assets.layout.background_image_url}
            cameraOffsetX={0}
            equipment={assets.equipment.map((eq) => ({
              id: eq.id,
              panelIndex: eq.panel_number - 1,
              equipmentType: eq.equipment_type,
              x: eq.x,
              y: eq.y,
              width: eq.width,
              height: eq.height,
              equipmentIndex: eq.equipment_index,
              config: eq.config,
              placeable: eq.placeable,
              sortOrder: eq.sort_order,
            }))}
            items={assets.items.map((item) => ({
              id: item.id,
              panelIndex: item.panel_number - 1,
              itemType: item.item_type,
              x: item.x,
              y: item.y,
              width: item.width,
              height: item.height,
              label:
                item.item_type === 'ingredient' && item.ingredient_id
                  ? assets.ingredientLabels.get(item.ingredient_id) ?? ''
                  : '',
              ingredientId: item.ingredient_id ?? undefined,
              containerId: item.container_id ?? undefined,
            }))}
            ingredientLabelsMap={assets.ingredientLabels}
            wokContentsMap={new Map()}
            placedContainers={[]}
            hasSelection={false}
            selection={null}
            panelToStateIdMap={new Map()}
            onSceneClick={() => {
              /* Phase 5 scope — main route 상호작용은 HUD affordance */
            }}
          />
        </SharedKitchenShell>
      </KitchenModeAdapterProvider>

      <div className={styles.buttonRow}>
        <button
          className={styles.completeButton}
          disabled={!isComplete}
          onClick={completeSession}
        >
          연습 완료
        </button>
        <button className={styles.abandonButton} onClick={abandonSession}>
          포기
        </button>
        <Link
          className={styles.backButton}
          to={`/practice/session/${sessionId}/legacy`}
        >
          legacy 화면
        </Link>
        <button
          className={styles.backButton}
          onClick={() => navigate('/practice')}
        >
          연습 목록으로
        </button>
      </div>
    </div>
  );
};

export default PracticeSessionPage;
