import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePracticeStore } from '../../stores/practiceStore';
import type { TacitDetailViewModel, NextGroupPreviewViewModel } from '../../lib/practice/sessionView';
import {
  buildLocationLabelMap,
  buildTacitDetailViewModel,
  buildNextGroupPreview,
} from '../../lib/practice/sessionView';
import type { GuideIntensity } from '../../lib/practice/sessionTextFormat';
import {
  formatLegalAction,
  formatFriendlyAction,
  pickRepresentativeAction,
} from '../../lib/practice/sessionTextFormat';
import { fetchIngredientDisplayNames } from '../../lib/practice/queries';
import type { LegalAction } from '../../lib/practice/engine';
import type { PracticeTacitItem, PracticeTacitMedia } from '../../types/practice';
import '../../styles/gameVariables.css';
import styles from './PracticePlaceholder.module.css';

const SENSORY_FIELDS = [
  { key: 'flame_level', label: '화력' },
  { key: 'color_note', label: '색' },
  { key: 'viscosity_note', label: '점도' },
  { key: 'sound_note', label: '소리' },
  { key: 'texture_note', label: '질감' },
  { key: 'timing_note', label: '타이밍' },
] as const;

function TacitSensoryNotes({ item }: { item: PracticeTacitItem }) {
  const notes: { label: string; value: string }[] = [];
  for (const { key, label } of SENSORY_FIELDS) {
    const v = item[key];
    if (v != null) notes.push({ label, value: v });
  }
  if (notes.length === 0) return null;

  return (
    <div className={styles.tacitSensoryNotes}>
      {notes.map(({ label, value }) => (
        <span key={label} className={styles.tacitSensoryTag}>
          {label}: {value}
        </span>
      ))}
    </div>
  );
}

function TacitItemMedia({ media }: { media: readonly PracticeTacitMedia[] }) {
  if (media.length === 0) return null;

  return (
    <div className={styles.tacitMediaList}>
      {media.map((m) => (
        <div key={m.id} className={styles.tacitMediaItem}>
          {m.media_type === 'image' ? (
            <img src={m.url} alt="" loading="lazy" />
          ) : (
            <video src={m.url} controls preload="metadata" />
          )}
        </div>
      ))}
    </div>
  );
}

