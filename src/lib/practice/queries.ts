import { supabase } from '../supabase';
import type {
  PracticeMenu,
  PracticeLocation,
  PracticeRecipeNode,
  PracticeIngredientNode,
  PracticeActionNode,
  PracticeActionType,
  PracticeNodeLocationPath,
  PracticeStepGroup,
  PracticeStepGroupNode,
  PracticeTacitItem,
  PracticeTacitMedia,
  PracticeTacitMediaType,
  PracticeTacitType,
  PracticeSession,
  PracticeSessionStatus,
  PracticeIngredientInstance,
  PracticeNodeProgress,
  PracticeIngredientNodeWithPath,
  PracticeActionNodeWithLocation,
  PracticeMenuBundle,
} from '../../types/practice';
import type {
  PersistableInstanceRow,
  PersistableProgressRow,
} from './runtime';

function raise(context: string, message: string): never {
  throw new Error(`practice.${context}: ${message}`);
}

export async function fetchPracticeMenus(storeId: string): Promise<PracticeMenu[]> {
  const { data, error } = await supabase
    .from('practice_menus')
    .select('id, store_id, name, description, image_url, created_at')
    .eq('store_id', storeId)
    .order('created_at');
  if (error) raise('fetchPracticeMenus', error.message);
  return (data ?? []) as PracticeMenu[];
}

export async function fetchPracticeMenu(menuId: string): Promise<PracticeMenu | null> {
  const { data, error } = await supabase
    .from('practice_menus')
    .select('id, store_id, name, description, image_url, created_at')
    .eq('id', menuId)
    .maybeSingle();
  if (error) raise('fetchPracticeMenu', error.message);
  return (data as PracticeMenu | null) ?? null;
}

export async function fetchPracticeLocations(menuId: string): Promise<PracticeLocation[]> {
  const { data, error } = await supabase
    .from('practice_locations')
    .select('id, menu_id, label, loc_key')
    .eq('menu_id', menuId)
    .order('loc_key');
  if (error) raise('fetchPracticeLocations', error.message);
  return (data ?? []) as PracticeLocation[];
}

export async function fetchPracticeRecipeNodes(menuId: string): Promise<PracticeRecipeNode[]> {
  const { data, error } = await supabase
    .from('practice_recipe_nodes')
    .select('id, menu_id, node_type, step_no')
    .eq('menu_id', menuId)
    .order('step_no');
  if (error) raise('fetchPracticeRecipeNodes', error.message);
  return (data ?? []) as PracticeRecipeNode[];
}

export async function fetchPracticeIngredientNodes(menuId: string): Promise<PracticeIngredientNodeWithPath[]> {
  const nodes = (await fetchPracticeRecipeNodes(menuId)).filter((n) => n.node_type === 'ingredient');
  if (nodes.length === 0) return [];
  const nodeIds = nodes.map((n) => n.id);

  const { data: ings, error: e1 } = await supabase
    .from('practice_ingredient_nodes')
    .select('node_id, ingredient_id, is_deco, quantity')
    .in('node_id', nodeIds);
  if (e1) raise('fetchPracticeIngredientNodes(ing)', e1.message);

  const { data: paths, error: e2 } = await supabase
    .from('practice_node_location_path')
    .select('node_id, seq, location_id')
    .in('node_id', nodeIds)
    .order('seq');
  if (e2) raise('fetchPracticeIngredientNodes(path)', e2.message);

  const ingByNode = new Map<string, PracticeIngredientNode>();
  for (const row of (ings ?? []) as PracticeIngredientNode[]) {
    ingByNode.set(row.node_id, row);
  }
  const pathByNode = new Map<string, PracticeNodeLocationPath[]>();
  for (const row of (paths ?? []) as PracticeNodeLocationPath[]) {
    const list = pathByNode.get(row.node_id) ?? [];
    list.push(row);
    pathByNode.set(row.node_id, list);
  }

  const result: PracticeIngredientNodeWithPath[] = [];
  for (const node of nodes) {
    const ingredient = ingByNode.get(node.id);
    if (!ingredient) continue;
    result.push({
      node,
      ingredient,
      location_path: pathByNode.get(node.id) ?? [],
    });
  }
  return result;
}

