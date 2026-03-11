import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import styles from './FeedPage.module.css';

interface SessionRow {
  id: string;
  score: number;
  started_at: string;
}

interface RecipeRow {
  id: string;
  name: string;
  category: string | null;
}

interface RecipeResultRow {
  recipe_id: string;
  is_success: boolean;
  error_count: number;
}

interface RecipeErrorRow {
  recipe_id: string;
}

type ChartMode = 'game' | 'daily';

const FeedPage = () => {
  const navigate = useNavigate();
  const selectedStore = useAuthStore((s) => s.selectedStore)!;
  const selectedUser = useAuthStore((s) => s.selectedUser)!;
  const storeId = selectedStore.id;
  const userId = selectedUser.id;

  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<ChartMode>('game');

  // 데이터
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [weakMenus, setWeakMenus] = useState<{ name: string; count: number }[]>([]);
  const [masteredMenus, setMasteredMenus] = useState<string[]>([]);
  const [categoryStats, setCategoryStats] = useState<
    { category: string; successRate: number; total: number }[]
  >([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // 1. 세션 + 레시피 병렬 조회
      const [sessionsRes, recipesRes] = await Promise.all([
        supabase
          .from('game_sessions')
          .select('id, score, started_at')
          .eq('user_id', userId)
          .eq('store_id', storeId)
          .not('score', 'is', null)
          .order('started_at', { ascending: false })
          .limit(30),
        supabase
          .from('recipes')
          .select('id, name, category')
          .eq('store_id', storeId),
      ]);

      const sessionsData = (sessionsRes.data as SessionRow[]) ?? [];
      const recipesData = (recipesRes.data as RecipeRow[]) ?? [];
      setSessions(sessionsData);

      const sessionIds = sessionsData.map((s) => s.id);
      if (sessionIds.length === 0) {
        setLoading(false);
        return;
      }

      // 2. errors + results 병렬 조회
      const [errorsRes, resultsRes] = await Promise.all([
        supabase
          .from('game_recipe_errors')
          .select('recipe_id')
          .in('session_id', sessionIds),
        supabase
          .from('game_recipe_results')
          .select('recipe_id, is_success, error_count')
          .in('session_id', sessionIds),
      ]);

      const errorsData = (errorsRes.data as RecipeErrorRow[]) ?? [];
      const resultsData = (resultsRes.data as RecipeResultRow[]) ?? [];

      const recipesMap = new Map(recipesData.map((r) => [r.id, r]));

      // ── 약한 메뉴: recipe_id별 오류 횟수 ──
      const errorCounts = new Map<string, number>();
      for (const e of errorsData) {
        errorCounts.set(e.recipe_id, (errorCounts.get(e.recipe_id) ?? 0) + 1);
      }
      const weakSorted = Array.from(errorCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([recipeId, count]) => ({
          name: recipesMap.get(recipeId)?.name ?? '알 수 없음',
          count,
        }));
      setWeakMenus(weakSorted);

      // ── 숙달된 메뉴: 성공 이력 있고 최근 7일 오류 없는 레시피 ──
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentSessionIds = new Set(
        sessionsData
          .filter((s) => new Date(s.started_at) > sevenDaysAgo)
          .map((s) => s.id),
      );

      // 최근 세션 오류 레시피
      const recentErrorRecipeIds = new Set<string>();
      // errorsData에는 session_id가 없으므로 별도 쿼리 필요
      if (recentSessionIds.size > 0) {
        const { data: recentErrorsData } = await supabase
          .from('game_recipe_errors')
          .select('recipe_id')
          .in('session_id', Array.from(recentSessionIds));
        if (recentErrorsData) {
          for (const e of recentErrorsData) {
            recentErrorRecipeIds.add((e as RecipeErrorRow).recipe_id);
          }
        }
      }

      const successRecipeIds = new Set(
        resultsData.filter((r) => r.is_success).map((r) => r.recipe_id),
      );
      const mastered = Array.from(successRecipeIds)
        .filter((id) => !recentErrorRecipeIds.has(id))
        .map((id) => recipesMap.get(id)?.name ?? '알 수 없음');
      setMasteredMenus(mastered);

      // ── 카테고리별 성과 ──
      const catMap = new Map<string, { total: number; success: number }>();
      for (const r of resultsData) {
        const recipe = recipesMap.get(r.recipe_id);
        const cat = recipe?.category ?? '미분류';
        const entry = catMap.get(cat) ?? { total: 0, success: 0 };
        entry.total++;
        if (r.is_success) entry.success++;
        catMap.set(cat, entry);
      }
      const catStats = Array.from(catMap.entries())
        .map(([category, { total, success }]) => ({
          category,
          successRate: total > 0 ? Math.round((success / total) * 100) : 0,
          total,
        }))
        .sort((a, b) => a.successRate - b.successRate);
      setCategoryStats(catStats);

      setLoading(false);
    };

    load();
  }, [userId, storeId]);

  // ── 차트 데이터 계산 ──
  const chartData = (() => {
    if (chartMode === 'game') {
      return sessions.map((s, i) => ({
        label: `#${sessions.length - i}`,
        score: s.score,
      })).reverse();
    }
    // 일 단위
    const dailyMap = new Map<string, { sum: number; count: number }>();
    for (const s of sessions) {
      const date = s.started_at.slice(0, 10);
      const entry = dailyMap.get(date) ?? { sum: 0, count: 0 };
      entry.sum += s.score;
      entry.count++;
      dailyMap.set(date, entry);
    }
    return Array.from(dailyMap.entries())
      .map(([date, { sum, count }]) => ({
        label: date.slice(5), // MM-DD
        score: Math.round(sum / count),
      }))
      .reverse();
  })();

  const maxScore = Math.max(...chartData.map((d) => d.score), 1);

  if (!selectedStore || !selectedUser) return null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate(-1)}>
          &larr; 뒤로
        </button>
        <h1 className={styles.headerTitle}>내 피드</h1>
        <span className={styles.storeName}>{selectedStore.name}</span>
      </header>

      <div className={styles.content}>
        {loading ? (
          <div className={styles.loading}>불러오는 중...</div>
        ) : sessions.length === 0 ? (
          <div className={styles.loading}>아직 플레이 기록이 없습니다</div>
        ) : (
          <>
            {/* ── 점수 추이 그래프 ── */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>점수 추이</span>
                <div className={styles.toggleGroup}>
                  <button
                    className={`${styles.toggleBtn} ${chartMode === 'game' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setChartMode('game')}
                  >
                    게임 단위
                  </button>
                  <button
                    className={`${styles.toggleBtn} ${chartMode === 'daily' ? styles.toggleBtnActive : ''}`}
                    onClick={() => setChartMode('daily')}
                  >
                    일 단위
                  </button>
                </div>
              </div>
              <div className={styles.sectionBody}>
                {chartData.length === 0 ? (
                  <div className={styles.empty}>데이터 없음</div>
                ) : (
                  <div className={styles.chartList}>
                    {chartData.map((d, i) => (
                      <div key={i} className={styles.chartRow}>
                        <span className={styles.chartLabel}>{d.label}</span>
                        <div className={styles.chartBarWrap}>
                          <div
                            className={styles.chartBar}
                            style={{ width: `${(d.score / maxScore) * 100}%` }}
                          />
                        </div>
                        <span className={styles.chartValue}>{d.score}점</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── 약한 메뉴 ── */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>약한 메뉴</span>
              </div>
              <div className={styles.sectionBody}>
                {weakMenus.length === 0 ? (
                  <div className={styles.empty}>오류 기록 없음</div>
                ) : (
                  <div className={styles.menuList}>
                    {weakMenus.map((m, i) => (
                      <div key={i} className={styles.menuItem}>
                        <span className={styles.menuName}>
                          {i + 1}. {m.name}
                        </span>
                        <span className={styles.menuCount}>오류 {m.count}회</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── 숙달된 메뉴 ── */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>숙달된 메뉴</span>
              </div>
              <div className={styles.sectionBody}>
                {masteredMenus.length === 0 ? (
                  <div className={styles.empty}>아직 숙달된 메뉴가 없습니다</div>
                ) : (
                  <div className={styles.tagList}>
                    {masteredMenus.map((name, i) => (
                      <span key={i} className={styles.tag}>
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── 카테고리별 성과 ── */}
            <div className={styles.section}>
              <div className={styles.sectionHeader}>
                <span className={styles.sectionTitle}>카테고리별 성과</span>
              </div>
              <div className={styles.sectionBody}>
                {categoryStats.length === 0 ? (
                  <div className={styles.empty}>데이터 없음</div>
                ) : (
                  <div className={styles.categoryList}>
                    {categoryStats.map((cat) => (
                      <div key={cat.category} className={styles.categoryRow}>
                        <div className={styles.categoryInfo}>
                          <span className={styles.categoryName}>{cat.category}</span>
                          <span className={styles.categoryRate}>
                            성공률 {cat.successRate}%
                          </span>
                        </div>
                        <div className={styles.categoryBarWrap}>
                          <div
                            className={styles.categoryBar}
                            style={{ width: `${cat.successRate}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FeedPage;
