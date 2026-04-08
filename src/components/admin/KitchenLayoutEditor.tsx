import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { uploadToStorage } from '../../lib/storage';
import type { PanelLayout, PanelEquipment, PanelItem, PanelMode, PanelEquipmentType, LocalEquipment, LocalItem } from './layout-editor/types';
import type { PanelItemType } from './layout-editor/types';
import type { EquipmentInteractionState } from '../../types/game';
import type { StoreIngredient, Container } from '../../types/db';
import {
  DEFAULT_PANEL_HEIGHTS,
  DEFAULT_PERSPECTIVE_DEG,
  DEFAULT_PREVIEW_Y_OFFSET,
  EQUIPMENT_DEFAULTS,
  dbToLocalEquipment,
  localToDbPayload,
  dbToLocalItem,
  localItemToDbPayload,
} from './layout-editor/types';
import LayoutToolbar from './layout-editor/LayoutToolbar';
import PanelEditor from './layout-editor/PanelEditor';
import { HANDLE_TOTAL_HEIGHT } from './layout-editor/PanelScene';
import EquipmentPalette from './layout-editor/EquipmentPalette';
import GridEditor from './layout-editor/GridEditor';
import FridgeInternalEditor from './layout-editor/FridgeInternalEditor';
import styles from './KitchenLayoutEditor.module.css';

interface Props {
  storeId: string;
  ingredients: StoreIngredient[];
  containers: Container[];
}