export async function fetchPracticeActionNodes(menuId: string): Promise<PracticeActionNodeWithLocation[]> {
  const nodes = (await fetchPracticeRecipeNodes(menuId)).filter((n) => n.node_type === 'action');
  if (nodes.length === 0) return [];
  const nodeIds = nodes.map((n) => n.id);

  const { data, error } = await supabase
    .from('practice_action_nodes')
    .select('node_id, action_type, location_id, duration_sec')
    .in('node_id', nodeIds);
  if (error) raise('fetchPracticeActionNodes', error.message);

  const actByNode = new Map<string, PracticeActionNode>();
  for (const row of (data ?? []) as PracticeActionNode[]) {
    actByNode.set(row.node_id, row);
  }

  const result: PracticeActionNodeWithLocation[] = [];
  for (const node of nodes) {
    const action = actByNode.get(node.id);
    if (!action) continue;
    result.push({ node, action });
  }
  return result;
}

export async function fetchPracticeStepGroups(menuId: string): Promise<PracticeStepGroup[]> {
  const { data, error } = await supabase
    .from('practice_step_groups')
    .select('id, menu_id, display_step_no, title, summary, primary_location_id')
    .eq('menu_id', menuId)
    .order('display_step_no');
  if (error) raise('fetchPracticeStepGroups', error.message);
  return (data ?? []) as PracticeStepGroup[];
}

export async function fetchPracticeStepGroupNodes(menuId: string): Promise<PracticeStepGroupNode[]> {
  const groups = await fetchPracticeStepGroups(menuId);
  if (groups.length === 0) return [];
  const groupIds = groups.map((g) => g.id);
  const { data, error } = await supabase
    .from('practice_step_group_nodes')
    .select('step_group_id, node_id')
    .in('step_group_id', groupIds);
  if (error) raise('fetchPracticeStepGroupNodes', error.message);
  return (data ?? []) as PracticeStepGroupNode[];
}

export async function fetchPracticeTacitItems(stepGroupIds: string[]): Promise<PracticeTacitItem[]> {
  if (stepGroupIds.length === 0) return [];
  const { data, error } = await supabase
    .from('practice_tacit_items')
    .select(
      'id, step_group_id, tacit_type, title, body, sort_order, flame_level, color_note, viscosity_note, sound_note, texture_note, timing_note',
    )
    .in('step_group_id', stepGroupIds)
    .order('sort_order');
  if (error) raise('fetchPracticeTacitItems', error.message);
  return (data ?? []) as PracticeTacitItem[];
}

export async function fetchPracticeTacitMedia(tacitItemIds: string[]): Promise<PracticeTacitMedia[]> {
  if (tacitItemIds.length === 0) return [];
  const { data, error } = await supabase
    .from('practice_tacit_media')
    .select('id, tacit_item_id, media_type, url, sort_order')
    .in('tacit_item_id', tacitItemIds)
    .order('sort_order');
  if (error) raise('fetchPracticeTacitMedia', error.message);
  return (data ?? []) as PracticeTacitMedia[];
}

