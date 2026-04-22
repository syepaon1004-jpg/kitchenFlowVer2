import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import type { Recipe } from '../types/db';
import styles from './GameSetupPage.module.css';

const GameSetupPage = () => {
  const navigate = useNavigate();
  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);
  const setSession = useGameStore((s) => s.setSession);
  const setActiveRecipeIds = useGameStore((s) => s.setActiveRecipeIds);

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [orderCount, setOrderCount] = useState(10);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const setTotalOrderCount = useGameStore((s) => s.setTotalOrderCount);

  // ── 레시피 조회 ──
  useEffect(() => {
    if (!selectedStore) return;
    const load = async () => {
      const { data } = await supabase
        .from('recipes')
        .select('*')
        .eq('store_id', selectedStore.id);
      if (data) setRecipes(data as Recipe[]);
    };
    load();
  }, [selectedStore]);

  // ── 검색 필터 ──
  const filteredRecipes = recipes.filter((r) =>
    r.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── 카테고리 그룹핑 ──
  const grouped = filteredRecipes.reduce<Record<string, Recipe[]>>((acc, recipe) => {
    const cat = recipe.category ?? '미분류';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(recipe);
    return acc;
  }, {});

  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === '미분류') return 1;
    if (b === '미분류') return -1;
    return a.localeCompare(b, 'ko');
  });

  // ── 선택 로직 ──
  const selectedSet = new Set(selectedIds);
  const totalCount = recipes.length;
  const selectedCount = selectedIds.length;

  const toggleRecipe = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const selectAll = () => setSelectedIds(recipes.map((r) => r.id));
  const deselectAll = () => setSelectedIds([]);

  const selectCategory = (cat: string) => {
    const catIds = grouped[cat].map((r) => r.id);
    setSelectedIds((prev) => [...new Set([...prev, ...catIds])]);
  };

  const deselectCategory = (cat: string) => {
    const catIds = new Set(grouped[cat].map((r) => r.id));
    setSelectedIds((prev) => prev.filter((id) => !catIds.has(id)));
  };

  const isCategoryAllSelected = (cat: string) =>
    grouped[cat].every((r) => selectedSet.has(r.id));

  const getCategorySelectedCount = (cat: string) =>
    grouped[cat].filter((r) => selectedSet.has(r.id)).length;

  // ── 접기/펼치기 ──
  const toggleCollapse = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) { next.delete(cat); } else { next.add(cat); }
      return next;
    });
  };

  // ── 게임 시작 (기존 로직 유지) ──
  const handleStart = async () => {
    if (selectedIds.length === 0 || !selectedStore || !selectedUser) return;
    setStarting(true);
    setError(null);

    const { data: session, error: err } = await supabase
      .from('game_sessions')
      .insert({
        store_id: selectedStore.id,
        user_id: selectedUser.id,
        active_recipe_ids: selectedIds,
        status: 'active',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (err || !session) {
      setError(err?.message ?? '세션 생성에 실패했습니다.');
      setStarting(false);
      return;
    }

    setSession(session.id, selectedStore.id);
    setActiveRecipeIds(selectedIds);
    setTotalOrderCount(orderCount);

    // 전체 zone 이미지 프리로드 (게임 진입 시 렉 방지)
    const { data: zones } = await supabase
      .from('kitchen_zones')
      .select('id, image_url')
      .eq('store_id', selectedStore.id);

    if (zones) {
      const decodePromises = zones
        .filter((z: { image_url: string | null }) => z.image_url)
        .map((z: { image_url: string | null }) => {
          const img = new Image();
          img.src = z.image_url!;
          return img.decode().catch(() => {});
        });
      await Promise.allSettled(decodePromises);
    }

    navigate('/sim/game');
  };

  return (
    <div className={styles.page}>
      {/* 헤더 */}
      <header className={styles.header}>
        <button
          className={styles.backButton}
          onClick={() => navigate('/sim/join/avatar')}
        >
          &larr; 돌아가기
        </button>
        <h1 className={styles.headerTitle}>메뉴 설정</h1>
        <span className={styles.storeName}>{selectedStore?.name}</span>
      </header>

      <div className={styles.content}>
        {/* 검색 */}
        <div className={styles.searchBox}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="레시피 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className={styles.searchClear}
              onClick={() => setSearchQuery('')}
            >
              &times;
            </button>
          )}
        </div>

        {/* 전역 선택/해제 + 카운터 */}
        <div className={styles.globalControls}>
          <span className={styles.globalCounter}>
            선택: {selectedCount}/{totalCount}개
          </span>
          <div className={styles.globalButtons}>
            <button
              className={styles.globalSelectButton}
              onClick={selectedCount === totalCount ? deselectAll : selectAll}
            >
              {selectedCount === totalCount ? '전체 해제' : '전체 선택'}
            </button>
          </div>
        </div>

        {/* 카테고리 리스트 */}
        {sortedCategories.length === 0 ? (
          <p className={styles.placeholder}>
            {recipes.length === 0
              ? '등록된 레시피가 없습니다.'
              : '검색 결과가 없습니다.'}
          </p>
        ) : (
          <div className={styles.categoryList}>
            {sortedCategories.map((cat) => {
              const catRecipes = grouped[cat];
              const catSelectedCount = getCategorySelectedCount(cat);
              const catTotal = catRecipes.length;
              const isCollapsed = collapsedCategories.has(cat);
              const allSelected = isCategoryAllSelected(cat);

              return (
                <div key={cat} className={styles.categoryGroup}>
                  <div className={styles.categoryHeader}>
                    <button
                      className={styles.collapseButton}
                      onClick={() => toggleCollapse(cat)}
                    >
                      {isCollapsed ? '▶' : '▼'}
                    </button>
                    <span className={styles.categoryName}>{cat}</span>
                    <span className={styles.categoryCounter}>
                      ({catSelectedCount}/{catTotal})
                    </span>
                    <button
                      className={styles.categorySelectButton}
                      onClick={() =>
                        allSelected ? deselectCategory(cat) : selectCategory(cat)
                      }
                    >
                      {allSelected ? '해제' : '전체'}
                    </button>
                  </div>

                  {!isCollapsed && (
                    <div className={styles.recipeList}>
                      {catRecipes.map((r) => (
                        <label key={r.id} className={styles.recipeItem}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={selectedSet.has(r.id)}
                            onChange={() => toggleRecipe(r.id)}
                          />
                          <span className={styles.recipeName}>{r.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 주문 수 설정 */}
        <div className={styles.orderCountSection}>
          <span className={styles.orderCountLabel}>주문 수</span>
          <div className={styles.orderCountControls}>
            {[1, 5, 10, 15, 20].map((n) => (
              <button
                key={n}
                className={`${styles.orderCountBtn} ${orderCount === n ? styles.orderCountBtnActive : ''}`}
                onClick={() => setOrderCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 하단 시작 버튼 */}
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.stickyBottom}>
        <button
          className={styles.startButton}
          disabled={selectedIds.length === 0 || starting}
          onClick={handleStart}
        >
          {starting
            ? '시작 중...'
            : selectedIds.length === 0
              ? '메뉴를 선택하세요'
              : `${selectedIds.length}개 메뉴 선택됨 — 게임 시작`}
        </button>
      </div>
    </div>
  );
};

export default GameSetupPage;
