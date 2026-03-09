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
    navigate('/join/avatar');
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
    navigate('/');
  };

  return (
    <header className={styles.header}>
      <button className={styles.backButton} onClick={() => navigate(-1)}>
        ← 돌아가기
      </button>
      <div className={styles.spacer} />
      <button className={styles.actionButton} onClick={handleLogout}>
        로그아웃
      </button>
      <button className={styles.actionButton} onClick={handleQuit}>
        중단
      </button>
    </header>
  );
}
