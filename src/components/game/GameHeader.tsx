import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useGameStore } from '../../stores/gameStore';
import { useAuthStore } from '../../stores/authStore';
import styles from './GameHeader.module.css';

export default function GameHeader() {
  const navigate = useNavigate();
  const sessionId = useGameStore((s) => s.sessionId);
  const resetGame = useGameStore((s) => s.reset);
  const clearAuth = useAuthStore((s) => s.clear);

  const handleQuit = async () => {
    if (!sessionId) return;

    try {
      await supabase
        .from('game_sessions')
        .update({ status: 'abandoned', ended_at: new Date().toISOString() })
        .eq('id', sessionId);
    } catch {
      // DB 실패해도 로컬 정리 진행
    }

    resetGame();
    navigate('/sim/join/avatar');
  };

  const handleLogout = async () => {
    try {
      if (sessionId) {
        await supabase
          .from('game_sessions')
          .update({ status: 'abandoned', ended_at: new Date().toISOString() })
          .eq('id', sessionId);
      }
    } catch {
      // DB 실패해도 로컬 정리 진행
    }

    resetGame();
    await supabase.auth.signOut();
    clearAuth();
    navigate('/sim');
  };

  return (
    <div className={styles.header}>
      <button className={styles.floatingBtn} onClick={() => navigate(-1)}>
        🏠
      </button>
      <div className={styles.rightGroup}>
        <button className={styles.floatingBtn} onClick={handleLogout}>
          로그아웃
        </button>
        <button className={styles.floatingBtn} onClick={handleQuit}>
          중단
        </button>
      </div>
    </div>
  );
}