const KitchenLayoutEditor = ({ storeId, ingredients, containers }: Props) => {
  const [mode, setMode] = useState<PanelMode>('edit');
  const [layout, setLayout] = useState<PanelLayout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // 편집 중 로컬 상태
  const [localPanelHeights, setLocalPanelHeights] = useState<number[]>(DEFAULT_PANEL_HEIGHTS);
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // 미리보기 Y 위치
  const [localPreviewYOffset, setLocalPreviewYOffset] = useState(DEFAULT_PREVIEW_Y_OFFSET);
  // 미리보기 perspective 각도 (FOV deg). 슬라이더로 조절, DB에 영속화.
  const [localPerspectiveDeg, setLocalPerspectiveDeg] = useState<number>(DEFAULT_PERSPECTIVE_DEG);

  // 인터랙션 상태 (미리보기 전용, 로컬)
  const INITIAL_INTERACTION: EquipmentInteractionState = { drawers: {}, burners: {}, baskets: {}, foldFridges: {} };
  const [interactionState, setInteractionState] = useState<EquipmentInteractionState>(INITIAL_INTERACTION);

  // 장비 편집 상태
  const [localEquipment, setLocalEquipment] = useState<LocalEquipment[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [activePanelIndex, setActivePanelIndex] = useState(0);

  // scene 컨테이너 픽셀 크기 (PanelScene → PanelEditor → 여기). GridEditor 박스 종횡비 동기화용.
  const [sceneSize, setSceneSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const handleSceneSize = useCallback((size: { width: number; height: number }) => {
    setSceneSize((prev) => {
      if (prev.width === size.width && prev.height === size.height) return prev;
      return size;
    });
  }, []);

  // 아이템 (재료/그릇) 편집 상태
  const [localItems, setLocalItems] = useState<LocalItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // DB 원본 (변경 감지용)
  const [dbEquipmentSnapshot, setDbEquipmentSnapshot] = useState('[]');
  const [dbItemsSnapshot, setDbItemsSnapshot] = useState('[]');

  const hasChanges = (() => {
    if (!layout) {
      return (
        backgroundImageUrl !== null ||
        localEquipment.length > 0 ||
        Math.abs(localPreviewYOffset - DEFAULT_PREVIEW_Y_OFFSET) > 0.001 ||
        Math.abs(localPerspectiveDeg - DEFAULT_PERSPECTIVE_DEG) > 0.001
      );
    }
    const dbHeights = layout.panel_heights ?? DEFAULT_PANEL_HEIGHTS;
    const dbYOffset = layout.preview_y_offset ?? DEFAULT_PREVIEW_Y_OFFSET;
    const dbPerspectiveDeg = layout.perspective_deg ?? DEFAULT_PERSPECTIVE_DEG;
    return (
      backgroundImageUrl !== layout.background_image_url ||
      localPanelHeights.some((h, i) => Math.abs(h - dbHeights[i]) > 0.001) ||
      Math.abs(localPreviewYOffset - dbYOffset) > 0.001 ||
      Math.abs(localPerspectiveDeg - dbPerspectiveDeg) > 0.001 ||
      JSON.stringify(localEquipment) !== dbEquipmentSnapshot ||
      JSON.stringify(localItems) !== dbItemsSnapshot
    );
  })();

  // 탭 진입 시 데이터 로드
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const { data: layoutData, error: layoutErr } = await supabase
        .from('panel_layouts')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle();

      if (layoutErr) {
        setError(`레이아웃 로드 실패: ${layoutErr.message}`);
        setLoading(false);
        return;
      }

      if (layoutData) {
        const ld = layoutData as PanelLayout;
        setLayout(ld);
        setLocalPanelHeights(ld.panel_heights ?? DEFAULT_PANEL_HEIGHTS);
        setBackgroundImageUrl(ld.background_image_url);
        setLocalPreviewYOffset(ld.preview_y_offset ?? DEFAULT_PREVIEW_Y_OFFSET);
        setLocalPerspectiveDeg(ld.perspective_deg ?? DEFAULT_PERSPECTIVE_DEG);

        const { data: eqData, error: eqErr } = await supabase
          .from('panel_equipment')
          .select('*')
          .eq('layout_id', ld.id)
          .order('sort_order');

        if (eqErr) {
          setError(`장비 로드 실패: ${eqErr.message}`);
        } else {
          const loaded = ((eqData ?? []) as PanelEquipment[]).map(dbToLocalEquipment);
          setLocalEquipment(loaded);
          setDbEquipmentSnapshot(JSON.stringify(loaded));
        }

        // panel_items 로드
        const { data: itemData, error: itemErr } = await supabase
          .from('panel_items')
          .select('*')
          .eq('layout_id', ld.id)
          .order('sort_order');

        if (itemErr) {
          setError(`아이템 로드 실패: ${itemErr.message}`);
        } else {
          const loadedItems = ((itemData ?? []) as PanelItem[]).map(dbToLocalItem);
          setLocalItems(loadedItems);
          setDbItemsSnapshot(JSON.stringify(loadedItems));
        }
      } else {
        setLayout(null);
        setLocalPanelHeights(DEFAULT_PANEL_HEIGHTS);
        setBackgroundImageUrl(null);
        setLocalPreviewYOffset(DEFAULT_PREVIEW_Y_OFFSET);
        setLocalPerspectiveDeg(DEFAULT_PERSPECTIVE_DEG);
        setLocalEquipment([]);
        setDbEquipmentSnapshot('[]');
        setLocalItems([]);
        setDbItemsSnapshot('[]');
      }

      setLoading(false);
    };

    load();
  }, [storeId]);

  const handleModeChange = useCallback((newMode: PanelMode) => {
    setMode(newMode);
    if (newMode === 'preview') {
      setSelectedEquipmentId(null);
      setSelectedItemId(null);
    }
    if (newMode === 'edit') setInteractionState(INITIAL_INTERACTION);
  }, [INITIAL_INTERACTION]);

  // 선택 배타성 래퍼
  const handleSelectEquipment = useCallback((id: string | null) => {
    setSelectedEquipmentId(id);
    if (id !== null) setSelectedItemId(null);
  }, []);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    if (id !== null) setSelectedEquipmentId(null);
  }, []);

  // ——— 장비 CRUD ———

  const handleAddEquipment = useCallback(
    (type: PanelEquipmentType) => {
      // burner는 패널 2(index 1) 전용
      const targetPanel = type === 'burner' ? 1 : activePanelIndex;

      // equipment_index: 같은 타입 중 최대 + 1
      const sameType = localEquipment.filter((eq) => eq.equipmentType === type);
      const nextIndex = sameType.length > 0
        ? Math.max(...sameType.map((eq) => eq.equipmentIndex)) + 1
        : 0;

      const defaults = EQUIPMENT_DEFAULTS[type];
      const newEq: LocalEquipment = {
        id: crypto.randomUUID(),
        panelIndex: targetPanel,
        equipmentType: type,
        x: Math.max(0, 0.5 - defaults.width / 2),
        y: Math.max(0, 0.5 - defaults.height / 2),
        width: defaults.width,
        height: defaults.height,
        equipmentIndex: nextIndex,
        config: {},
        placeable: false,
        sortOrder: localEquipment.length,
      };

      setLocalEquipment((prev) => [...prev, newEq]);
      setSelectedEquipmentId(newEq.id);
    },
    [activePanelIndex, localEquipment],
  );

  const handleEquipmentChange = useCallback(
    (id: string, updates: Partial<LocalEquipment>) => {
      setLocalEquipment((prev) =>
        prev.map((eq) => {
          if (eq.id !== id) return eq;
          // burner 패널 제약: panelIndex 변경 시 검증
          if (updates.panelIndex !== undefined && eq.equipmentType === 'burner' && updates.panelIndex !== 1) {
            return eq; // 거부
          }
          return { ...eq, ...updates };
        }),
      );
    },
    [],
  );

  const handleDeleteEquipment = useCallback(
    (id: string) => {
      setLocalEquipment((prev) => prev.filter((eq) => eq.id !== id));
      setSelectedEquipmentId((prev) => (prev === id ? null : prev));
    },
    [],
  );

  const handleDuplicateEquipment = useCallback(
    (id: string) => {
      setLocalEquipment((prev) => {
        const source = prev.find((eq) => eq.id === id);
        if (!source) return prev;

        const sameType = prev.filter((eq) => eq.equipmentType === source.equipmentType);
        const nextIndex = Math.max(...sameType.map((eq) => eq.equipmentIndex)) + 1;

        const copy: LocalEquipment = {
          ...source,
          id: crypto.randomUUID(),
          x: Math.min(1 - source.width, source.x + 0.05),
          y: Math.min(1 - source.height, source.y + 0.05),
          equipmentIndex: nextIndex,
          sortOrder: prev.length,
        };

        setSelectedEquipmentId(copy.id);
        return [...prev, copy];
      });
    },
    [],
  );

  // ——— 아이템 CRUD ———

  const handleAddItem = useCallback(
    (type: PanelItemType) => {
      const newItem: LocalItem = {
        id: crypto.randomUUID(),
        panelIndex: activePanelIndex,
        itemType: type,
        x: Math.max(0, 0.5 - 0.06),
        y: Math.max(0, 0.5 - 0.075),
        width: 0.12,
        height: 0.15,
        ingredientId: null,
        containerId: null,
        sortOrder: localItems.length,
      };

      setLocalItems((prev) => [...prev, newItem]);
      handleSelectItem(newItem.id);
    },
    [activePanelIndex, localItems.length, handleSelectItem],
  );

  const handleItemChange = useCallback(
    (id: string, updates: Partial<LocalItem>) => {
      setLocalItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
    },
    [],
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      setLocalItems((prev) => prev.filter((item) => item.id !== id));
      setSelectedItemId((prev) => (prev === id ? null : prev));
    },
    [],
  );

  const handleDuplicateItem = useCallback(
    (id: string) => {
      setLocalItems((prev) => {
        const source = prev.find((item) => item.id === id);
        if (!source) return prev;

        const copy: LocalItem = {
          ...source,
          id: crypto.randomUUID(),
          x: Math.min(1 - source.width, source.x + 0.05),
          y: Math.min(1 - source.height, source.y + 0.05),
          sortOrder: prev.length,
        };

        handleSelectItem(copy.id);
        return [...prev, copy];
      });
    },
    [handleSelectItem],
  );

  // ——— DB 저장 ———

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const errors: string[] = [];

    try {
      // 1. panel_layouts UPSERT
      const layoutPayload = {
        store_id: storeId,
        background_image_url: backgroundImageUrl,
        panel_heights: localPanelHeights,
        perspective_deg: localPerspectiveDeg,
        preview_y_offset: localPreviewYOffset,
      };

      const { data: upsertedLayout, error: upsertErr } = await supabase
        .from('panel_layouts')
        .upsert(layoutPayload, { onConflict: 'store_id' })
        .select()
        .single();

      if (upsertErr) {
        errors.push(`레이아웃 저장 실패: ${upsertErr.message}`);
      }

      if (upsertedLayout && errors.length === 0) {
        const layoutId = (upsertedLayout as PanelLayout).id;

        // 2. 기존 장비 삭제
        const { error: delErr } = await supabase
          .from('panel_equipment')
          .delete()
          .eq('layout_id', layoutId);

        if (delErr) {
          errors.push(`기존 장비 삭제 실패: ${delErr.message}`);
        }

        // 3. 새 장비 삽입
        if (localEquipment.length > 0 && errors.length === 0) {
          const rows = localEquipment.map((eq) => localToDbPayload(eq, layoutId));

          const { error: insertErr } = await supabase
            .from('panel_equipment')
            .insert(rows);

          if (insertErr) {
            errors.push(`장비 저장 실패: ${insertErr.message}`);
          }
        }

        // 4. 기존 아이템 삭제
        if (errors.length === 0) {
          const { error: itemDelErr } = await supabase
            .from('panel_items')
            .delete()
            .eq('layout_id', layoutId);

          if (itemDelErr) {
            errors.push(`아이템 삭제 실패: ${itemDelErr.message}`);
          }
        }

        // 5. 새 아이템 삽입
        if (localItems.length > 0 && errors.length === 0) {
          const itemRows = localItems.map((it) => localItemToDbPayload(it, layoutId));

          const { error: itemInsertErr } = await supabase
            .from('panel_items')
            .insert(itemRows);

          if (itemInsertErr) {
            errors.push(`아이템 저장 실패: ${itemInsertErr.message}`);
          }
        }

        // 성공 시 layout state 갱신
        if (errors.length === 0) {
          setLayout(upsertedLayout as PanelLayout);
          setDbEquipmentSnapshot(JSON.stringify(localEquipment));
          setDbItemsSnapshot(JSON.stringify(localItems));
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : '알 수 없는 오류');
    }

    if (errors.length > 0) {
      setError(errors.join(', '));
    }

    setSaving(false);
  }, [storeId, backgroundImageUrl, localPanelHeights, localPreviewYOffset, layout, localEquipment, localItems]);

  const handleBackgroundUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadToStorage(file, 'kitchen-layouts');
      setBackgroundImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 업로드 실패');
    } finally {
      setUploading(false);
    }
  }, []);

  if (loading) {
    return (
      <div className={styles.editorRoot}>
        <div className={styles.loadingArea}>레이아웃 로드 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.editorRoot}>
        <div className={styles.errorArea}>{error}</div>
      </div>
    );
  }

  // 파생값: 그리드 편집 대상 장비
  const gridEditTarget = (() => {
    if (mode !== 'edit' || !selectedEquipmentId) return null;
    const eq = localEquipment.find((e) => e.id === selectedEquipmentId);
    if (!eq || (eq.equipmentType !== 'drawer' && eq.equipmentType !== 'basket')) return null;
    return eq;
  })();

  const fridgeEditTarget = (() => {
    if (mode !== 'edit' || !selectedEquipmentId) return null;
    const eq = localEquipment.find((e) => e.id === selectedEquipmentId);
    if (!eq || eq.equipmentType !== 'fold_fridge') return null;
    return eq;
  })();

  return (
    <div className={styles.editorRoot}>
      {mode === 'edit' && (
        <EquipmentPalette
          onAddEquipment={handleAddEquipment}
          onAddItem={handleAddItem}
          selectedItem={selectedItemId ? localItems.find((it) => it.id === selectedItemId) ?? null : null}
          ingredients={ingredients}
          containers={containers}
          onItemChange={handleItemChange}
        />
      )}
      <div className={styles.mainArea}>
        <LayoutToolbar
          mode={mode}
          onModeChange={handleModeChange}
          onSave={handleSave}
          saving={saving}
          hasChanges={hasChanges}
          perspectiveDeg={localPerspectiveDeg}
          onPerspectiveDegChange={setLocalPerspectiveDeg}
        />
        <div className={styles.contentArea}>
          <PanelEditor
            mode={mode}
            panelHeights={localPanelHeights}
            onPanelHeightsChange={setLocalPanelHeights}
            perspectiveDeg={localPerspectiveDeg}
            previewYOffset={localPreviewYOffset}
            onPreviewYOffsetChange={setLocalPreviewYOffset}
            backgroundImageUrl={backgroundImageUrl}
            onBackgroundUpload={handleBackgroundUpload}
            uploading={uploading}
            equipment={localEquipment}
            selectedEquipmentId={selectedEquipmentId}
            activePanelIndex={activePanelIndex}
            onActivePanelChange={setActivePanelIndex}
            onEquipmentChange={handleEquipmentChange}
            onSelectEquipment={handleSelectEquipment}
            onDeleteEquipment={handleDeleteEquipment}
            onDuplicateEquipment={handleDuplicateEquipment}
            interactionState={interactionState}
            onInteractionChange={setInteractionState}
            items={localItems}
            selectedItemId={selectedItemId}
            ingredients={ingredients}
            containers={containers}
            onItemChange={handleItemChange}
            onSelectItem={handleSelectItem}
            onDeleteItem={handleDeleteItem}
            onDuplicateItem={handleDuplicateItem}
            onSceneSize={handleSceneSize}
          />
          {gridEditTarget && (() => {
            // 드로어가 속한 패널의 픽셀 치수 계산.
            // GridEditor 박스 = in-game 서랍판 top-down 모양 (eq.width × panelPxW : depth × panelPxH).
            const gridPanelAreaH = Math.max(0, sceneSize.height - HANDLE_TOTAL_HEIGHT);
            const gridPanelPxW = sceneSize.width;
            const gridPanelPxH = gridPanelAreaH * (localPanelHeights[gridEditTarget.panelIndex] ?? 0.4);
            return (
            <GridEditor
              equipmentId={gridEditTarget.id}
              equipmentType={gridEditTarget.equipmentType as 'drawer' | 'basket'}
              config={gridEditTarget.config}
              equipmentWidth={gridEditTarget.width}
              equipmentDepth={
                typeof (gridEditTarget.config as Record<string, unknown>).depth === 'number'
                  ? ((gridEditTarget.config as Record<string, unknown>).depth as number)
                  : 0.5
              }
              panelPxW={gridPanelPxW}
              panelPxH={gridPanelPxH}
              maxWidth={Math.max(0.05, 1 - gridEditTarget.x)}
              ingredients={ingredients}
              onConfigChange={(id, newConfig) => handleEquipmentChange(id, { config: newConfig })}
              onDimensionsChange={(id, dims) => {
                const eq = localEquipment.find((e) => e.id === id);
                if (!eq) return;
                if (dims.width !== undefined) {
                  const clamped = Math.max(0.05, Math.min(1 - eq.x, dims.width));
                  handleEquipmentChange(id, { width: clamped });
                }
                if (dims.depth !== undefined) {
                  // 서랍 깊이는 config.depth에 저장 (eq.height 와는 독립)
                  handleEquipmentChange(id, {
                    config: { ...eq.config, depth: dims.depth },
                  });
                }
              }}
            />
            );
          })()}
          {fridgeEditTarget && (
            <FridgeInternalEditor
              equipmentId={fridgeEditTarget.id}
              config={fridgeEditTarget.config}
              ingredients={ingredients}
              onConfigChange={(id, newConfig) => handleEquipmentChange(id, { config: newConfig })}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default KitchenLayoutEditor;