export async function fetchPracticeSession(sessionId: string): Promise<PracticeSession | null> {
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('id, menu_id, store_id, store_user_id, status, started_at, completed_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) raise('fetchPracticeSession', error.message);
  return (data as PracticeSession | null) ?? null;
}

export async function fetchPracticeMenuBundle(menuId: string): Promise<PracticeMenuBundle> {
  const menu = await fetchPracticeMenu(menuId);
  if (!menu) raise('fetchPracticeMenuBundle', `menu not found: ${menuId}`);

  const [locations, ingredient_nodes, action_nodes, step_groups, step_group_nodes] = await Promise.all([
    fetchPracticeLocations(menuId),
    fetchPracticeIngredientNodes(menuId),
    fetchPracticeActionNodes(menuId),
    fetchPracticeStepGroups(menuId),
    fetchPracticeStepGroupNodes(menuId),
  ]);

  const stepGroupIds = step_groups.map((g) => g.id);
  const tacit_items = await fetchPracticeTacitItems(stepGroupIds);
  const tacitItemIds = tacit_items.map((t) => t.id);
  const tacit_media = await fetchPracticeTacitMedia(tacitItemIds);

  return {
    menu,
    locations,
    ingredient_nodes,
    action_nodes,
    step_groups,
    step_group_nodes,
    tacit_items,
    tacit_media,
  };
}

// ——— Menu metadata (write) ————————————————————————

export async function updatePracticeMenuMeta(
  menuId: string,
  fields: { name: string; description: string | null; image_url: string | null },
): Promise<PracticeMenu> {
  const { data, error } = await supabase
    .from('practice_menus')
    .update({
      name: fields.name,
      description: fields.description,
      image_url: fields.image_url,
    })
    .eq('id', menuId)
    .select('id, store_id, name, description, image_url, created_at')
    .single();
  if (error) raise('updatePracticeMenuMeta', error.message);
  return data as PracticeMenu;
}

export async function createPracticeMenu(
  storeId: string,
  name: string,
): Promise<PracticeMenu> {
  const { data, error } = await supabase
    .from('practice_menus')
    .insert({ store_id: storeId, name, description: null, image_url: null })
    .select('id, store_id, name, description, image_url, created_at')
    .single();
  if (error) raise('createPracticeMenu', error.message);
  return data as PracticeMenu;
}

export async function createPracticeLocation(
  menuId: string,
  locKey: string,
  label: string,
): Promise<PracticeLocation> {
  const { data, error } = await supabase
    .from('practice_locations')
    .insert({ menu_id: menuId, loc_key: locKey, label })
    .select('id, menu_id, label, loc_key')
    .single();
  if (error) raise('createPracticeLocation', error.message);
  return data as PracticeLocation;
}

export interface CreatePracticeStepGroupInput {
  menuId: string;
  displayStepNo: number;
  title: string;
  summary: string | null;
  primaryLocationId: string | null;
}

export async function createPracticeStepGroup(
  input: CreatePracticeStepGroupInput,
): Promise<PracticeStepGroup> {
  const { data, error } = await supabase
    .from('practice_step_groups')
    .insert({
      menu_id: input.menuId,
      display_step_no: input.displayStepNo,
      title: input.title,
      summary: input.summary,
      primary_location_id: input.primaryLocationId,
    })
    .select('id, menu_id, display_step_no, title, summary, primary_location_id')
    .single();
  if (error) raise('createPracticeStepGroup', error.message);
  return data as PracticeStepGroup;
}

export interface UpdatePracticeStepGroupMetaInput {
  stepGroupId: string;
  displayStepNo: number;
  title: string;
  summary: string | null;
  primaryLocationId: string | null;
}

export async function updatePracticeStepGroupMeta(
  input: UpdatePracticeStepGroupMetaInput,
): Promise<PracticeStepGroup> {
  const { data, error } = await supabase
    .from('practice_step_groups')
    .update({
      display_step_no: input.displayStepNo,
      title: input.title,
      summary: input.summary,
      primary_location_id: input.primaryLocationId,
    })
    .eq('id', input.stepGroupId)
    .select('id, menu_id, display_step_no, title, summary, primary_location_id')
    .single();
  if (error) raise('updatePracticeStepGroupMeta', error.message);
  return data as PracticeStepGroup;
}

export interface CreatePracticeStepGroupNodeInput {
  stepGroupId: string;
  nodeId: string;
}

export async function createPracticeStepGroupNode(
  input: CreatePracticeStepGroupNodeInput,
): Promise<PracticeStepGroupNode> {
  const { data, error } = await supabase
    .from('practice_step_group_nodes')
    .insert({ step_group_id: input.stepGroupId, node_id: input.nodeId })
    .select('step_group_id, node_id')
    .single();
  if (error) raise('createPracticeStepGroupNode', error.message);
  return data as PracticeStepGroupNode;
}

export interface DeletePracticeStepGroupNodeLinkInput {
  stepGroupId: string;
  nodeId: string;
}

export async function deletePracticeStepGroupNodeLink(
  input: DeletePracticeStepGroupNodeLinkInput,
): Promise<void> {
  const { error } = await supabase
    .from('practice_step_group_nodes')
    .delete()
    .eq('step_group_id', input.stepGroupId)
    .eq('node_id', input.nodeId);
  if (error) raise('deletePracticeStepGroupNodeLink', error.message);
}

export interface CreatePracticeTacitItemInput {
  stepGroupId: string;
  tacitType: PracticeTacitType;
  title: string;
  body: string | null;
  sortOrder: number;
  flameLevel: string | null;
  colorNote: string | null;
  viscosityNote: string | null;
  soundNote: string | null;
  textureNote: string | null;
  timingNote: string | null;
}

export async function createPracticeTacitItem(
  input: CreatePracticeTacitItemInput,
): Promise<PracticeTacitItem> {
  const { data, error } = await supabase
    .from('practice_tacit_items')
    .insert({
      step_group_id: input.stepGroupId,
      tacit_type: input.tacitType,
      title: input.title,
      body: input.body,
      sort_order: input.sortOrder,
      flame_level: input.flameLevel,
      color_note: input.colorNote,
      viscosity_note: input.viscosityNote,
      sound_note: input.soundNote,
      texture_note: input.textureNote,
      timing_note: input.timingNote,
    })
    .select(
      'id, step_group_id, tacit_type, title, body, sort_order, flame_level, color_note, viscosity_note, sound_note, texture_note, timing_note',
    )
    .single();
  if (error) raise('createPracticeTacitItem', error.message);
  return data as PracticeTacitItem;
}

export interface UpdatePracticeTacitItemInput {
  tacitItemId: string;
  title: string;
  body: string | null;
  flameLevel: string | null;
  colorNote: string | null;
  viscosityNote: string | null;
  soundNote: string | null;
  textureNote: string | null;
  timingNote: string | null;
}

export async function updatePracticeTacitItem(
  input: UpdatePracticeTacitItemInput,
): Promise<PracticeTacitItem> {
  const { data, error } = await supabase
    .from('practice_tacit_items')
    .update({
      title: input.title,
      body: input.body,
      flame_level: input.flameLevel,
      color_note: input.colorNote,
      viscosity_note: input.viscosityNote,
      sound_note: input.soundNote,
      texture_note: input.textureNote,
      timing_note: input.timingNote,
    })
    .eq('id', input.tacitItemId)
    .select(
      'id, step_group_id, tacit_type, title, body, sort_order, flame_level, color_note, viscosity_note, sound_note, texture_note, timing_note',
    )
    .single();
  if (error) raise('updatePracticeTacitItem', error.message);
  return data as PracticeTacitItem;
}

export interface DeletePracticeTacitItemInput {
  tacitItemId: string;
}

export async function deletePracticeTacitItem(
  input: DeletePracticeTacitItemInput,
): Promise<void> {
  const { error } = await supabase
    .from('practice_tacit_items')
    .delete()
    .eq('id', input.tacitItemId);
  if (error) raise('deletePracticeTacitItem', error.message);
}

export interface DeletePracticeStepGroupInput {
  stepGroupId: string;
}

export async function deletePracticeStepGroup(
  input: DeletePracticeStepGroupInput,
): Promise<void> {
  const { error } = await supabase
    .from('practice_step_groups')
    .delete()
    .eq('id', input.stepGroupId);
  if (error) raise('deletePracticeStepGroup', error.message);
}

export interface CreatePracticeTacitMediaInput {
  tacitItemId: string;
  mediaType: PracticeTacitMediaType;
  url: string;
  sortOrder: number;
}

export async function createPracticeTacitMedia(
  input: CreatePracticeTacitMediaInput,
): Promise<PracticeTacitMedia> {
  const { data, error } = await supabase
    .from('practice_tacit_media')
    .insert({
      tacit_item_id: input.tacitItemId,
      media_type: input.mediaType,
      url: input.url,
      sort_order: input.sortOrder,
    })
    .select('id, tacit_item_id, media_type, url, sort_order')
    .single();
  if (error) raise('createPracticeTacitMedia', error.message);
  return data as PracticeTacitMedia;
}

export interface UpdatePracticeTacitMediaUrlInput {
  mediaId: string;
  url: string;
}

export async function updatePracticeTacitMediaUrl(
  input: UpdatePracticeTacitMediaUrlInput,
): Promise<PracticeTacitMedia> {
  const { data, error } = await supabase
    .from('practice_tacit_media')
    .update({ url: input.url })
    .eq('id', input.mediaId)
    .select('id, tacit_item_id, media_type, url, sort_order')
    .single();
  if (error) raise('updatePracticeTacitMediaUrl', error.message);
  return data as PracticeTacitMedia;
}

export interface DeletePracticeTacitMediaInput {
  mediaId: string;
}

export async function deletePracticeTacitMedia(
  input: DeletePracticeTacitMediaInput,
): Promise<void> {
  const { error } = await supabase
    .from('practice_tacit_media')
    .delete()
    .eq('id', input.mediaId);
  if (error) raise('deletePracticeTacitMedia', error.message);
}

export interface CreatePracticeIngredientNodeInput {
  menuId: string;
  stepNo: number;
  ingredientId: string;
  isDeco: boolean;
  quantity: number;
  initialLocationId: string;
}

interface IngredientNodeRpcRow {
  node_id: string;
  menu_id: string;
  step_no: number;
  ingredient_id: string;
  is_deco: boolean;
  quantity: number;
  initial_location_id: string;
}

function isIngredientNodeRpcRow(x: unknown): x is IngredientNodeRpcRow {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.node_id === 'string' &&
    typeof o.menu_id === 'string' &&
    typeof o.step_no === 'number' &&
    typeof o.ingredient_id === 'string' &&
    typeof o.is_deco === 'boolean' &&
    typeof o.quantity === 'number' &&
    typeof o.initial_location_id === 'string'
  );
}

