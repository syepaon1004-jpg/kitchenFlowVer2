import { useEffect, useState } from 'react';
import type { StoreIngredient, Container, IngredientsMaster } from '../types/db';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import StoreIngredientsManager from '../components/admin/StoreIngredientsManager';
import RecipeManager from '../components/admin/RecipeManager';
import ContainersManager from '../components/admin/ContainersManager';
import AdminHeader from '../components/admin/AdminHeader';
import StaffManager from '../components/admin/StaffManager';
import KitchenLayoutEditor from '../components/admin/KitchenLayoutEditor';
import styles from './AdminPage.module.css';

type AdminTab = 'hitbox' | 'ingredients' | 'containers' | 'recipe' | 'staff' | 'kitchen-layout';

const AdminPage = () => {
  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);

  // Tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('kitchen-layout');

  // Reference data (shared across tabs)
  const [ingredients, setIngredients] = useState<StoreIngredient[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [masterList, setMasterList] = useState<IngredientsMaster[]>([]);

  // Load reference data on mount
  useEffect(() => {
    if (!selectedStore) return;
    const load = async () => {
      const [ingredientsRes, containersRes, masterRes] = await Promise.all([
        supabase.from('store_ingredients').select('*').eq('store_id', selectedStore.id),
        supabase.from('containers').select('*').eq('store_id', selectedStore.id),
        supabase.from('ingredients_master').select('*'),
      ]);

      if (ingredientsRes.data) setIngredients(ingredientsRes.data as StoreIngredient[]);
      if (containersRes.data) setContainers(containersRes.data as Container[]);
      if (masterRes.data) setMasterList(masterRes.data as IngredientsMaster[]);
    };
    load();
  }, [selectedStore]);

  if (!selectedStore) return null;

  return (
    <div className={styles.adminRoot}>
      <AdminHeader />
      {/* Tab bar */}
      <div className={styles.tabBar}>
        <button
          className={`${styles.tabButton} ${activeTab === 'hitbox' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('hitbox')}
        >
          히트박스 편집 (비활성)
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'ingredients' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('ingredients')}
        >
          재료 관리
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'containers' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('containers')}
        >
          용기 관리
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'recipe' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('recipe')}
        >
          레시피 관리
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'staff' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('staff')}
        >
          직원 관리
        </button>
        <button
          className={`${styles.tabButton} ${activeTab === 'kitchen-layout' ? styles.tabButtonActive : ''}`}
          onClick={() => setActiveTab('kitchen-layout')}
        >
          주방 레이아웃
        </button>
      </div>

      {/* Hitbox editor tab — 패널 시스템으로 교체 예정 */}
      {activeTab === 'hitbox' && (
        <div className={styles.tabContent}>
          <div className={styles.disabledTabNotice}>
            <p>이 탭은 패널 시스템으로 교체 예정입니다.</p>
            <p>"주방 레이아웃" 탭을 사용해주세요.</p>
          </div>
        </div>
      )}

      {/* Ingredients tab */}
      {activeTab === 'ingredients' && (
        <div className={styles.tabContent}>
          <StoreIngredientsManager
            storeId={selectedStore.id}
            ingredients={ingredients}
            setIngredients={setIngredients}
            masterList={masterList}
          />
        </div>
      )}

      {/* Containers tab */}
      {activeTab === 'containers' && (
        <div className={styles.tabContent}>
          <ContainersManager
            storeId={selectedStore.id}
            containers={containers}
            setContainers={setContainers}
          />
        </div>
      )}

      {/* Recipe tab */}
      {activeTab === 'recipe' && (
        <div className={styles.tabContent}>
          <RecipeManager
            storeId={selectedStore.id}
            ingredients={ingredients}
            containers={containers}
          />
        </div>
      )}

      {/* Staff tab */}
      {activeTab === 'staff' && selectedUser && (
        <div className={styles.tabContent}>
          <StaffManager
            storeId={selectedStore.id}
            currentUserId={selectedUser.id}
          />
        </div>
      )}

      {/* Kitchen layout tab */}
      {activeTab === 'kitchen-layout' && (
        <div className={styles.tabContent}>
          <KitchenLayoutEditor storeId={selectedStore.id} ingredients={ingredients} containers={containers} />
        </div>
      )}
    </div>
  );
};

export default AdminPage;
