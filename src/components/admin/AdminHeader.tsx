import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import styles from './AdminHeader.module.css';

const AdminHeader = () => {
  const navigate = useNavigate();
  const storeName = useAuthStore((s) => s.selectedStore?.name);
  const clearAuth = useAuthStore((s) => s.clear);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    clearAuth();
    navigate('/');
  };

  return (
    <header className={styles.header}>
      <button
        className={styles.backButton}
        onClick={() => navigate('/join')}
      >
        &larr; 돌아가기
      </button>
      <span className={styles.storeName}>{storeName}</span>
      <div className={styles.spacer} />
      <button className={styles.logoutButton} onClick={handleLogout}>
        로그아웃
      </button>
    </header>
  );
};

export default AdminHeader;