export async function createPracticeIngredientNodeViaRpc(
  input: CreatePracticeIngredientNodeInput,
): Promise<PracticeIngredientNodeWithPath> {
  const { data, error } = await supabase.rpc(
    'create_practice_ingredient_node_with_path',
    {
      p_menu_id: input.menuId,
      p_step_no: input.stepNo,
      p_ingredient_id: input.ingredientId,
      p_is_deco: input.isDeco,
      p_quantity: input.quantity,
      p_initial_location_id: input.initialLocationId,
    },
  );
  if (error) raise('createPracticeIngredientNodeViaRpc', error.message);
  if (!Array.isArray(data) || data.length !== 1 || !isIngredientNodeRpcRow(data[0])) {
    raise('createPracticeIngredientNodeViaRpc', 'rpc returned unexpected shape');
  }
  const row = data[0];
  return {
    node: {
      id: row.node_id,
      menu_id: row.menu_id,
      node_type: 'ingredient',
      step_no: row.step_no,
    },
    ingredient: {
      node_id: row.node_id,
      ingredient_id: row.ingredient_id,
      is_deco: row.is_deco,
      quantity: row.quantity,
    },
    location_path: [
      { node_id: row.node_id, seq: 0, location_id: row.initial_location_id },
    ],
  };
}

