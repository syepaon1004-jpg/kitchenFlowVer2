import { useCallback, useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { uploadToStorage } from '../../lib/storage';
import type { PanelLayout, PanelEquipment, PanelItem, PanelMode, PanelEquipmentType, LocalEquipment, LocalItem, ImageFitMode } from './layout-editor/types';
import type { PanelItemType } from './layout-editor/types';
import type { EquipmentInteractionState } from '../../types/game';
import type { StoreIngredient, Container, SectionGrid, SectionCell } from '../../types/db';
import type { EditorView } from '../../types/section';
import {
  DEFAULT_PANEL_HEIGHTS,
  DEFAULT_PERSPECTIVE_DEG,
  DEFAULT_PREVIEW_Y_OFFSET,
  DEFAULT_IMAGE_FIT_MODE,
  LEGACY_IMAGE_FIT_MODE,
  EQUIPMENT_DEFAULTS,
  dbToLocalEquipment,
  localToDbPayload,
  dbToLocalItem,
  localItemToDbPayload,
} from './layout-editor/types';
import { normalizeOversizedY } from '../../lib/equipment-position';
import LayoutToolbar from './layout-editor/LayoutToolbar';
import PanelEditor from './layout-editor/PanelEditor';
import { HANDLE_TOTAL_HEIGHT } from './layout-editor/PanelScene';
import EquipmentPalette from './layout-editor/EquipmentPalette';
import GridEditor from './layout-editor/GridEditor';
import FridgeInternalEditor from './layout-editor/FridgeInternalEditor';
import GridOverview from './layout-editor/GridOverview';
import SectionFocusEditor, { computeCenterX } from './layout-editor/SectionFocusEditor';
import '../../styles/adminVariables.css';
import styles from './KitchenLayoutEditor.module.css';

const INITIAL_INTERACTION: EquipmentInteractionState = { drawers: {}, burners: {}, baskets: {}, foldFridges: {}, fourBoxFridges: {} };

/** 행별 로컬 데이터 */
interface RowData {
  layout: PanelLayout | null;
  panelHeights: number[];
  backgroundImageUrl: string | null;
  previewYOffset: number;
  perspectiveDeg: number;
  imageFitMode: ImageFitMode;
  equipment: LocalEquipment[];
  items: LocalItem[];
  dbEquipmentSnapshot: string;
  dbItemsSnapshot: string;
}

function createDefaultRowData(): RowData {
  return {
    layout: null,
    panelHeights: DEFAULT_PANEL_HEIGHTS,
    backgroundImageUrl: null,
    previewYOffset: DEFAULT_PREVIEW_Y_OFFSET,
    perspectiveDeg: DEFAULT_PERSPECTIVE_DEG,
    imageFitMode: DEFAULT_IMAGE_FIT_MODE,
    equipment: [],
    items: [],
    dbEquipmentSnapshot: '[]',
    dbItemsSnapshot: '[]',
  };
}

interface Props {
  storeId: string;
  ingredients: StoreIngredient[];
  containers: Container[];
}

const KitchenLayoutEditor = ({ storeId, ingredients, containers }: Props) => {
  // ——— 에디터 뷰 상태 ———
  const [editorView, setEditorView] = useState<EditorView>('grid');
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);

  const [mode, setMode] = useState<PanelMode>('edit');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ——— 섹션 그리드 상태 ———
  const [gridRows, setGridRows] = useState(1);
  const [gridCols, setGridCols] = useState(1);
  const [sectionCells, setSectionCells] = useState<SectionCell[]>([]);
  const [dbGridSnapshot, setDbGridSnapshot] = useState('');
  const [dbCellsSnapshot, setDbCellsSnapshot] = useState('[]');

  // ——— 행별 데이터 ———
  const [rowDataMap, setRowDataMap] = useState<Map<number, RowData>>(new Map());

  // 현재 활성 행 데이터
  const currentRowData = activeRowIndex !== null ? rowDataMap.get(activeRowIndex) : undefined;

  // 전 행 통합 장비 목록 (equipment_index 전역 유니크 계산용)
  const allRowsEquipment = useMemo(() => {
    const all: LocalEquipment[] = [];
    for (const rd of rowDataMap.values()) {
      all.push(...rd.equipment);
    }
    return all;
  }, [rowDataMap]);

  // 인터랙션 상태 (미리보기 전용, 로컬)
  const [interactionState, setInteractionState] = useState<EquipmentInteractionState>(INITIAL_INTERACTION);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [activePanelIndex, setActivePanelIndex] = useState(0);
  const [sceneSize, setSceneSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  // 섹션 포커스 대상 셀
  const [focusCell, setFocusCell] = useState<SectionCell | null>(null);

  const handleSceneSize = useCallback((size: { width: number; height: number }) => {
    setSceneSize((prev) => {
      if (prev.width === size.width && prev.height === size.height) return prev;
      return size;
    });
  }, []);

  // ——— 변경 감지 ———
  const hasChanges = useMemo(() => {
    // 그리드 메타 변경
    const gridChanged = JSON.stringify({ gridRows, gridCols }) !== dbGridSnapshot;
    const cellsChanged = JSON.stringify(sectionCells) !== dbCellsSnapshot;
    if (gridChanged || cellsChanged) return true;

    // 행별 데이터 변경
    for (const rd of rowDataMap.values()) {
      if (!rd.layout) {
        if (rd.backgroundImageUrl !== null || rd.equipment.length > 0) return true;
        continue;
      }
      const dbHeights = rd.layout.panel_heights ?? DEFAULT_PANEL_HEIGHTS;
      const dbFitMode = rd.layout.image_fit_mode ?? LEGACY_IMAGE_FIT_MODE;
      if (
        rd.backgroundImageUrl !== rd.layout.background_image_url ||
        rd.panelHeights.some((h, i) => Math.abs(h - dbHeights[i]) > 0.001) ||
        Math.abs(rd.previewYOffset - (rd.layout.preview_y_offset ?? DEFAULT_PREVIEW_Y_OFFSET)) > 0.001 ||
        Math.abs(rd.perspectiveDeg - (rd.layout.perspective_deg ?? DEFAULT_PERSPECTIVE_DEG)) > 0.001 ||
        rd.imageFitMode !== dbFitMode ||
        JSON.stringify(rd.equipment) !== rd.dbEquipmentSnapshot ||
        JSON.stringify(rd.items) !== rd.dbItemsSnapshot
      ) return true;
    }
    return false;
  }, [gridRows, gridCols, sectionCells, dbGridSnapshot, dbCellsSnapshot, rowDataMap]);

  // ——— 데이터 로드 ———
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      // 1. section_grid 로드
      const { data: gridData } = await supabase
        .from('section_grid')
        .select('*')
        .eq('store_id', storeId)
        .maybeSingle();

      const gr = (gridData as SectionGrid | null)?.grid_rows ?? 1;
      const gc = (gridData as SectionGrid | null)?.grid_cols ?? 1;
      setGridRows(gr);
      setGridCols(gc);
      setDbGridSnapshot(JSON.stringify({ gridRows: gr, gridCols: gc }));

      // 2. section_cells 로드
      const { data: cellsData } = await supabase
        .from('section_cells')
        .select('*')
        .eq('store_id', storeId);

      const cells = (cellsData ?? []) as SectionCell[];
      setSectionCells(cells);
      setDbCellsSnapshot(JSON.stringify(cells));

      // 3. 전 행 panel_layouts 로드
      const { data: layoutsData, error: layoutsErr } = await supabase
        .from('panel_layouts')
        .select('*')
        .eq('store_id', storeId)
        .order('row_index');

      if (layoutsErr) {
        setError(`레이아웃 로드 실패: ${layoutsErr.message}`);
        setLoading(false);
        return;
      }

      const layouts = (layoutsData ?? []) as PanelLayout[];
      const newMap = new Map<number, RowData>();

      for (const ld of layouts) {
        const rd = createDefaultRowData();
        rd.layout = ld;
        rd.panelHeights = ld.panel_heights ?? DEFAULT_PANEL_HEIGHTS;
        rd.backgroundImageUrl = ld.background_image_url;
        rd.previewYOffset = ld.preview_y_offset ?? DEFAULT_PREVIEW_Y_OFFSET;
        rd.perspectiveDeg = ld.perspective_deg ?? DEFAULT_PERSPECTIVE_DEG;
        rd.imageFitMode = ld.image_fit_mode ?? LEGACY_IMAGE_FIT_MODE;

        // 장비 로드
        const { data: eqData } = await supabase
          .from('panel_equipment')
          .select('*')
          .eq('layout_id', ld.id)
          .order('sort_order');

        const loaded = ((eqData ?? []) as PanelEquipment[]).map(dbToLocalEquipment);
        rd.equipment = loaded;
        rd.dbEquipmentSnapshot = JSON.stringify(loaded);

        // 아이템 로드
        const { data: itemData } = await supabase
          .from('panel_items')
          .select('*')
          .eq('layout_id', ld.id)
          .order('sort_order');

        const loadedItems = ((itemData ?? []) as PanelItem[]).map(dbToLocalItem);
        rd.items = loadedItems;
        rd.dbItemsSnapshot = JSON.stringify(loadedItems);

        newMap.set(ld.row_index, rd);
      }

      // 그리드에 행이 있지만 layout이 없는 경우 기본 RowData 생성
      for (let r = 0; r < gr; r++) {
        if (!newMap.has(r)) {
          newMap.set(r, createDefaultRowData());
        }
      }

      setRowDataMap(newMap);
      setLoading(false);
    };

    load();
  }, [storeId]);

  // ——— 행 데이터 업데이트 헬퍼 ———
  const updateRowData = useCallback((rowIndex: number, updater: (prev: RowData) => RowData) => {
    setRowDataMap((prev) => {
      const next = new Map(prev);
      const rd = next.get(rowIndex) ?? createDefaultRowData();
      next.set(rowIndex, updater(rd));
      return next;
    });
  }, []);

  // ——— 뷰 전환 핸들러 ———
  const handleEditorViewChange = useCallback((view: EditorView) => {
    setEditorView(view);
    if (view === 'grid') {
      setSelectedEquipmentId(null);
      setSelectedItemId(null);
      setFocusCell(null);
    }
  }, []);

  const handleRowSelect = useCallback((rowIndex: number) => {
    // 해당 행에 RowData가 없으면 생성
    setRowDataMap((prev) => {
      if (prev.has(rowIndex)) return prev;
      const next = new Map(prev);
      next.set(rowIndex, createDefaultRowData());
      return next;
    });
    setActiveRowIndex(rowIndex);
    setEditorView('row');
    setMode('edit');
    setSelectedEquipmentId(null);
    setSelectedItemId(null);
    setInteractionState(INITIAL_INTERACTION);
  }, []);

  const handleModeChange = useCallback((newMode: PanelMode) => {
    setMode(newMode);
    if (newMode === 'preview') {
      setSelectedEquipmentId(null);
      setSelectedItemId(null);
    }
    if (newMode === 'edit') setInteractionState(INITIAL_INTERACTION);
  }, []);

  // 선택 배타성 래퍼
  const handleSelectEquipment = useCallback((id: string | null) => {
    setSelectedEquipmentId(id);
    if (id !== null) setSelectedItemId(null);
  }, []);

  const handleSelectItem = useCallback((id: string | null) => {
    setSelectedItemId(id);
    if (id !== null) setSelectedEquipmentId(null);
  }, []);

  // ——— 그리드 편집 ———

  const handleGridResize = useCallback((rows: number, cols: number) => {
    setGridRows(rows);
    setGridCols(cols);
    // 범위 밖 셀 제거
    setSectionCells((prev) =>
      prev.filter((c) => c.row_index < rows && c.col_index < cols),
    );
    // 새 행에 대한 RowData 생성
    setRowDataMap((prev) => {
      const next = new Map(prev);
      for (let r = 0; r < rows; r++) {
        if (!next.has(r)) next.set(r, createDefaultRowData());
      }
      return next;
    });
  }, []);

  const handleCellToggle = useCallback((rowIndex: number, colIndex: number) => {
    setSectionCells((prev) => {
      const existing = prev.find((c) => c.row_index === rowIndex && c.col_index === colIndex);
      if (existing) {
        // 셀 제거
        return prev.filter((c) => c !== existing);
      }
      // 셀 추가: 다음 사용 가능한 section_number
      const usedNumbers = new Set(prev.map((c) => c.section_number));
      let nextNum = 1;
      while (usedNumbers.has(nextNum)) nextNum++;
      const newCell: SectionCell = {
        id: crypto.randomUUID(),
        store_id: storeId,
        section_number: nextNum,
        row_index: rowIndex,
        col_index: colIndex,
        rep_equipment_type: null,
        rep_equipment_index: null,
        created_at: new Date().toISOString(),
      };
      return [...prev, newCell];
    });
  }, [storeId]);

  const handleCellSectionNumberChange = useCallback((rowIndex: number, colIndex: number, sectionNumber: number) => {
    setSectionCells((prev) =>
      prev.map((c) =>
        c.row_index === rowIndex && c.col_index === colIndex
          ? { ...c, section_number: sectionNumber }
          : c,
      ),
    );
  }, []);

  // ——— 섹션 포커스 ———

  const handleSectionFocusEnter = useCallback((cell: SectionCell) => {
    setFocusCell(cell);
    setEditorView('section');
  }, []);

  const handleRepresentativeChange = useCallback((
    rowIndex: number,
    colIndex: number,
    repType: string | null,
    repIndex: number | null,
  ) => {
    setSectionCells((prev) =>
      prev.map((c) =>
        c.row_index === rowIndex && c.col_index === colIndex
          ? { ...c, rep_equipment_type: repType, rep_equipment_index: repIndex }
          : c,
      ),
    );
    // focusCell도 갱신
    setFocusCell((prev) => {
      if (!prev || prev.row_index !== rowIndex || prev.col_index !== colIndex) return prev;
      return { ...prev, rep_equipment_type: repType, rep_equipment_index: repIndex };
    });
  }, []);

  // ——— 장비 CRUD (현재 행 기준, index는 전 행 통합) ———

  const handleAddEquipment = useCallback(
    (type: PanelEquipmentType) => {
      if (activeRowIndex === null) return;
      const targetPanel = type === 'burner' ? 1 : activePanelIndex;

      // equipment_index: 전 행 통합 같은 타입 중 최대 + 1
      const sameType = allRowsEquipment.filter((eq) => eq.equipmentType === type);
      const nextIndex = sameType.length > 0
        ? Math.max(...sameType.map((eq) => eq.equipmentIndex)) + 1
        : 0;

      const defaults = EQUIPMENT_DEFAULTS[type];
      const newEq: LocalEquipment = {
        id: crypto.randomUUID(),
        panelIndex: targetPanel,
        equipmentType: type,
        x: Math.max(0, 0.5 - defaults.width / 2),
        y: normalizeOversizedY(Math.max(0, 0.5 - defaults.height / 2), defaults.height),
        width: defaults.width,
        height: defaults.height,
        equipmentIndex: nextIndex,
        config: {},
        placeable: false,
        sortOrder: (currentRowData?.equipment.length ?? 0),
      };

      updateRowData(activeRowIndex, (rd) => ({
        ...rd,
        equipment: [...rd.equipment, newEq],
      }));
      setSelectedEquipmentId(newEq.id);
    },
    [activePanelIndex, allRowsEquipment, activeRowIndex, currentRowData, updateRowData],
  );

  const handleEquipmentChange = useCallback(
    (id: string, updates: Partial<LocalEquipment>) => {
      if (activeRowIndex === null) return;
      updateRowData(activeRowIndex, (rd) => ({
        ...rd,
        equipment: rd.equipment.map((eq) => {
          if (eq.id !== id) return eq;
          if (updates.panelIndex !== undefined && eq.equipmentType === 'burner' && updates.panelIndex !== 1) {
            return eq;
          }
          return { ...eq, ...updates };
        }),
      }));
    },
    [activeRowIndex, updateRowData],
  );

  const handleDeleteEquipment = useCallback(
    (id: string) => {
      if (activeRowIndex === null) return;
      updateRowData(activeRowIndex, (rd) => ({
        ...rd,
        equipment: rd.equipment.filter((eq) => eq.id !== id),
      }));
      setSelectedEquipmentId((prev) => (prev === id ? null : prev));
    },
    [activeRowIndex, updateRowData],
  );

  const handleDuplicateEquipment = useCallback(
    (id: string) => {
      if (activeRowIndex === null) return;
      updateRowData(activeRowIndex, (rd) => {
        const source = rd.equipment.find((eq) => eq.id === id);
        if (!source) return rd;

        // 전 행 통합 같은 타입 중 최대 + 1
        const sameType = allRowsEquipment.filter((eq) => eq.equipmentType === source.equipmentType);
        const nextIndex = Math.max(...sameType.map((eq) => eq.equipmentIndex)) + 1;

        const copy: LocalEquipment = {
          ...source,
          id: crypto.randomUUID(),
          x: Math.min(1 - source.width, source.x + 0.05),
          y: normalizeOversizedY(Math.min(1 - source.height, source.y + 0.05), source.height),
          equipmentIndex: nextIndex,
          sortOrder: rd.equipment.length,
          config: JSON.parse(JSON.stringify(source.config)) as Record<string, unknown>,
        };

        setSelectedEquipmentId(copy.id);
        return { ...rd, equipment: [...rd.equipment, copy] };
      });
    },
    [activeRowIndex, allRowsEquipment, updateRowData],
  );

  // ——— 아이템 CRUD ———

  const handleAddItem = useCallback(
    (type: PanelItemType) => {
      if (activeRowIndex === null) return;
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
        sortOrder: currentRowData?.items.length ?? 0,
      };

      updateRowData(activeRowIndex, (rd) => ({
        ...rd,
        items: [...rd.items, newItem],
      }));
      handleSelectItem(newItem.id);
    },
    [activePanelIndex, activeRowIndex, currentRowData, updateRowData, handleSelectItem],
  );

  const handleItemChange = useCallback(
    (id: string, updates: Partial<LocalItem>) => {
      if (activeRowIndex === null) return;
      updateRowData(activeRowIndex, (rd) => ({
        ...rd,
        items: rd.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      }));
    },
    [activeRowIndex, updateRowData],
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      if (activeRowIndex === null) return;
      updateRowData(activeRowIndex, (rd) => ({
        ...rd,
        items: rd.items.filter((item) => item.id !== id),
      }));
      setSelectedItemId((prev) => (prev === id ? null : prev));
    },
    [activeRowIndex, updateRowData],
  );

  const handleDuplicateItem = useCallback(
    (id: string) => {
      if (activeRowIndex === null) return;
      updateRowData(activeRowIndex, (rd) => {
        const source = rd.items.find((item) => item.id === id);
        if (!source) return rd;

        const copy: LocalItem = {
          ...source,
          id: crypto.randomUUID(),
          x: Math.min(1 - source.width, source.x + 0.05),
          y: Math.min(1 - source.height, source.y + 0.05),
          sortOrder: rd.items.length,
        };

        handleSelectItem(copy.id);
        return { ...rd, items: [...rd.items, copy] };
      });
    },
    [activeRowIndex, updateRowData, handleSelectItem],
  );

  // ——— 현재 행 파생값 ———
  const localPanelHeights = currentRowData?.panelHeights ?? DEFAULT_PANEL_HEIGHTS;
  const backgroundImageUrl = currentRowData?.backgroundImageUrl ?? null;
  const localPreviewYOffset = currentRowData?.previewYOffset ?? DEFAULT_PREVIEW_Y_OFFSET;
  const localPerspectiveDeg = currentRowData?.perspectiveDeg ?? DEFAULT_PERSPECTIVE_DEG;
  const localImageFitMode = currentRowData?.imageFitMode ?? DEFAULT_IMAGE_FIT_MODE;
  const localEquipment = currentRowData?.equipment ?? [];
  const localItems = currentRowData?.items ?? [];

  // 행별 setter 래퍼
  const setLocalPanelHeights = useCallback((heights: number[]) => {
    if (activeRowIndex === null) return;
    updateRowData(activeRowIndex, (rd) => ({ ...rd, panelHeights: heights }));
  }, [activeRowIndex, updateRowData]);

  const setLocalPreviewYOffset = useCallback((offset: number) => {
    if (activeRowIndex === null) return;
    updateRowData(activeRowIndex, (rd) => ({ ...rd, previewYOffset: offset }));
  }, [activeRowIndex, updateRowData]);

  const setLocalPerspectiveDeg = useCallback((deg: number) => {
    if (activeRowIndex === null) return;
    updateRowData(activeRowIndex, (rd) => ({ ...rd, perspectiveDeg: deg }));
  }, [activeRowIndex, updateRowData]);

  const setLocalImageFitMode = useCallback((fitMode: ImageFitMode) => {
    if (activeRowIndex === null) return;
    updateRowData(activeRowIndex, (rd) => ({ ...rd, imageFitMode: fitMode }));
  }, [activeRowIndex, updateRowData]);

  const handleBackgroundUpload = useCallback(async (file: File) => {
    if (activeRowIndex === null) return;
    setUploading(true);
    try {
      const url = await uploadToStorage(file, 'kitchen-layouts');
      updateRowData(activeRowIndex, (rd) => ({ ...rd, backgroundImageUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : '배경 업로드 실패');
    } finally {
      setUploading(false);
    }
  }, [activeRowIndex, updateRowData]);

  // ——— DB 저장 ———

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const errors: string[] = [];

    try {
      // Step 0: 삭제된 행의 panel_layouts 삭제 (CASCADE로 equipment/items도 삭제)
      const activeRowIndices = new Set<number>();
      for (let r = 0; r < gridRows; r++) {
        // 이 행에 비어있지 않은 셀이 있는지 확인
        const hasCells = sectionCells.some((c) => c.row_index === r);
        if (hasCells || rowDataMap.has(r)) {
          activeRowIndices.add(r);
        }
      }
      // DB에 있는 모든 행 중 activeRowIndices에 없는 행 삭제
      for (const [rowIdx, rd] of rowDataMap) {
        if (!activeRowIndices.has(rowIdx) && rd.layout) {
          const { error: delErr } = await supabase
            .from('panel_layouts')
            .delete()
            .eq('id', rd.layout.id);
          if (delErr) errors.push(`행 ${rowIdx} 삭제 실패: ${delErr.message}`);
        }
      }

      // Step 1: 행별 panel_layouts upsert
      const layoutIdByRow = new Map<number, string>();
      for (const rowIdx of activeRowIndices) {
        const rd = rowDataMap.get(rowIdx) ?? createDefaultRowData();
        const payload = {
          store_id: storeId,
          row_index: rowIdx,
          background_image_url: rd.backgroundImageUrl,
          panel_heights: rd.panelHeights,
          perspective_deg: rd.perspectiveDeg,
          preview_y_offset: rd.previewYOffset,
          image_fit_mode: rd.imageFitMode,
        };

        const { data: upserted, error: upsertErr } = await supabase
          .from('panel_layouts')
          .upsert(payload, { onConflict: 'store_id,row_index' })
          .select()
          .single();

        if (upsertErr) {
          errors.push(`행 ${rowIdx} 레이아웃 저장 실패: ${upsertErr.message}`);
        } else if (upserted) {
          layoutIdByRow.set(rowIdx, (upserted as PanelLayout).id);
        }
      }

      if (errors.length > 0) {
        setError(errors.join(', '));
        setSaving(false);
        return;
      }

      // Step 2-3: 행별 equipment/items delete+insert
      for (const rowIdx of activeRowIndices) {
        const layoutId = layoutIdByRow.get(rowIdx);
        if (!layoutId) continue;
        const rd = rowDataMap.get(rowIdx) ?? createDefaultRowData();

        // 장비 삭제+삽입
        const { error: eqDelErr } = await supabase
          .from('panel_equipment')
          .delete()
          .eq('layout_id', layoutId);
        if (eqDelErr) errors.push(`행 ${rowIdx} 장비 삭제 실패: ${eqDelErr.message}`);

        if (rd.equipment.length > 0 && !eqDelErr) {
          const rows = rd.equipment.map((eq) => localToDbPayload(eq, layoutId));
          const { error: eqInsErr } = await supabase.from('panel_equipment').insert(rows);
          if (eqInsErr) errors.push(`행 ${rowIdx} 장비 저장 실패: ${eqInsErr.message}`);
        }

        // 아이템 삭제+삽입
        const { error: itemDelErr } = await supabase
          .from('panel_items')
          .delete()
          .eq('layout_id', layoutId);
        if (itemDelErr) errors.push(`행 ${rowIdx} 아이템 삭제 실패: ${itemDelErr.message}`);

        if (rd.items.length > 0 && !itemDelErr) {
          const itemRows = rd.items.map((it) => localItemToDbPayload(it, layoutId));
          const { error: itemInsErr } = await supabase.from('panel_items').insert(itemRows);
          if (itemInsErr) errors.push(`행 ${rowIdx} 아이템 저장 실패: ${itemInsErr.message}`);
        }
      }

      // Step 4: section_grid upsert
      const { error: gridErr } = await supabase
        .from('section_grid')
        .upsert({
          store_id: storeId,
          grid_rows: gridRows,
          grid_cols: gridCols,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'store_id' });
      if (gridErr) errors.push(`그리드 저장 실패: ${gridErr.message}`);

      // Step 5: section_cells delete + insert
      const { error: cellDelErr } = await supabase
        .from('section_cells')
        .delete()
        .eq('store_id', storeId);
      if (cellDelErr) errors.push(`셀 삭제 실패: ${cellDelErr.message}`);

      if (sectionCells.length > 0 && !cellDelErr) {
        const cellRows = sectionCells.map((c) => ({
          store_id: storeId,
          section_number: c.section_number,
          row_index: c.row_index,
          col_index: c.col_index,
          rep_equipment_type: c.rep_equipment_type,
          rep_equipment_index: c.rep_equipment_index,
        }));
        const { error: cellInsErr } = await supabase.from('section_cells').insert(cellRows);
        if (cellInsErr) errors.push(`셀 저장 실패: ${cellInsErr.message}`);
      }

      // 성공 시 스냅샷 갱신
      if (errors.length === 0) {
        setDbGridSnapshot(JSON.stringify({ gridRows, gridCols }));
        setDbCellsSnapshot(JSON.stringify(sectionCells));
        // rowDataMap 스냅샷 갱신
        setRowDataMap((prev) => {
          const next = new Map(prev);
          for (const [rowIdx, rd] of next) {
            const layoutId = layoutIdByRow.get(rowIdx);
            if (layoutId) {
              next.set(rowIdx, {
                ...rd,
                layout: {
                  id: layoutId,
                  store_id: storeId,
                  row_index: rowIdx,
                  background_image_url: rd.backgroundImageUrl,
                  panel_heights: rd.panelHeights,
                  perspective_deg: rd.perspectiveDeg,
                  preview_y_offset: rd.previewYOffset,
                  image_fit_mode: rd.imageFitMode,
                  created_at: rd.layout?.created_at ?? new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                dbEquipmentSnapshot: JSON.stringify(rd.equipment),
                dbItemsSnapshot: JSON.stringify(rd.items),
              });
            }
          }
          return next;
        });
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : '알 수 없는 오류');
    }

    if (errors.length > 0) {
      setError(errors.join(', '));
    }

    setSaving(false);
  }, [storeId, gridRows, gridCols, sectionCells, rowDataMap]);

  if (loading) {
    return (
      <div className={styles.editorRoot}>
        <div className={styles.loadingArea}>레이아웃 로드 중...</div>
      </div>
    );
  }

  // 에러는 인라인 표시 (뷰 전환 가능하게)
  const errorBanner = error ? (
    <div className={styles.errorArea} style={{ height: 'auto', padding: '8px 16px' }}>{error}</div>
  ) : null;

  // 파생값: 그리드/냉장고 편집 대상
  const gridEditTarget = (() => {
    if (editorView !== 'row' || mode !== 'edit' || !selectedEquipmentId) return null;
    const eq = localEquipment.find((e) => e.id === selectedEquipmentId);
    if (!eq || (eq.equipmentType !== 'drawer' && eq.equipmentType !== 'basket')) return null;
    return eq;
  })();

  const fridgeEditTarget = (() => {
    if (editorView !== 'row' || mode !== 'edit' || !selectedEquipmentId) return null;
    const eq = localEquipment.find((e) => e.id === selectedEquipmentId);
    if (!eq || (eq.equipmentType !== 'fold_fridge' && eq.equipmentType !== 'four_box_fridge')) return null;
    return eq;
  })();

  return (
    <div className={styles.editorRoot}>
      {editorView === 'row' && mode === 'edit' && (
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
          editorView={editorView}
          onEditorViewChange={handleEditorViewChange}
          activeRowIndex={activeRowIndex}
          onSave={handleSave}
          saving={saving}
          hasChanges={hasChanges}
          perspectiveDeg={localPerspectiveDeg}
          onPerspectiveDegChange={setLocalPerspectiveDeg}
        />
        {errorBanner}
        <div className={styles.contentArea}>
          {/* Grid Overview */}
          {editorView === 'grid' && (
            <GridOverview
              gridRows={gridRows}
              gridCols={gridCols}
              cells={sectionCells}
              onGridResize={handleGridResize}
              onCellToggle={handleCellToggle}
              onCellSectionNumberChange={handleCellSectionNumberChange}
              onRowSelect={handleRowSelect}
            />
          )}

          {/* Row Scene Editor */}
          {editorView === 'row' && activeRowIndex !== null && (
            <>
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
                imageFitMode={localImageFitMode}
                onImageFitModeChange={setLocalImageFitMode}
                gridCols={gridCols}
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
              {/* 이 행의 섹션 셀 목록 (섹션 포커스 진입용) */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {sectionCells
                  .filter((c) => c.row_index === activeRowIndex)
                  .sort((a, b) => a.col_index - b.col_index)
                  .map((cell) => (
                    <button
                      key={cell.id}
                      type="button"
                      className={styles.toolbarBtn}
                      onClick={() => handleSectionFocusEnter(cell)}
                    >
                      섹션 {cell.section_number} 포커스
                    </button>
                  ))}
              </div>
              {gridEditTarget && (() => {
                const gridPanelAreaH = Math.max(0, sceneSize.height - HANDLE_TOTAL_HEIGHT);
                const gridPanelPxW = sceneSize.width;
                const gridPanelPxH = gridPanelAreaH * (localPanelHeights[gridEditTarget.panelIndex] ?? 0.4);
                return (
                  <GridEditor
                    key={gridEditTarget.id}
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
                  equipmentType={fridgeEditTarget.equipmentType}
                  config={fridgeEditTarget.config}
                  ingredients={ingredients}
                  onConfigChange={(id, newConfig) => handleEquipmentChange(id, { config: newConfig })}
                />
              )}
            </>
          )}

          {/* Section Focus Editor — Row Scene 편집 + 대표 장비 선택. scrollLeft는 focusCenterX로 제어 */}
          {editorView === 'section' && focusCell && activeRowIndex !== null && (
            <SectionFocusEditor
              cell={focusCell}
              rowEquipment={localEquipment}
              onRepresentativeChange={handleRepresentativeChange}
              onBack={() => setEditorView('row')}
            >
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
                imageFitMode={localImageFitMode}
                onImageFitModeChange={setLocalImageFitMode}
                gridCols={gridCols}
                focusCenterX={computeCenterX(focusCell, localEquipment)}
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
            </SectionFocusEditor>
          )}
        </div>
      </div>
    </div>
  );
};

export default KitchenLayoutEditor;
