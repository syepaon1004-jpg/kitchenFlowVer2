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

  // ── 체크박스 토글 ──
  const toggleRecipe = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  // ── 게임 시작 ──
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
    navigate('/game');
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>게임 설정</h1>

        {recipes.length === 0 ? (
          <p className={styles.placeholder}>등록된 레시피가 없습니다.</p>
        ) : (
          <div className={styles.recipeList}>
            {recipes.map((r) => (
              <label key={r.id} className={styles.recipeItem}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(r.id)}
                  onChange={() => toggleRecipe(r.id)}
                />
                {r.name}
              </label>
            ))}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <button
          className={styles.startButton}
          disabled={selectedIds.length === 0 || starting}
          onClick={handleStart}
        >
          {starting ? '시작 중...' : '게임 시작'}
        </button>
      </div>
    </div>
  );
};

export default GameSetupPage;