export interface CreatePracticeNodeLocationPathHopInput {
  nodeId: string;
  seq: number;
  locationId: string;
}

export async function createPracticeNodeLocationPathHop(
  input: CreatePracticeNodeLocationPathHopInput,
): Promise<PracticeNodeLocationPath> {
  const { data, error } = await supabase
    .from('practice_node_location_path')
    .insert({ node_id: input.nodeId, seq: input.seq, location_id: input.locationId })
    .select('node_id, seq, location_id')
    .single();
  if (error) raise('createPracticeNodeLocationPathHop', error.message);
  return data as PracticeNodeLocationPath;
}

export interface DeletePracticeNodeLocationPathTailHopInput {
  nodeId: string;
  seq: number;
}

export async function deletePracticeNodeLocationPathTailHop(
  input: DeletePracticeNodeLocationPathTailHopInput,
): Promise<void> {
  const { error } = await supabase
    .from('practice_node_location_path')
    .delete()
    .eq('node_id', input.nodeId)
    .eq('seq', input.seq);
  if (error) raise('deletePracticeNodeLocationPathTailHop', error.message);
}

export interface CreatePracticeActionNodeInput {
  menuId: string;
  stepNo: number;
  actionType: PracticeActionType;
  locationId: string;
  durationSec: number | null;
}

