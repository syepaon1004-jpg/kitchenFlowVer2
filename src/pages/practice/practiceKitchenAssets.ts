import { supabase } from '../../lib/supabase';
import type {
  PanelLayout,
  PanelEquipment,
  PanelItem,
  StoreIngredient,
} from '../../types/db';

export type PracticeKitchenAssets = {
  layout: PanelLayout;
  equipment: readonly PanelEquipment[];
  items: readonly PanelItem[];
  ingredientLabels: Map<string, string>;
};

// Practice 전용 single-row panel assets fetch.
// multi-row store(layouts.length !== 1)는 fail-closed → null 반환.
// runtime write 금지: game_equipment_state 생성 / setEquipments / setStoreIngredientsMap 호출 없음.
export async function fetchPracticeKitchenAssets(
  storeId: string,
): Promise<PracticeKitchenAssets | null> {
  const { data: layoutsData } = await supabase
    .from('panel_layouts')
    .select('*')
    .eq('store_id', storeId)
    .order('row_index');
  const layouts = (layoutsData ?? []) as PanelLayout[];
  if (layouts.length !== 1) return null;
  const layout = layouts[0];

  const [eqResult, itemResult, siResult] = await Promise.all([
    supabase
      .from('panel_equipment')
      .select('*')
      .eq('layout_id', layout.id)
      .order('sort_order'),
    supabase
      .from('panel_items')
      .select('*')
      .eq('layout_id', layout.id)
      .order('sort_order'),
    supabase.from('store_ingredients').select('*').eq('store_id', storeId),
  ]);

  const equipment = (eqResult.data ?? []) as PanelEquipment[];
  const items = (itemResult.data ?? []) as PanelItem[];
  const storeIngredients = (siResult.data ?? []) as StoreIngredient[];

  const ingredientLabels = new Map<string, string>();
  for (const si of storeIngredients) {
    ingredientLabels.set(si.id, si.display_name);
  }

  return { layout, equipment, items, ingredientLabels };
}
