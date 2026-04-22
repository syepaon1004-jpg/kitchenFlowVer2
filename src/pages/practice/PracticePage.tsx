import { useState, useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import { fetchPracticeMenus } from '../../lib/practice/queries';
import type { PracticeMenu } from '../../types/practice';
import '../../styles/gameVariables.css';
import styles from './PracticePlaceholder.module.css';

const PracticePage = () => {
  const navigate = useNavigate();
  const selectedStore = useAuthStore((s) => s.selectedStore);
  const user = useAuthStore((s) => s.user);
  const selectedUser = useAuthStore((s) => s.selectedUser);

  const [menus, setMenus] = useState<PracticeMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [hasAdminAvatarInStore, setHasAdminAvatarInStore] = useState(false);

  const handleImageError = (menuId: string) => {
    setBrokenImages((prev) => {
      const next = new Set(prev);
      next.add(menuId);
      return next;
    });
  };

  useEffect(() => {
    if (!selectedStore) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPracticeMenus(selectedStore.id);
        if (!cancelled) setMenus(data);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => { cancelled = true; };
  }, [selectedStore]);

  useEffect(() => {
    setHasAdminAvatarInStore(false);
    if (!selectedStore || !user) return;
    let cancelled = false;

    (async () => {
      const { data, error: queryError } = await supabase
        .from('store_users')
        .select('id')
        .eq('store_id', selectedStore.id)
        .eq('auth_user_id', user.id)
        .eq('role', 'admin')
        .is('deleted_at', null)
        .limit(1);
      if (cancelled) return;
      if (!queryError) setHasAdminAvatarInStore((data?.length ?? 0) > 0);
    })();

    return () => { cancelled = true; };
  }, [selectedStore, user]);

  if (!selectedStore) {
    return <Navigate to="/sim/join" replace />;
  }

  return (
    <div className={styles.container}>
      <h1>메뉴 연습</h1>

      {loading && <p className={styles.loadingText}>메뉴 목록 불러오는 중...</p>}

      {error && <p className={styles.errorText}>{error}</p>}

      {!loading && !error && menus.length === 0 && (
        <div className={styles.emptyCta}>
          <p className={styles.subtitle}>등록된 메뉴가 없습니다.</p>
          {hasAdminAvatarInStore &&
            selectedUser?.role === 'admin' &&
            selectedUser.store_id === selectedStore.id && (
              <button
                className={styles.startButton}
                onClick={() => navigate('/practice/admin')}
              >
                연습 메뉴 관리
              </button>
            )}
          {hasAdminAvatarInStore &&
            !(
              selectedUser?.role === 'admin' &&
              selectedUser.store_id === selectedStore.id
            ) && (
              <>
                <p className={styles.hintText}>
                  연습 메뉴 생성/수정은 관리자 아바타 선택 후 가능합니다.
                </p>
                <button
                  className={styles.startButton}
                  onClick={() => navigate('/sim/join/avatar')}
                >
                  관리자 아바타 선택
                </button>
              </>
            )}
        </div>
      )}

      {!loading && !error && menus.length > 0 && (
        <div className={styles.menuList}>
          {menus.map((menu) => {
            const showImage = menu.image_url != null && menu.image_url.trim() !== '' && !brokenImages.has(menu.id);
            return (
              <button
                key={menu.id}
                className={showImage ? styles.menuCardWithImage : styles.menuCard}
                onClick={() => navigate(`/practice/menu/${menu.id}`)}
              >
                {showImage && (
                  <img
                    src={menu.image_url!}
                    alt={menu.name}
                    className={styles.menuCardThumb}
                    loading="lazy"
                    onError={() => handleImageError(menu.id)}
                  />
                )}
                <div className={showImage ? styles.menuCardTextWrap : undefined}>
                  <p className={styles.menuCardName}>{menu.name}</p>
                  {menu.description && (
                    <p className={styles.menuCardDesc}>{menu.description}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button className={styles.backButton} onClick={() => navigate('/')}>
        홈으로
      </button>
    </div>
  );
};

export default PracticePage;