export async function createPracticeActionNode(
  input: CreatePracticeActionNodeInput,
): Promise<PracticeActionNodeWithLocation> {
  const { data: nodeRow, error: e1 } = await supabase
    .from('practice_recipe_nodes')
    .insert({
      menu_id: input.menuId,
      node_type: 'action',
      step_no: input.stepNo,
    })
    .select('id, menu_id, node_type, step_no')
    .single();
  if (e1) raise('createPracticeActionNode(node)', e1.message);
  const node = nodeRow as PracticeRecipeNode;

  const { data: actionRow, error: e2 } = await supabase
    .from('practice_action_nodes')
    .insert({
      node_id: node.id,
      action_type: input.actionType,
      location_id: input.locationId,
      duration_sec: input.durationSec,
    })
    .select('node_id, action_type, location_id, duration_sec')
    .single();
  if (e2) {
    const { error: rbErr } = await supabase
      .from('practice_recipe_nodes')
      .delete()
      .eq('id', node.id);
    const cleanup = rbErr ? `cleanup failed: ${rbErr.message}` : 'cleanup ok';
    raise('createPracticeActionNode(action)', `${e2.message} (${cleanup})`);
  }
  return { node, action: actionRow as PracticeActionNode };
}

export interface UpdatePracticeActionNodeInput {
  nodeId: string;
  actionType: PracticeActionType;
  locationId: string;
  durationSec: number | null;
}

export async function updatePracticeActionNode(
  input: UpdatePracticeActionNodeInput,
): Promise<PracticeActionNode> {
  const { data, error } = await supabase
    .from('practice_action_nodes')
    .update({
      action_type: input.actionType,
      location_id: input.locationId,
      duration_sec: input.durationSec,
    })
    .eq('node_id', input.nodeId)
    .select('node_id, action_type, location_id, duration_sec')
    .single();
  if (error) raise('updatePracticeActionNode', error.message);
  return data as PracticeActionNode;
}

export interface UpdatePracticeIngredientNodeInput {
  nodeId: string;
  ingredientId: string;
  isDeco: boolean;
  quantity: number;
}

export async function updatePracticeIngredientNode(
  input: UpdatePracticeIngredientNodeInput,
): Promise<PracticeIngredientNode> {
  const { data, error } = await supabase
    .from('practice_ingredient_nodes')
    .update({
      ingredient_id: input.ingredientId,
      is_deco: input.isDeco,
      quantity: input.quantity,
    })
    .eq('node_id', input.nodeId)
    .select('node_id, ingredient_id, is_deco, quantity')
    .single();
  if (error) raise('updatePracticeIngredientNode', error.message);
  return data as PracticeIngredientNode;
}

export interface DeletePracticeRecipeNodeInput {
  nodeId: string;
}

export async function deletePracticeRecipeNode(
  input: DeletePracticeRecipeNodeInput,
): Promise<void> {
  const { error } = await supabase
    .from('practice_recipe_nodes')
    .delete()
    .eq('id', input.nodeId);
  if (error) raise('deletePracticeRecipeNode', error.message);
}

export interface UpdatePracticeRecipeNodeStepNoInput {
  nodeId: string;
  stepNo: number;
}

