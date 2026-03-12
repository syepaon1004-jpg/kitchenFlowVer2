import { useCallback, useEffect, useRef, useState } from 'react';
import type { AreaDefinition, BillQueueArea, KitchenZone, StoreIngredient, Container, IngredientsMaster, SectionConfig } from '../types/db';
import { supabase } from '../lib/supabase';
import { uploadToStorage } from '../lib/storage';
import { useAuthStore } from '../stores/authStore';
import HitboxEditor from '../components/admin/HitboxEditor';
import SectionEditor from '../components/admin/SectionEditor';
import HitboxEditorPanel from '../components/admin/HitboxEditorPanel';
import StoreIngredientsManager from '../components/admin/StoreIngredientsManager';
import RecipeManager from '../components/admin/RecipeManager';
import ContainersManager from '../components/admin/ContainersManager';
import AdminHeader from '../components/admin/AdminHeader';
import StaffManager from '../components/admin/StaffManager';
import styles from './AdminPage.module.css';

type AdminTab = 'hitbox' | 'ingredients' | 'containers' | 'recipe' | 'staff';

function getImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = reject;
    img.src = url;
  });
}

const AdminPage = () => {
  const selectedStore = useAuthStore((s) => s.selectedStore);
  const selectedUser = useAuthStore((s) => s.selectedUser);

  // Tab state
  const [activeTab, setActiveTab] = useState<AdminTab>('hitbox');

  // Reference data
  const [zones, setZones] = useState<KitchenZone[]>([]);
  const [ingredients, setIngredients] = useState<StoreIngredient[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [masterList, setMasterList] = useState<IngredientsMaster[]>([]);

  // Editor state
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaDefinition[]>([]);
  const [selectedArea, setSelectedArea] = useState<AreaDefinition | null>(null);

  // Add zone form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newZoneKey, setNewZoneKey] = useState('');
  const [newZoneLabel, setNewZoneLabel] = useState('');
  const [newZoneFile, setNewZoneFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load reference data on mount
  useEffect(() => {
    if (!selectedStore) return;
    const load = async () => {
      const [zonesRes, ingredientsRes, containersRes, masterRes] = await Promise.all([
        supabase.from('kitchen_zones').select('*').eq('store_id', selectedStore.id),
        supabase.from('store_ingredients').select('*').eq('store_id', selectedStore.id),
        supabase.from('containers').select('*').eq('store_id', selectedStore.id),
        supabase.from('ingredients_master').select('*'),
      ]);

      if (zonesRes.data) setZones(zonesRes.data as KitchenZone[]);
      if (ingredientsRes.data) setIngredients(ingredientsRes.data as StoreIngredient[]);
      if (containersRes.data) setContainers(containersRes.data as Container[]);
      if (masterRes.data) setMasterList(masterRes.data as IngredientsMaster[]);
    };
    load();
  }, [selectedStore]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;

  const handleAreasChange = useCallback((newAreas: AreaDefinition[]) => {
    setAreas(newAreas);
    // Keep selectedArea in sync with updated areas (e.g. after handle drag)
    setSelectedArea((prev) => {
      if (!prev) return null;
      return newAreas.find((a) => a.id === prev.id) ?? null;
    });
  }, []);

  const handleSelectArea = useCallback((area: AreaDefinition | null) => {
    setSelectedArea(area);
    if (area) {
      setBillQueuePlaceMode(false);
      setSelectedBillQueueIndex(null);
    }
  }, []);

  const handleSaved = useCallback(
    (saved: AreaDefinition) => {
      setAreas((prev) => {
        // Replace temp or existing area with saved version
        const idx = prev.findIndex(
          (a) => a.id === saved.id || (a.id.startsWith('temp-') && selectedArea?.id === a.id),
        );
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
      setSelectedArea(saved);
    },
    [selectedArea],
  );

  const handleDeleted = useCallback((id: string) => {
    setAreas((prev) => prev.filter((a) => a.id !== id));
    setSelectedArea(null);
  }, []);

  const handleSectionConfigSaved = useCallback(
    (config: SectionConfig) => {
      setZones((prev) =>
        prev.map((z) =>
          z.id === selectedZoneId ? { ...z, section_config: config } : z,
        ),
      );
    },
    [selectedZoneId],
  );

  // Bill queue areas
  const [billQueuePlaceMode, setBillQueuePlaceMode] = useState(false);
  const [selectedBillQueueIndex, setSelectedBillQueueIndex] = useState<number | null>(null);
  const isMainKitchen = selectedZone?.zone_key === 'main_kitchen';

  const handleBillQueueAreaChange = useCallback(
    (area: BillQueueArea) => {
      if (!selectedZoneId) return;
      setZones((prev) =>
        prev.map((z) => {
          if (z.id !== selectedZoneId) return z;
          const existing = z.bill_queue_areas ?? [];
          return { ...z, bill_queue_areas: [...existing, area] };
        }),
      );
    },
    [selectedZoneId],
  );

  const handleBillQueueAreasSaved = useCallback(
    (areas: BillQueueArea[] | null) => {
      if (!selectedZoneId) return;
      setZones((prev) =>
        prev.map((z) =>
          z.id === selectedZoneId ? { ...z, bill_queue_areas: areas } : z,
        ),
      );
    },
    [selectedZoneId],
  );

  const handleBillQueueAreaUpdate = useCallback(
    (index: number, updated: BillQueueArea) => {
      if (!selectedZoneId) return;
      setZones((prev) =>
        prev.map((z) => {
          if (z.id !== selectedZoneId) return z;
          const arr = [...(z.bill_queue_areas ?? [])];
          arr[index] = updated;
          return { ...z, bill_queue_areas: arr };
        }),
      );
    },
    [selectedZoneId],
  );

  const handleBillQueueAreaDelete = useCallback(
    (index: number) => {
      if (!selectedZoneId) return;
      setZones((prev) =>
        prev.map((z) => {
          if (z.id !== selectedZoneId) return z;
          const arr = (z.bill_queue_areas ?? []).filter((_, i) => i !== index);
          return { ...z, bill_queue_areas: arr.length > 0 ? arr : null };
        }),
      );
      setSelectedBillQueueIndex(null);
    },
    [selectedZoneId],
  );

  const handleDeleteZone = async (zone: KitchenZone) => {
    const confirmed = window.confirm(
      `'${zone.label}' 구역을 삭제하시겠습니까?\n이 구역에 배치된 히트박스도 모두 삭제됩니다.`,
    );
    if (!confirmed) return;

    const { error } = await supabase.from('kitchen_zones').delete().eq('id', zone.id);
    if (error) {
      alert(error.message);
      return;
    }

    setZones((prev) => prev.filter((z) => z.id !== zone.id));
    if (selectedZoneId === zone.id) {
      setSelectedZoneId(null);
      setSelectedArea(null);
      setAreas([]);
    }
  };

  const resetAddForm = () => {
    setShowAddForm(false);
    setNewZoneKey('');
    setNewZoneLabel('');
    setNewZoneFile(null);
    setAddError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleAddZone = async () => {
    if (!newZoneFile || !selectedStore) return;
    setAdding(true);
    setAddError(null);

    try {
      const [imageUrl, dims] = await Promise.all([
        uploadToStorage(newZoneFile, 'zones'),
        getImageDimensions(newZoneFile),
      ]);

      const { data, error } = await supabase
        .from('kitchen_zones')
        .insert({
          store_id: selectedStore.id,
          zone_key: newZoneKey.trim(),
          label: newZoneLabel.trim(),
          image_url: imageUrl,
          image_width: dims.w,
          image_height: dims.h,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          setAddError('이미 존재하는 zone_key입니다');
        } else {
          setAddError(error.message);
        }
        setAdding(false);
        return;
      }

      const newZone = data as KitchenZone;
      setZones((prev) => [...prev, newZone]);
      setSelectedZoneId(newZone.id);
      setSelectedArea(null);
      resetAddForm();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setAdding(false);
    }
  };

  const canSubmit = newZoneKey.trim() !== '' && newZoneLabel.trim() !== '' && newZoneFile !== null;

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
          히트박스 편집
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
      </div>

      {/* Hitbox editor tab — hidden via display:none to preserve state */}
      <div
        className={styles.hitboxLayout}
        style={{
          display: activeTab === 'hitbox' ? 'grid' : 'none',
          gridTemplateRows: selectedZone ? '1fr auto' : '1fr',
        }}
      >
        {/* Left: Zone list */}
        <div className={styles.zoneList}>
          <h3>Zones</h3>
          {zones.map((zone) => (
            <button
              key={zone.id}
              className={`${styles.zoneItem} ${zone.id === selectedZoneId ? styles.zoneItemActive : ''}`}
              onClick={() => {
                setSelectedZoneId(zone.id);
                setSelectedArea(null);
              }}
            >
              <span>{zone.label}</span>
              <span
                className={styles.zoneDeleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteZone(zone);
                }}
              >
                ✕
              </span>
            </button>
          ))}

          {!showAddForm ? (
            <button
              className={styles.addZoneBtn}
              onClick={() => setShowAddForm(true)}
            >
              + 주방 구역 추가
            </button>
          ) : (
            <div className={styles.addZoneForm}>
              {addError && <div className={styles.addZoneError}>{addError}</div>}
              <input
                type="text"
                placeholder="zone_key"
                value={newZoneKey}
                onChange={(e) => setNewZoneKey(e.target.value)}
                className={styles.addZoneInput}
              />
              <input
                type="text"
                placeholder="표시 이름"
                value={newZoneLabel}
                onChange={(e) => setNewZoneLabel(e.target.value)}
                className={styles.addZoneInput}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => setNewZoneFile(e.target.files?.[0] ?? null)}
                className={styles.addZoneInput}
              />
              <div className={styles.addZoneActions}>
                <button
                  onClick={handleAddZone}
                  disabled={!canSubmit || adding}
                  className={styles.addZoneSubmit}
                >
                  {adding ? '추가 중...' : '추가'}
                </button>
                <button
                  onClick={resetAddForm}
                  disabled={adding}
                  className={styles.addZoneCancel}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Center: Hitbox editor */}
        <div className={styles.editorArea}>
          <HitboxEditor
            zoneId={selectedZoneId}
            zoneImageUrl={selectedZone?.image_url ?? null}
            selectedAreaId={selectedArea?.id ?? null}
            onSelectArea={handleSelectArea}
            areas={areas}
            onAreasChange={handleAreasChange}
            storeId={selectedStore.id}
            imageWidth={selectedZone?.image_width}
            imageHeight={selectedZone?.image_height}
            billQueueAreas={selectedZone?.bill_queue_areas ?? null}
            billQueuePlaceMode={billQueuePlaceMode}
            onBillQueueAreaChange={handleBillQueueAreaChange}
            isMainKitchen={isMainKitchen}
            selectedBillQueueIndex={selectedBillQueueIndex}
            onSelectBillQueueIndex={setSelectedBillQueueIndex}
          />
        </div>

        {/* Right: Property panel */}
        <div className={styles.panelArea}>
          <HitboxEditorPanel
            area={selectedArea}
            zones={zones}
            ingredients={ingredients}
            containers={containers}
            areas={areas}
            onAreasChange={handleAreasChange}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            zoneId={selectedZoneId}
            billQueueAreas={selectedZone?.bill_queue_areas ?? null}
            onBillQueueAreasSaved={handleBillQueueAreasSaved}
            billQueuePlaceMode={billQueuePlaceMode}
            onBillQueuePlaceModeChange={(mode: boolean) => {
              setBillQueuePlaceMode(mode);
              if (mode) setSelectedArea(null);
            }}
            isMainKitchen={isMainKitchen}
            selectedBillQueueIndex={selectedBillQueueIndex}
            onSelectBillQueueIndex={setSelectedBillQueueIndex}
            onBillQueueAreaUpdate={handleBillQueueAreaUpdate}
            onBillQueueAreaDelete={handleBillQueueAreaDelete}
          />
        </div>

        {/* Section editor — below hitbox editor, same column */}
        {selectedZone && (
          <div className={styles.sectionEditorArea}>
            <div className={styles.sectionEditorWrapper}>
              <SectionEditor
                zoneId={selectedZone.id}
                initialConfig={selectedZone.section_config}
                imageUrl={selectedZone.image_url}
                onSaved={handleSectionConfigSaved}
              />
            </div>
          </div>
        )}
      </div>

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
    </div>
  );
};

export default AdminPage;