const PracticeSessionFallbackPage = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const phase = usePracticeStore((s) => s.phase);
  const session = usePracticeStore((s) => s.session);
  const error = usePracticeStore((s) => s.error);
  const derived = usePracticeStore((s) => s.derived);
  const engineState = usePracticeStore((s) => s.engineState);
  const persistInFlight = usePracticeStore((s) => s.persistInFlight);
  const persistError = usePracticeStore((s) => s.persistError);

  const resumeSession = usePracticeStore((s) => s.resumeSession);
  const abandonSession = usePracticeStore((s) => s.abandonSession);
  const completeSession = usePracticeStore((s) => s.completeSession);
  const reset = usePracticeStore((s) => s.reset);
  const placeIngredient = usePracticeStore((s) => s.placeIngredient);
  const executeAction = usePracticeStore((s) => s.executeAction);
  const pour = usePracticeStore((s) => s.pour);

  const [guideIntensity, setGuideIntensity] = useState<GuideIntensity>('full');
  const [ingredientNames, setIngredientNames] = useState<ReadonlyMap<string, string>>(new Map());
  const fetchedMenuIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const { phase: p, session: s } = usePracticeStore.getState();
    if (p === 'idle' || (s !== null && s.id !== sessionId)) {
      resumeSession(sessionId);
    }
    return () => { reset(); };
  }, [sessionId, resumeSession, reset]);

  useEffect(() => {
    const menuId = session?.menu_id ?? null;
    if (phase !== 'active' || !engineState || !menuId) return;
    if (fetchedMenuIdRef.current === menuId) return;

    let cancelled = false;
    const ids = engineState.bundle.ingredient_nodes.map((n) => n.ingredient.ingredient_id);

    fetchIngredientDisplayNames(ids)
      .then((names) => {
        if (!cancelled) {
          setIngredientNames(names);
          fetchedMenuIdRef.current = menuId;
        }
      })
      .catch(() => {
        if (!cancelled) {
          fetchedMenuIdRef.current = menuId;
        }
      });

    return () => { cancelled = true; };
  }, [phase, session?.menu_id, engineState]);

  if (!sessionId) return null;

  const handleActionClick = (action: LegalAction) => {
    switch (action.type) {
      case 'place':
        placeIngredient(action.ingredientId, action.targetLocationId);
        break;
      case 'action':
        executeAction(action.actionType, action.locationId);
        break;
      case 'pour':
        pour(action.sourceLocationId, action.targetLocationId);
        break;
    }
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

  const tacitDetail: TacitDetailViewModel | null = engineState
    ? buildTacitDetailViewModel(engineState)
    : null;

  const nextPreview: NextGroupPreviewViewModel | null = engineState
    ? buildNextGroupPreview(engineState)
    : null;

  return (
    <div className={styles.container}>
      <h1>연습 세션</h1>

      <div className={styles.sessionInfo}>
        <p>세션 ID: {session?.id}</p>
        {session?.started_at && (
          <p>시작: {new Date(session.started_at).toLocaleString()}</p>
        )}
        {derived && (
          <p className={styles.progressText}>
            진행률: {derived.satisfiedNodes} / {derived.totalNodes}
          </p>
        )}
        {derived?.isComplete && (
          <span className={styles.statusBadge}>완료 가능</span>
        )}
      </div>

      {persistInFlight && (
        <p className={styles.persistIndicator}>저장 중...</p>
      )}
      {persistError && (
        <p className={styles.persistError}>저장 오류: {persistError}</p>
      )}

      {engineState && derived && (
        <div className={styles.guidePanel}>
          <div className={styles.intensityToggle}>
            {(['off', 'hint', 'full'] as const).map((level) => (
              <button
                key={level}
                className={guideIntensity === level ? styles.intensityButtonActive : styles.intensityButton}
                onClick={() => setGuideIntensity(level)}
              >
                {level === 'off' ? '끄기' : level === 'hint' ? '힌트' : '전체'}
              </button>
            ))}
          </div>

          {guideIntensity !== 'off' && (() => {
            const locationLabels = buildLocationLabelMap(engineState.bundle.locations);
            const rep = pickRepresentativeAction(derived.legalActions);
            return (
              <>
                {rep && (
                  <div className={styles.representativeAction}>
                    <div className={styles.representativeLabel}>예시 행동</div>
                    {formatFriendlyAction(rep, ingredientNames, locationLabels)}
                  </div>
                )}
                {guideIntensity === 'full' && derived.legalActions.length > 0 && (
                  <div className={styles.friendlyActionList}>
                    {derived.legalActions.map((action, idx) => (
                      <div key={idx} className={styles.friendlyActionItem}>
                        {formatFriendlyAction(action, ingredientNames, locationLabels)}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {tacitDetail && (
        <div className={styles.tacitPanel}>
          <div className={styles.tacitHeader}>
            <span className={styles.tacitStepNo}>
              Step {tacitDetail.stepGroup.display_step_no}
            </span>
            <span className={styles.tacitTitle}>
              {tacitDetail.stepGroup.title}
            </span>
            {tacitDetail.primaryLocationLabel && (
              <span className={styles.tacitLocationBadge}>
                {tacitDetail.primaryLocationLabel}
              </span>
            )}
          </div>

          {tacitDetail.stepGroup.summary && (
            <p className={styles.tacitSummary}>{tacitDetail.stepGroup.summary}</p>
          )}

          {tacitDetail.tacitItems.length > 0 ? (
            <div className={styles.tacitItemList}>
              {tacitDetail.tacitItems.map((item) => (
                <div key={item.id} className={styles.tacitItemCard}>
                  <div className={styles.tacitItemTitle}>{item.title}</div>
                  {item.body && (
                    <p className={styles.tacitItemBody}>{item.body}</p>
                  )}
                  <TacitItemMedia media={tacitDetail.tacitMediaByItemId.get(item.id) ?? []} />
                  <TacitSensoryNotes item={item} />
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.tacitEmptyHint}>
              이 단계의 암묵지가 아직 등록되지 않았습니다.
            </p>
          )}
        </div>
      )}

      {nextPreview && (
        <div className={styles.nextPreviewCard}>
          <div className={styles.nextPreviewHeader}>
            <span className={styles.nextPreviewLabel}>다음 단계</span>
          </div>
          <div className={styles.nextPreviewBody}>
            <span className={styles.nextPreviewStepNo}>
              Step {nextPreview.stepGroup.display_step_no}
            </span>
            <span className={styles.nextPreviewTitle}>
              {nextPreview.stepGroup.title}
            </span>
            {nextPreview.primaryLocationLabel && (
              <span className={styles.nextPreviewLocationBadge}>
                {nextPreview.primaryLocationLabel}
              </span>
            )}
          </div>
          {nextPreview.stepGroup.summary && (
            <p className={styles.nextPreviewSummary}>{nextPreview.stepGroup.summary}</p>
          )}
          {nextPreview.tacitItems.length > 0 && (
            <div className={styles.nextPreviewItemList}>
              {nextPreview.tacitItems.map((item) => (
                <div key={item.id} className={styles.nextPreviewItemTitle}>
                  {item.title}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <h3>가능한 액션</h3>
      {derived && derived.legalActions.length > 0 ? (
        <div className={styles.actionList}>
          {derived.legalActions.map((action, idx) => (
            <button
              key={idx}
              className={styles.actionButton}
              onClick={() => handleActionClick(action)}
            >
              {formatLegalAction(action)}
            </button>
          ))}
        </div>
      ) : (
        <p className={styles.subtitle}>가능한 액션이 없습니다.</p>
      )}

      <div className={styles.buttonRow}>
        <button
          className={styles.completeButton}
          disabled={!derived?.isComplete}
          onClick={completeSession}
        >
          연습 완료
        </button>
        <button
          className={styles.abandonButton}
          onClick={abandonSession}
        >
          포기
        </button>
      </div>

      <button
        className={styles.backButton}
        onClick={() => navigate('/practice')}
      >
        연습 목록으로
      </button>
    </div>
  );
};

export default PracticeSessionFallbackPage;