export async function updatePracticeRecipeNodeStepNo(
  input: UpdatePracticeRecipeNodeStepNoInput,
): Promise<PracticeRecipeNode> {
  const { data, error } = await supabase
    .from('practice_recipe_nodes')
    .update({ step_no: input.stepNo })
    .eq('id', input.nodeId)
    .select('id, menu_id, node_type, step_no')
    .single();
  if (error) raise('updatePracticeRecipeNodeStepNo', error.message);
  return data as PracticeRecipeNode;
}

// ——— Session lifecycle (write) ———————————————————————

export async function createPracticeSession(
  menuId: string,
  storeId: string,
  storeUserId: string,
): Promise<PracticeSession> {
  const { data, error } = await supabase
    .from('practice_sessions')
    .insert({ menu_id: menuId, store_id: storeId, store_user_id: storeUserId, status: 'active' })
    .select('id, menu_id, store_id, store_user_id, status, started_at, completed_at')
    .single();
  if (error) raise('createPracticeSession', error.message);
  return data as PracticeSession;
}

export async function updatePracticeSessionStatus(
  sessionId: string,
  status: PracticeSessionStatus,
): Promise<void> {
  const updates: { status: PracticeSessionStatus; completed_at?: string } = { status };
  if (status === 'completed' || status === 'abandoned') {
    updates.completed_at = new Date().toISOString();
  }
  const { error } = await supabase
    .from('practice_sessions')
    .update(updates)
    .eq('id', sessionId);
  if (error) raise('updatePracticeSessionStatus', error.message);
}

// ——— Runtime row fetch (resume) ——————————————————————

export async function fetchPracticeIngredientInstances(
  sessionId: string,
): Promise<PracticeIngredientInstance[]> {
  const { data, error } = await supabase
    .from('practice_ingredient_instances')
    .select('id, session_id, node_id, actual_location_id, current_required_location_id, is_satisfied')
    .eq('session_id', sessionId);
  if (error) raise('fetchPracticeIngredientInstances', error.message);
  return (data ?? []) as PracticeIngredientInstance[];
}

export async function fetchPracticeNodeProgress(
  sessionId: string,
): Promise<PracticeNodeProgress[]> {
  const { data, error } = await supabase
    .from('practice_node_progress')
    .select('id, session_id, node_id, is_satisfied, satisfied_at')
    .eq('session_id', sessionId);
  if (error) raise('fetchPracticeNodeProgress', error.message);
  return (data ?? []) as PracticeNodeProgress[];
}

// ——— Persist after transitions ——————————————————————

export async function upsertPracticeIngredientInstances(
  rows: PersistableInstanceRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('practice_ingredient_instances')
    .upsert(rows, { onConflict: 'session_id,node_id' });
  if (error) raise('upsertPracticeIngredientInstances', error.message);
}

export async function upsertPracticeNodeProgress(
  rows: PersistableProgressRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase
    .from('practice_node_progress')
    .upsert(rows, { onConflict: 'session_id,node_id' });
  if (error) raise('upsertPracticeNodeProgress', error.message);
}

// ——— Store ingredient options (admin authoring source) ———

export interface StoreIngredientOption {
  id: string;
  display_name: string;
}

export async function fetchStoreIngredientOptions(
  storeId: string,
): Promise<StoreIngredientOption[]> {
  const { data, error } = await supabase
    .from('store_ingredients')
    .select('id, display_name')
    .eq('store_id', storeId)
    .order('display_name');
  if (error) raise('fetchStoreIngredientOptions', error.message);
  return (data ?? []) as StoreIngredientOption[];
}

// ——— Display name lookup (UI-only, VO 확장) ———

export async function fetchIngredientDisplayNames(
  ingredientIds: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (ingredientIds.length === 0) return new Map();
  const unique = [...new Set(ingredientIds)];
  const { data, error } = await supabase
    .from('store_ingredients')
    .select('id, display_name')
    .in('id', unique);
  if (error) raise('fetchIngredientDisplayNames', error.message);
  const map = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ id: string; display_name: string }>) {
    map.set(row.id, row.display_name);
  }
  return map;
}
