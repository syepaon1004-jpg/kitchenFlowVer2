import { useNavigate } from 'react-router-dom';
import styles from './HomePage.module.css';

const HomePage = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Kitchen Simulator</h1>
      <div className={styles.buttons}>
        <button className={styles.navButton} onClick={() => navigate('/sim')}>
          시뮬레이션
        </button>
        <button className={styles.navButton} onClick={() => navigate('/practice')}>
          메뉴 연습
        </button>
      </div>
    </div>
  );
};

export default HomePage;
