import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { usePracticeStore } from '../../stores/practiceStore';
import { fetchPracticeMenuBundle } from '../../lib/practice/queries';
import { buildStepGroupBrowseList, TACIT_TYPE_LABELS } from '../../lib/practice/menuView';
import type { PracticeMenuBundle } from '../../types/practice';
import '../../styles/gameVariables.css';
import styles from './PracticePlaceholder.module.css';

const PracticeMenuPage = () => {
  const { menuId } = useParams();
  const navigate = useNavigate();

  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);

  const phase = usePracticeStore((s) => s.phase);
  const storeError = usePracticeStore((s) => s.error);
  const startSession = usePracticeStore((s) => s.startSession);

  const [bundle, setBundle] = useState<PracticeMenuBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!menuId) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setFetchError(null);
      try {
        const data = await fetchPracticeMenuBundle(menuId);
        if (!cancelled) setBundle(data);
      } catch (e: unknown) {
        if (!cancelled) setFetchError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => { cancelled = true; };
  }, [menuId]);

  if (!menuId) return null;

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleStart = async () => {
    if (!selectedUser || !selectedStore) return;
    setStarting(true);
    await startSession(menuId, selectedStore.id, selectedUser.id);
    const state = usePracticeStore.getState();
    if (state.phase === 'active' && state.session) {
      navigate(`/practice/session/${state.session.id}`);
    } else {
      setStarting(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1>메뉴 상세</h1>

      {loading && <p className={styles.loadingText}>메뉴 정보 불러오는 중...</p>}

      {fetchError && <p className={styles.errorText}>{fetchError}</p>}

      {!loading && !fetchError && bundle && (
        <>
          <h2>{bundle.menu.name}</h2>
          {bundle.menu.description && (
            <p className={styles.subtitle}>{bundle.menu.description}</p>
          )}

          <p className={styles.nodeSummary}>
            재료 노드 {bundle.ingredient_nodes.length}개 · 액션 노드 {bundle.action_nodes.length}개
          </p>

          {(() => {
            const browseList = buildStepGroupBrowseList(bundle);
            return browseList.length > 0 && (
              <>
                <h3>단계 개요</h3>
                <div className={styles.stepList}>
                  {browseList.map((vm) => {
                    const isExpanded = expandedGroups.has(vm.groupId);
                    return (
                      <div key={vm.groupId} className={styles.browseStepItem}>
                        <button
                          type="button"
                          className={styles.browseStepHeader}
                          onClick={() => toggleGroup(vm.groupId)}
                          aria-expanded={isExpanded}
                        >
                          <span className={styles.stepNo}>{vm.displayStepNo}.</span>
                          <div className={styles.browseStepHeaderText}>
                            <span className={styles.stepTitle}>{vm.title}</span>
                            {vm.primaryLocationLabel && (
                              <span className={styles.browseLocationBadge}>
                                {vm.primaryLocationLabel}
                              </span>
                            )}
                          </div>
                          <span className={styles.browseChevron}>
                            {isExpanded ? '\u25B2' : '\u25BC'}
                          </span>
                        </button>

                        {vm.summary && (
                          <p className={styles.browseStepSummary}>{vm.summary}</p>
                        )}

                        {isExpanded && vm.tacitPreviews.length > 0 && (
                          <ul className={styles.browseTacitList}>
                            {vm.tacitPreviews.map((tp) => (
                              <li key={tp.id} className={styles.browseTacitItem}>
                                <div className={styles.browseTacitRow}>
                                  <span className={styles.browseTacitTag}>
                                    {TACIT_TYPE_LABELS[tp.tacitType]}
                                  </span>
                                  <span className={styles.browseTacitTitle}>{tp.title}</span>
                                </div>
                                {tp.body && (
                                  <p className={styles.browseTacitBody}>{tp.body}</p>
                                )}
                                {tp.sensoryEntries.length > 0 && (
                                  <div className={styles.browseSensoryRow}>
                                    {tp.sensoryEntries.map((se) => (
                                      <span key={se.field} className={styles.browseSensoryTag}>
                                        <span className={styles.browseSensoryLabel}>{se.label}</span>
                                        {' '}
                                        {se.value}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {tp.mediaEntries.length > 0 && (
                                  <div className={styles.browseMediaRow}>
                                    {tp.mediaEntries.map((me) =>
                                      me.mediaType === 'image' ? (
                                        <img
                                          key={me.id}
                                          src={me.url}
                                          alt={tp.title}
                                          className={styles.browseMediaThumb}
                                          loading="lazy"
                                        />
                                      ) : (
                                        <video
                                          key={me.id}
                                          src={me.url}
                                          className={styles.browseVideoThumb}
                                          controls
                                          preload="metadata"
                                        />
                                      ),
                                    )}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isExpanded && vm.pureMediaPreviews.length > 0 && (
                          <div className={styles.browsePureMediaSection}>
                            {vm.pureMediaPreviews.map((pm) => (
                              <div key={pm.itemId} className={styles.browsePureMediaCard}>
                                <span className={styles.browsePureMediaTitle}>{pm.title}</span>
                                <div className={styles.browsePureMediaGrid}>
                                  {pm.media.map((me) =>
                                    me.mediaType === 'image' ? (
                                      <img
                                        key={me.id}
                                        src={me.url}
                                        alt={pm.title}
                                        className={styles.browsePureMediaImg}
                                        loading="lazy"
                                      />
                                    ) : (
                                      <video
                                        key={me.id}
                                        src={me.url}
                                        className={styles.browsePureMediaVideo}
                                        controls
                                        preload="metadata"
                                      />
                                    ),
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {isExpanded && vm.tacitPreviews.length === 0 && vm.pureMediaPreviews.length === 0 && (
                          <p className={styles.browseEmptyHint}>
                            등록된 암묵지 항목이 없습니다.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {phase === 'error' && storeError && (
            <p className={styles.errorText}>세션 시작 실패: {storeError}</p>
          )}

          {!selectedStore && (
            <p className={styles.hintText}>점포를 선택해야 연습을 시작할 수 있습니다.</p>
          )}

          {selectedStore && !selectedUser && (
            <p className={styles.hintText}>사용자를 선택한 후 연습을 시작할 수 있습니다.</p>
          )}

          <button
            className={styles.startButton}
            disabled={!selectedStore || !selectedUser || starting || phase === 'loading'}
            onClick={handleStart}
          >
            {starting || phase === 'loading' ? '시작하는 중...' : '연습 시작'}
          </button>
        </>
      )}

      <button className={styles.backButton} onClick={() => navigate('/practice')}>
        연습 목록으로
      </button>
    </div>
  );
};

export default PracticeMenuPage;
