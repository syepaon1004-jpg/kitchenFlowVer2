import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchPracticeMenus,
  fetchPracticeMenuBundle,
  updatePracticeMenuMeta,
  createPracticeMenu,
  createPracticeLocation,
  createPracticeActionNode,
  createPracticeIngredientNodeViaRpc,
  createPracticeNodeLocationPathHop,
  deletePracticeNodeLocationPathTailHop,
  deletePracticeRecipeNode,
  createPracticeStepGroup,
  updatePracticeStepGroupMeta,
  createPracticeStepGroupNode,
  deletePracticeStepGroupNodeLink,
  createPracticeTacitItem,
  updatePracticeTacitItem,
  createPracticeTacitMedia,
  updatePracticeTacitMediaUrl,
  deletePracticeTacitMedia,
  deletePracticeTacitItem,
  deletePracticeStepGroup,
  updatePracticeActionNode,
  updatePracticeIngredientNode,
  updatePracticeRecipeNodeStepNo,
  fetchStoreIngredientOptions,
} from '../../lib/practice/queries';
import type { StoreIngredientOption } from '../../lib/practice/queries';
import {
  buildMenuStructureSummary,
  buildStepGroupDrilldown,
  buildAdminActionNodeList,
  buildAdminIngredientNodeList,
  buildAdminUnlinkedNodeOptions,
  ADMIN_TACIT_TYPE_LABELS,
  ADMIN_SENSORY_FIELDS,
} from '../../lib/practice/adminView';
import type {
  MenuStructureSummary,
  StepGroupCoverage,
} from '../../lib/practice/adminView';
import type {
  PracticeMenu,
  PracticeMenuBundle,
  PracticeRecipeNode,
  PracticeActionType,
  PracticeStepGroup,
  PracticeTacitType,
  PracticeTacitItem,
  PracticeTacitMedia,
  PracticeTacitMediaType,
} from '../../types/practice';
import {
  PRACTICE_ACTION_TYPES,
  PRACTICE_TACIT_TYPES,
  PRACTICE_TACIT_MEDIA_TYPES,
} from '../../types/practice';
import {
  bootstrapEngineState,
  tryPlaceIngredient,
  tryExecuteAction,
  tryPour,
} from '../../lib/practice/engine';
import type { LegalAction, PracticeEngineState } from '../../lib/practice/engine';
import { computeDerivedData } from '../../lib/practice/runtime';
import {
  buildLocationLabelMap,
  buildTacitDetailViewModel,
  buildNextGroupPreview,
} from '../../lib/practice/sessionView';
import type {
  TacitDetailViewModel,
  NextGroupPreviewViewModel,
} from '../../lib/practice/sessionView';
import {
  formatLegalAction,
  formatFriendlyAction,
  pickRepresentativeAction,
} from '../../lib/practice/sessionTextFormat';
import '../../styles/gameVariables.css';
import styles from './PracticePlaceholder.module.css';

const TACIT_TYPE_FULL_LABELS: Record<PracticeTacitType, string> = {
  ...ADMIN_TACIT_TYPE_LABELS,
  media: '미디어',
};

const MEDIA_TYPE_LABELS: Record<PracticeTacitMediaType, string> = {
  image: '이미지',
  video: '영상',
};

const PREVIEW_SENSORY_FIELDS = [
  { key: 'flame_level', label: '화력' },
  { key: 'color_note', label: '색' },
  { key: 'viscosity_note', label: '점도' },
  { key: 'sound_note', label: '소리' },
  { key: 'texture_note', label: '질감' },
  { key: 'timing_note', label: '타이밍' },
] as const;

function PreviewTacitSensoryNotes({ item }: { item: PracticeTacitItem }) {
  const notes: { label: string; value: string }[] = [];
  for (const { key, label } of PREVIEW_SENSORY_FIELDS) {
    const v = item[key];
    if (v != null) notes.push({ label, value: v });
  }
  if (notes.length === 0) return null;

  return (
    <div className={styles.tacitSensoryNotes}>
      {notes.map(({ label, value }) => (
        <span key={label} className={styles.tacitSensoryTag}>
          {label}: {value}
        </span>
      ))}
    </div>
  );
}

function PreviewTacitItemMedia({
  media,
}: {
  media: readonly PracticeTacitMedia[];
}) {
  if (media.length === 0) return null;

  return (
    <div className={styles.tacitMediaList}>
      {media.map((m) => (
        <div key={m.id} className={styles.tacitMediaItem}>
          {m.media_type === 'image' ? (
            <img src={m.url} alt="" loading="lazy" />
          ) : (
            <video src={m.url} controls preload="metadata" />
          )}
        </div>
      ))}
    </div>
  );
}

const PracticeAdminPage = () => {
  const navigate = useNavigate();
  const selectedStore = useAuthStore((s) => s.selectedStore);

  const [menus, setMenus] = useState<PracticeMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<PracticeMenuBundle | null>(null);
  const [previewEngineState, setPreviewEngineState] =
    useState<PracticeEngineState | null>(null);
  const [summary, setSummary] = useState<MenuStructureSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const [editDraft, setEditDraft] = useState<{
    name: string;
    description: string;
    imageUrl: string;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);

  const [showCreateInput, setShowCreateInput] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [showLocationInput, setShowLocationInput] = useState(false);
  const [locationKeyDraft, setLocationKeyDraft] = useState('');
  const [locationLabelDraft, setLocationLabelDraft] = useState('');
  const [creatingLocation, setCreatingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [showActionNodeInput, setShowActionNodeInput] = useState(false);
  const [actionStepNoDraft, setActionStepNoDraft] = useState('');
  const [actionTypeDraft, setActionTypeDraft] =
    useState<PracticeActionType>('fry');
  const [actionLocationIdDraft, setActionLocationIdDraft] = useState('');
  const [actionDurationDraft, setActionDurationDraft] = useState('');
  const [creatingActionNode, setCreatingActionNode] = useState(false);
  const [actionNodeError, setActionNodeError] = useState<string | null>(null);

  const [storeIngredientOptions, setStoreIngredientOptions] = useState<
    StoreIngredientOption[]
  >([]);
  const [storeIngredientOptionsLoading, setStoreIngredientOptionsLoading] =
    useState(false);
  const [storeIngredientOptionsError, setStoreIngredientOptionsError] =
    useState<string | null>(null);

  const [showIngredientNodeInput, setShowIngredientNodeInput] = useState(false);
  const [ingredientStepNoDraft, setIngredientStepNoDraft] = useState('');
  const [ingredientIdDraft, setIngredientIdDraft] = useState('');
  const [ingredientIsDecoDraft, setIngredientIsDecoDraft] = useState(false);
  const [ingredientQuantityDraft, setIngredientQuantityDraft] = useState('');
  const [ingredientInitialLocationIdDraft, setIngredientInitialLocationIdDraft] =
    useState('');
  const [creatingIngredientNode, setCreatingIngredientNode] = useState(false);
  const [ingredientNodeError, setIngredientNodeError] = useState<string | null>(
    null,
  );

  const [addHopTargetNodeId, setAddHopTargetNodeId] = useState<string | null>(
    null,
  );
  const [hopLocationIdDraft, setHopLocationIdDraft] = useState('');
  const [creatingHop, setCreatingHop] = useState(false);
  const [hopError, setHopError] = useState<string | null>(null);

  const [deletingTailHopNodeId, setDeletingTailHopNodeId] = useState<
    string | null
  >(null);
  const [lastTailHopDeleteNodeId, setLastTailHopDeleteNodeId] = useState<
    string | null
  >(null);
  const [tailHopDeleteError, setTailHopDeleteError] = useState<string | null>(
    null,
  );

  const [showStepGroupInput, setShowStepGroupInput] = useState(false);
  const [stepGroupDisplayStepNoDraft, setStepGroupDisplayStepNoDraft] =
    useState('');
  const [stepGroupTitleDraft, setStepGroupTitleDraft] = useState('');
  const [stepGroupSummaryDraft, setStepGroupSummaryDraft] = useState('');
  const [
    stepGroupPrimaryLocationIdDraft,
    setStepGroupPrimaryLocationIdDraft,
  ] = useState('');
  const [creatingStepGroup, setCreatingStepGroup] = useState(false);
  const [stepGroupError, setStepGroupError] = useState<string | null>(null);

  const [editingStepGroupDraft, setEditingStepGroupDraft] = useState<{
    groupId: string;
    displayStepNo: string;
    title: string;
    summary: string;
    primaryLocationId: string;
  } | null>(null);
  const [editingStepGroupSaving, setEditingStepGroupSaving] = useState(false);
  const [editingStepGroupError, setEditingStepGroupError] = useState<
    string | null
  >(null);

  const [showLinkNodeInput, setShowLinkNodeInput] = useState(false);
  const [linkStepGroupIdDraft, setLinkStepGroupIdDraft] = useState('');
  const [linkNodeIdDraft, setLinkNodeIdDraft] = useState('');
  const [linkingNode, setLinkingNode] = useState(false);
  const [linkNodeError, setLinkNodeError] = useState<string | null>(null);

  const [unlinkingNodeId, setUnlinkingNodeId] = useState<string | null>(null);
  const [lastUnlinkAttemptNodeId, setLastUnlinkAttemptNodeId] = useState<
    string | null
  >(null);
  const [unlinkNodeError, setUnlinkNodeError] = useState<string | null>(null);

  const [showTacitItemInput, setShowTacitItemInput] = useState(false);
  const [tacitStepGroupIdDraft, setTacitStepGroupIdDraft] = useState('');
  const [tacitTypeDraft, setTacitTypeDraft] =
    useState<PracticeTacitType>('observe');
  const [tacitTitleDraft, setTacitTitleDraft] = useState('');
  const [tacitBodyDraft, setTacitBodyDraft] = useState('');
  const [tacitFlameLevelDraft, setTacitFlameLevelDraft] = useState('');
  const [tacitColorNoteDraft, setTacitColorNoteDraft] = useState('');
  const [tacitViscosityNoteDraft, setTacitViscosityNoteDraft] = useState('');
  const [tacitSoundNoteDraft, setTacitSoundNoteDraft] = useState('');
  const [tacitTextureNoteDraft, setTacitTextureNoteDraft] = useState('');
  const [tacitTimingNoteDraft, setTacitTimingNoteDraft] = useState('');
  const [creatingTacitItem, setCreatingTacitItem] = useState(false);
  const [tacitItemError, setTacitItemError] = useState<string | null>(null);

  const [editingTacitItemDraft, setEditingTacitItemDraft] = useState<{
    tacitItemId: string;
    title: string;
    body: string;
    flameLevel: string;
    colorNote: string;
    viscosityNote: string;
    soundNote: string;
    textureNote: string;
    timingNote: string;
  } | null>(null);
  const [editingTacitItemSaving, setEditingTacitItemSaving] = useState(false);
  const [editingTacitItemError, setEditingTacitItemError] = useState<
    string | null
  >(null);

  const [showMediaAttachInput, setShowMediaAttachInput] = useState(false);
  const [mediaTargetStepGroupIdDraft, setMediaTargetStepGroupIdDraft] =
    useState('');
  const [mediaTargetTacitItemIdDraft, setMediaTargetTacitItemIdDraft] =
    useState('');
  const [mediaTypeDraft, setMediaTypeDraft] =
    useState<PracticeTacitMediaType>('image');
  const [mediaUrlDraft, setMediaUrlDraft] = useState('');
  const [creatingTacitMedia, setCreatingTacitMedia] = useState(false);
  const [tacitMediaError, setTacitMediaError] = useState<string | null>(null);

  const [editingMediaUrlDraft, setEditingMediaUrlDraft] = useState<{
    mediaId: string;
    url: string;
  } | null>(null);
  const [editingMediaUrlSaving, setEditingMediaUrlSaving] = useState(false);
  const [editingMediaUrlError, setEditingMediaUrlError] = useState<
    string | null
  >(null);

  const [editingPureMediaTitleDraft, setEditingPureMediaTitleDraft] = useState<{
    tacitItemId: string;
    title: string;
  } | null>(null);
  const [editingPureMediaTitleSaving, setEditingPureMediaTitleSaving] =
    useState(false);
  const [editingPureMediaTitleError, setEditingPureMediaTitleError] = useState<
    string | null
  >(null);

  const [detachingMediaId, setDetachingMediaId] = useState<string | null>(null);
  const [detachMediaError, setDetachMediaError] = useState<{
    mediaId: string;
    message: string;
  } | null>(null);

  const [deletingPureMediaTacitId, setDeletingPureMediaTacitId] = useState<
    string | null
  >(null);
  const [deletePureMediaError, setDeletePureMediaError] = useState<{
    tacitItemId: string;
    message: string;
  } | null>(null);

  const [deletingTextTacitId, setDeletingTextTacitId] = useState<string | null>(
    null,
  );
  const [deleteTextTacitError, setDeleteTextTacitError] = useState<{
    tacitItemId: string;
    message: string;
  } | null>(null);

  const [deletingStepGroupId, setDeletingStepGroupId] = useState<string | null>(
    null,
  );
  const [deleteStepGroupError, setDeleteStepGroupError] = useState<{
    stepGroupId: string;
    message: string;
  } | null>(null);

  const [deletingActionNodeId, setDeletingActionNodeId] = useState<string | null>(
    null,
  );
  const [deleteActionNodeError, setDeleteActionNodeError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);

  const [editingActionNodeDraft, setEditingActionNodeDraft] = useState<{
    nodeId: string;
    actionType: PracticeActionType;
    locationId: string;
    duration: string;
  } | null>(null);
  const [editingActionNodeSaving, setEditingActionNodeSaving] = useState(false);
  const [editingActionNodeError, setEditingActionNodeError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);

  const [editingActionStepDraft, setEditingActionStepDraft] = useState<{
    nodeId: string;
    stepNo: string;
  } | null>(null);
  const [editingActionStepSaving, setEditingActionStepSaving] = useState(false);
  const [editingActionStepError, setEditingActionStepError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);

  const [deletingIngredientNodeId, setDeletingIngredientNodeId] = useState<
    string | null
  >(null);
  const [deleteIngredientNodeError, setDeleteIngredientNodeError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);

  const [editingIngredientStepDraft, setEditingIngredientStepDraft] = useState<{
    nodeId: string;
    stepNo: string;
  } | null>(null);
  const [editingIngredientStepSaving, setEditingIngredientStepSaving] =
    useState(false);
  const [editingIngredientStepError, setEditingIngredientStepError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);

  const [editingIngredientNodeDraft, setEditingIngredientNodeDraft] = useState<{
    nodeId: string;
    ingredientId: string;
    isDeco: boolean;
    quantity: string;
  } | null>(null);
  const [editingIngredientNodeSaving, setEditingIngredientNodeSaving] =
    useState(false);
  const [editingIngredientNodeError, setEditingIngredientNodeError] = useState<{
    nodeId: string;
    message: string;
  } | null>(null);

  const selectedMenuIdRef = useRef(selectedMenuId);
  selectedMenuIdRef.current = selectedMenuId;

  const handleImageError = (menuId: string) => {
    setBrokenImages((prev) => {
      const next = new Set(prev);
      next.add(menuId);
      return next;
    });
  };

  const handleMenuClick = (menuId: string) => {
    setSelectedMenuId((prev) => (prev === menuId ? null : menuId));
  };

  const handleEditStart = (menu: PracticeMenu) => {
    setEditDraft({
      name: menu.name,
      description: menu.description ?? '',
      imageUrl: menu.image_url ?? '',
    });
    setEditError(null);
    setPreviewBroken(false);
  };

  const handleEditCancel = () => {
    setEditDraft(null);
    setEditError(null);
    setPreviewBroken(false);
  };

  const handleEditSave = async (menuId: string) => {
    if (!editDraft) return;
    const trimmedName = editDraft.name.trim();
    if (trimmedName === '') {
      setEditError('메뉴 이름은 비워둘 수 없습니다.');
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const updated = await updatePracticeMenuMeta(menuId, {
        name: trimmedName,
        description: editDraft.description.trim() || null,
        image_url: editDraft.imageUrl.trim() || null,
      });
      setMenus((prev) => prev.map((m) => (m.id === menuId ? updated : m)));
      setBrokenImages((prev) => {
        if (!prev.has(menuId)) return prev;
        const next = new Set(prev);
        next.delete(menuId);
        return next;
      });
      setEditDraft(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditSaving(false);
    }
  };

  const handleCreateSubmit = async () => {
    const trimmed = createName.trim();
    if (trimmed === '') {
      setCreateError('메뉴 이름을 입력하세요.');
      return;
    }
    if (!selectedStore) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createPracticeMenu(selectedStore.id, trimmed);
      setMenus((prev) => [...prev, created]);
      setSelectedMenuId(created.id);
      setShowCreateInput(false);
      setCreateName('');
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleCreateCancel = () => {
    setShowCreateInput(false);
    setCreateName('');
    setCreateError(null);
  };

  const handleLocationCreateSubmit = async () => {
    const trimmedKey = locationKeyDraft.trim();
    const trimmedLabel = locationLabelDraft.trim();
    if (trimmedKey === '') {
      setLocationError('loc_key는 비워둘 수 없습니다.');
      return;
    }
    if (trimmedLabel === '') {
      setLocationError('label을 입력하세요.');
      return;
    }
    if (bundle?.locations.some((l) => l.loc_key === trimmedKey)) {
      setLocationError(`이미 존재하는 loc_key입니다: ${trimmedKey}`);
      return;
    }
    if (!selectedMenuId) return;

    const requestMenuId = selectedMenuId;
    setCreatingLocation(true);
    setLocationError(null);
    try {
      const created = await createPracticeLocation(requestMenuId, trimmedKey, trimmedLabel);
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          locations: [...prev.locations, created].sort((a, b) =>
            a.loc_key.localeCompare(b.loc_key),
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setShowLocationInput(false);
        setLocationKeyDraft('');
        setLocationLabelDraft('');
        setLocationError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setLocationError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setCreatingLocation(false);
      }
    }
  };

  const handleLocationCreateCancel = () => {
    setShowLocationInput(false);
    setLocationKeyDraft('');
    setLocationLabelDraft('');
    setLocationError(null);
  };

  const resetActionNodeDrafts = () => {
    setActionStepNoDraft('');
    setActionTypeDraft('fry');
    setActionLocationIdDraft('');
    setActionDurationDraft('');
  };

  const handleActionNodeCreateSubmit = async () => {
    const trimmedStep = actionStepNoDraft.trim();
    if (trimmedStep === '') {
      setActionNodeError('step_no를 입력하세요.');
      return;
    }
    const stepNo = Number(trimmedStep);
    if (!Number.isInteger(stepNo) || stepNo < 1) {
      setActionNodeError('step_no는 1 이상의 정수여야 합니다.');
      return;
    }
    if (!PRACTICE_ACTION_TYPES.includes(actionTypeDraft)) {
      setActionNodeError('action_type이 올바르지 않습니다.');
      return;
    }
    if (actionLocationIdDraft === '') {
      setActionNodeError('location을 선택하세요.');
      return;
    }
    if (
      bundle &&
      !bundle.locations.some((l) => l.id === actionLocationIdDraft)
    ) {
      setActionNodeError('선택된 location이 현재 메뉴에 없습니다.');
      return;
    }
    let durationSec: number | null = null;
    const trimmedDuration = actionDurationDraft.trim();
    if (trimmedDuration !== '') {
      const parsed = Number(trimmedDuration);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setActionNodeError('duration_sec는 0 이상의 숫자여야 합니다.');
        return;
      }
      durationSec = parsed;
    }
    if (!selectedMenuId) return;

    const requestMenuId = selectedMenuId;
    setCreatingActionNode(true);
    setActionNodeError(null);
    try {
      const created = await createPracticeActionNode({
        menuId: requestMenuId,
        stepNo,
        actionType: actionTypeDraft,
        locationId: actionLocationIdDraft,
        durationSec,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return { ...prev, action_nodes: [...prev.action_nodes, created] };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          actionNodeCount: prev.actionNodeCount + 1,
          totalNodes: prev.totalNodes + 1,
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setShowActionNodeInput(false);
        resetActionNodeDrafts();
        setActionNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setActionNodeError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setCreatingActionNode(false);
      }
    }
  };

  const handleActionNodeCreateCancel = () => {
    setShowActionNodeInput(false);
    resetActionNodeDrafts();
    setActionNodeError(null);
  };

  const resetIngredientNodeDrafts = () => {
    setIngredientStepNoDraft('');
    setIngredientIdDraft('');
    setIngredientIsDecoDraft(false);
    setIngredientQuantityDraft('');
    setIngredientInitialLocationIdDraft('');
  };

  const handleIngredientNodeCreateSubmit = async () => {
    const trimmedStep = ingredientStepNoDraft.trim();
    if (trimmedStep === '') {
      setIngredientNodeError('step_no를 입력하세요.');
      return;
    }
    const stepNo = Number(trimmedStep);
    if (!Number.isInteger(stepNo) || stepNo < 1) {
      setIngredientNodeError('step_no는 1 이상의 정수여야 합니다.');
      return;
    }
    if (ingredientIdDraft === '') {
      setIngredientNodeError('재료를 선택하세요.');
      return;
    }
    if (!storeIngredientOptions.some((o) => o.id === ingredientIdDraft)) {
      setIngredientNodeError('선택된 재료가 현재 매장 목록에 없습니다.');
      return;
    }
    const trimmedQty = ingredientQuantityDraft.trim();
    if (trimmedQty === '') {
      setIngredientNodeError('quantity를 입력하세요.');
      return;
    }
    const quantity = Number(trimmedQty);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setIngredientNodeError('quantity는 0 이상의 숫자여야 합니다.');
      return;
    }
    if (ingredientInitialLocationIdDraft === '') {
      setIngredientNodeError('초기 location을 선택하세요.');
      return;
    }
    if (
      bundle &&
      !bundle.locations.some((l) => l.id === ingredientInitialLocationIdDraft)
    ) {
      setIngredientNodeError('선택된 location이 현재 메뉴에 없습니다.');
      return;
    }
    if (!selectedMenuId) return;

    const requestMenuId = selectedMenuId;
    setCreatingIngredientNode(true);
    setIngredientNodeError(null);
    try {
      const created = await createPracticeIngredientNodeViaRpc({
        menuId: requestMenuId,
        stepNo,
        ingredientId: ingredientIdDraft,
        isDeco: ingredientIsDecoDraft,
        quantity,
        initialLocationId: ingredientInitialLocationIdDraft,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          ingredient_nodes: [...prev.ingredient_nodes, created],
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          ingredientNodeCount: prev.ingredientNodeCount + 1,
          totalNodes: prev.totalNodes + 1,
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setShowIngredientNodeInput(false);
        resetIngredientNodeDrafts();
        setIngredientNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setIngredientNodeError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setCreatingIngredientNode(false);
      }
    }
  };

  const handleIngredientNodeCreateCancel = () => {
    setShowIngredientNodeInput(false);
    resetIngredientNodeDrafts();
    setIngredientNodeError(null);
  };

  const resetHopDrafts = () => {
    setHopLocationIdDraft('');
  };

  const handleAddHopOpen = (nodeId: string) => {
    setAddHopTargetNodeId(nodeId);
    resetHopDrafts();
    setHopError(null);
  };

  const handleAddHopCancel = () => {
    setAddHopTargetNodeId(null);
    resetHopDrafts();
    setHopError(null);
  };

  const handleAddHopSubmit = async () => {
    if (!selectedMenuId || !bundle) return;
    if (!addHopTargetNodeId) return;
    const target = bundle.ingredient_nodes.find(
      (n) => n.node.id === addHopTargetNodeId,
    );
    if (!target) {
      setHopError('대상 재료 노드를 찾지 못했습니다.');
      return;
    }
    if (hopLocationIdDraft === '') {
      setHopError('이동할 location을 선택하세요.');
      return;
    }
    if (!bundle.locations.some((l) => l.id === hopLocationIdDraft)) {
      setHopError('선택된 location이 현재 메뉴에 없습니다.');
      return;
    }
    const maxSeq = target.location_path.reduce(
      (acc, p) => (p.seq > acc ? p.seq : acc),
      -1,
    );
    const nextSeq = maxSeq + 1;

    const requestMenuId = selectedMenuId;
    const requestNodeId = addHopTargetNodeId;
    setCreatingHop(true);
    setHopError(null);
    try {
      const created = await createPracticeNodeLocationPathHop({
        nodeId: requestNodeId,
        seq: nextSeq,
        locationId: hopLocationIdDraft,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          ingredient_nodes: prev.ingredient_nodes.map((n) => {
            if (n.node.id !== requestNodeId) return n;
            if (n.location_path.some((p) => p.seq === created.seq)) return n;
            return {
              ...n,
              location_path: [...n.location_path, created].sort(
                (a, b) => a.seq - b.seq,
              ),
            };
          }),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setAddHopTargetNodeId(null);
        resetHopDrafts();
        setHopError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setHopError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setCreatingHop(false);
      }
    }
  };

  const handleDeleteTailHop = async (nodeId: string) => {
    if (!selectedMenuId || !bundle) return;
    const target = bundle.ingredient_nodes.find((n) => n.node.id === nodeId);
    if (!target) {
      setLastTailHopDeleteNodeId(nodeId);
      setTailHopDeleteError('대상 재료 노드를 찾지 못했습니다.');
      return;
    }
    if (target.location_path.length <= 1) {
      setLastTailHopDeleteNodeId(nodeId);
      setTailHopDeleteError('최소 1개의 경로가 유지되어야 합니다.');
      return;
    }
    const tailSeq =
      target.location_path[target.location_path.length - 1].seq;
    const requestMenuId = selectedMenuId;
    const requestNodeId = nodeId;
    setDeletingTailHopNodeId(nodeId);
    setLastTailHopDeleteNodeId(nodeId);
    setTailHopDeleteError(null);
    try {
      await deletePracticeNodeLocationPathTailHop({
        nodeId: requestNodeId,
        seq: tailSeq,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          ingredient_nodes: prev.ingredient_nodes.map((n) => {
            if (n.node.id !== requestNodeId) return n;
            if (n.location_path.length <= 1) return n;
            return {
              ...n,
              location_path: n.location_path.filter(
                (p) => p.seq !== tailSeq,
              ),
            };
          }),
        };
      });
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setTailHopDeleteError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeletingTailHopNodeId(null);
      }
    }
  };

  const resetStepGroupDrafts = () => {
    setStepGroupDisplayStepNoDraft('');
    setStepGroupTitleDraft('');
    setStepGroupSummaryDraft('');
    setStepGroupPrimaryLocationIdDraft('');
  };

  const handleStepGroupCreateSubmit = async () => {
    const trimmedStep = stepGroupDisplayStepNoDraft.trim();
    if (trimmedStep === '') {
      setStepGroupError('display_step_no를 입력하세요.');
      return;
    }
    const stepNo = Number(trimmedStep);
    if (!Number.isInteger(stepNo) || stepNo < 1) {
      setStepGroupError('display_step_no는 1 이상의 정수여야 합니다.');
      return;
    }
    const trimmedTitle = stepGroupTitleDraft.trim();
    if (trimmedTitle === '') {
      setStepGroupError('title을 입력하세요.');
      return;
    }
    const trimmedSummary = stepGroupSummaryDraft.trim() || null;
    const primaryLocationId =
      stepGroupPrimaryLocationIdDraft === ''
        ? null
        : stepGroupPrimaryLocationIdDraft;
    if (
      primaryLocationId != null &&
      bundle &&
      !bundle.locations.some((l) => l.id === primaryLocationId)
    ) {
      setStepGroupError('선택된 location이 현재 메뉴에 없습니다.');
      return;
    }
    if (bundle?.step_groups.some((g) => g.display_step_no === stepNo)) {
      setStepGroupError(`이미 존재하는 단계 번호입니다: ${stepNo}`);
      return;
    }
    if (!selectedMenuId) return;

    const requestMenuId = selectedMenuId;
    setCreatingStepGroup(true);
    setStepGroupError(null);
    try {
      const created = await createPracticeStepGroup({
        menuId: requestMenuId,
        displayStepNo: stepNo,
        title: trimmedTitle,
        summary: trimmedSummary,
        primaryLocationId,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          step_groups: [...prev.step_groups, created].sort(
            (a, b) => a.display_step_no - b.display_step_no,
          ),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        const newCoverage: StepGroupCoverage = {
          groupId: created.id,
          displayStepNo: created.display_step_no,
          title: created.title,
          summary: created.summary,
          nodeCount: 0,
          textTacitCount: 0,
          pureMediaTacitCount: 0,
          linkedMediaCount: 0,
        };
        return {
          ...prev,
          stepGroupCount: prev.stepGroupCount + 1,
          groups: [...prev.groups, newCoverage].sort(
            (a, b) => a.displayStepNo - b.displayStepNo,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setShowStepGroupInput(false);
        resetStepGroupDrafts();
        setStepGroupError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setStepGroupError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setCreatingStepGroup(false);
      }
    }
  };

  const handleStepGroupCreateCancel = () => {
    setShowStepGroupInput(false);
    resetStepGroupDrafts();
    setStepGroupError(null);
  };

  const handleStepGroupEditStart = (g: PracticeStepGroup) => {
    if (
      editingStepGroupDraft !== null ||
      showStepGroupInput ||
      editingStepGroupSaving ||
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      detachingMediaId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    const fallbackPrimaryLocationId =
      g.primary_location_id != null &&
      bundle.locations.some((l) => l.id === g.primary_location_id)
        ? g.primary_location_id
        : '';
    setEditingStepGroupDraft({
      groupId: g.id,
      displayStepNo: String(g.display_step_no),
      title: g.title,
      summary: g.summary ?? '',
      primaryLocationId: fallbackPrimaryLocationId,
    });
    setEditingStepGroupError(null);
  };

  const handleStepGroupEditCancel = () => {
    if (editingStepGroupSaving) return;
    setEditingStepGroupDraft(null);
    setEditingStepGroupError(null);
  };

  const handleStepGroupEditSave = async () => {
    const draft = editingStepGroupDraft;
    if (!draft) return;
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const stepNo = parseInt(draft.displayStepNo, 10);
    if (!Number.isInteger(stepNo) || stepNo < 1) {
      setEditingStepGroupError('단계 번호는 1 이상의 정수여야 합니다.');
      return;
    }
    const trimmedTitle = draft.title.trim();
    if (trimmedTitle === '') {
      setEditingStepGroupError('title을 입력하세요.');
      return;
    }
    const trimmedSummary = draft.summary.trim();
    const summaryValue: string | null =
      trimmedSummary === '' ? null : trimmedSummary;
    const primaryLocationId: string | null =
      draft.primaryLocationId === '' ? null : draft.primaryLocationId;
    if (
      primaryLocationId != null &&
      !bundle.locations.some((l) => l.id === primaryLocationId)
    ) {
      setEditingStepGroupError('선택된 location이 현재 메뉴에 없습니다.');
      return;
    }
    if (
      bundle.step_groups.some(
        (g) => g.id !== draft.groupId && g.display_step_no === stepNo,
      )
    ) {
      setEditingStepGroupError(`이미 존재하는 단계 번호입니다: ${stepNo}`);
      return;
    }

    const requestMenuId = selectedMenuId;
    setEditingStepGroupSaving(true);
    setEditingStepGroupError(null);
    try {
      const updated = await updatePracticeStepGroupMeta({
        stepGroupId: draft.groupId,
        displayStepNo: stepNo,
        title: trimmedTitle,
        summary: summaryValue,
        primaryLocationId,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          step_groups: prev.step_groups
            .map((g) => (g.id === updated.id ? updated : g))
            .sort((a, b) => a.display_step_no - b.display_step_no),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          groups: prev.groups
            .map((g) =>
              g.groupId === updated.id
                ? {
                    ...g,
                    displayStepNo: updated.display_step_no,
                    title: updated.title,
                    summary: updated.summary,
                  }
                : g,
            )
            .sort((a, b) => a.displayStepNo - b.displayStepNo),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingStepGroupDraft(null);
        setEditingStepGroupError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingStepGroupError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingStepGroupSaving(false);
      }
    }
  };

  const handleTacitItemEditStart = (item: PracticeTacitItem) => {
    if (
      editingTacitItemDraft !== null ||
      showTacitItemInput ||
      editingTacitItemSaving ||
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      detachingMediaId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (item.tacit_type === 'media') return;
    setEditingTacitItemDraft({
      tacitItemId: item.id,
      title: item.title,
      body: item.body ?? '',
      flameLevel: item.flame_level ?? '',
      colorNote: item.color_note ?? '',
      viscosityNote: item.viscosity_note ?? '',
      soundNote: item.sound_note ?? '',
      textureNote: item.texture_note ?? '',
      timingNote: item.timing_note ?? '',
    });
    setEditingTacitItemError(null);
  };

  const handleTacitItemEditCancel = () => {
    if (editingTacitItemSaving) return;
    setEditingTacitItemDraft(null);
    setEditingTacitItemError(null);
  };

  const handleTacitItemEditSave = async () => {
    const draft = editingTacitItemDraft;
    if (!draft) return;
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const trimmedTitle = draft.title.trim();
    if (trimmedTitle === '') {
      setEditingTacitItemError('제목을 입력하세요.');
      return;
    }

    const bodyValue: string | null = draft.body.trim() || null;
    const flameValue: string | null = draft.flameLevel.trim() || null;
    const colorValue: string | null = draft.colorNote.trim() || null;
    const viscosityValue: string | null = draft.viscosityNote.trim() || null;
    const soundValue: string | null = draft.soundNote.trim() || null;
    const textureValue: string | null = draft.textureNote.trim() || null;
    const timingValue: string | null = draft.timingNote.trim() || null;

    const requestMenuId = selectedMenuId;
    setEditingTacitItemSaving(true);
    setEditingTacitItemError(null);
    try {
      const updated = await updatePracticeTacitItem({
        tacitItemId: draft.tacitItemId,
        title: trimmedTitle,
        body: bodyValue,
        flameLevel: flameValue,
        colorNote: colorValue,
        viscosityNote: viscosityValue,
        soundNote: soundValue,
        textureNote: textureValue,
        timingNote: timingValue,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          tacit_items: prev.tacit_items.map((t) =>
            t.id === updated.id ? updated : t,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingTacitItemDraft(null);
        setEditingTacitItemError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingTacitItemError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingTacitItemSaving(false);
      }
    }
  };

  const handleMediaUrlEditStart = (mediaId: string, currentUrl: string) => {
    if (
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      showTacitItemInput ||
      showMediaAttachInput ||
      editingTacitItemDraft !== null ||
      editingTacitItemSaving ||
      editingStepGroupDraft !== null ||
      editingStepGroupSaving ||
      editDraft !== null ||
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      detachingMediaId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!bundle.tacit_media.some((m) => m.id === mediaId)) return;
    setEditingMediaUrlDraft({ mediaId, url: currentUrl });
    setEditingMediaUrlError(null);
  };

  const handleMediaUrlEditCancel = () => {
    if (editingMediaUrlSaving) return;
    setEditingMediaUrlDraft(null);
    setEditingMediaUrlError(null);
  };

  const handleMediaUrlEditSave = async () => {
    const draft = editingMediaUrlDraft;
    if (!draft) return;
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const trimmedUrl = draft.url.trim();
    if (trimmedUrl === '') {
      setEditingMediaUrlError('URL을 입력하세요.');
      return;
    }

    if (!bundle.tacit_media.some((m) => m.id === draft.mediaId)) {
      setEditingMediaUrlError('대상 미디어를 찾을 수 없습니다.');
      return;
    }

    const requestMenuId = selectedMenuId;
    setEditingMediaUrlSaving(true);
    setEditingMediaUrlError(null);
    try {
      const updated = await updatePracticeTacitMediaUrl({
        mediaId: draft.mediaId,
        url: trimmedUrl,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          tacit_media: prev.tacit_media.map((m) =>
            m.id === updated.id ? updated : m,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingMediaUrlDraft(null);
        setEditingMediaUrlError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingMediaUrlError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingMediaUrlSaving(false);
      }
    }
  };

  const handlePureMediaTitleEditStart = (
    tacitItemId: string,
    currentTitle: string,
  ) => {
    if (
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      showTacitItemInput ||
      showMediaAttachInput ||
      editingTacitItemDraft !== null ||
      editingTacitItemSaving ||
      editingStepGroupDraft !== null ||
      editingStepGroupSaving ||
      editDraft !== null ||
      detachingMediaId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (
      !bundle.tacit_items.some(
        (t) => t.id === tacitItemId && t.tacit_type === 'media',
      )
    ) {
      return;
    }
    setEditingPureMediaTitleDraft({ tacitItemId, title: currentTitle });
    setEditingPureMediaTitleError(null);
  };

  const handlePureMediaTitleEditCancel = () => {
    if (editingPureMediaTitleSaving) return;
    setEditingPureMediaTitleDraft(null);
    setEditingPureMediaTitleError(null);
  };

  const handlePureMediaTitleEditSave = async () => {
    const draft = editingPureMediaTitleDraft;
    if (!draft) return;
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const trimmedTitle = draft.title.trim();
    if (trimmedTitle === '') {
      setEditingPureMediaTitleError('제목을 입력하세요.');
      return;
    }

    const raw = bundle.tacit_items.find((t) => t.id === draft.tacitItemId);
    if (!raw) {
      setEditingPureMediaTitleError('대상 암묵지를 찾을 수 없습니다.');
      return;
    }

    const requestMenuId = selectedMenuId;
    setEditingPureMediaTitleSaving(true);
    setEditingPureMediaTitleError(null);
    try {
      const updated = await updatePracticeTacitItem({
        tacitItemId: raw.id,
        title: trimmedTitle,
        body: raw.body,
        flameLevel: raw.flame_level,
        colorNote: raw.color_note,
        viscosityNote: raw.viscosity_note,
        soundNote: raw.sound_note,
        textureNote: raw.texture_note,
        timingNote: raw.timing_note,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          tacit_items: prev.tacit_items.map((t) =>
            t.id === updated.id ? updated : t,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingPureMediaTitleDraft(null);
        setEditingPureMediaTitleError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingPureMediaTitleError(
          e instanceof Error ? e.message : String(e),
        );
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingPureMediaTitleSaving(false);
      }
    }
  };

  const resetLinkNodeDrafts = () => {
    setLinkStepGroupIdDraft('');
    setLinkNodeIdDraft('');
  };

  const handleLinkNodeSubmit = async () => {
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    const groupId = linkStepGroupIdDraft;
    const nodeId = linkNodeIdDraft;
    if (groupId === '') {
      setLinkNodeError('스텝 그룹을 선택하세요.');
      return;
    }
    if (nodeId === '') {
      setLinkNodeError('노드를 선택하세요.');
      return;
    }
    if (!bundle.step_groups.some((g) => g.id === groupId)) {
      setLinkNodeError('선택된 스텝 그룹이 현재 메뉴에 없습니다.');
      return;
    }
    const isIngredientNode = bundle.ingredient_nodes.some(
      (n) => n.node.id === nodeId,
    );
    const isActionNode = bundle.action_nodes.some((n) => n.node.id === nodeId);
    if (!isIngredientNode && !isActionNode) {
      setLinkNodeError('선택된 노드가 현재 메뉴에 없습니다.');
      return;
    }
    if (bundle.step_group_nodes.some((sgn) => sgn.node_id === nodeId)) {
      setLinkNodeError('이미 연결된 노드입니다.');
      return;
    }
    if (!selectedMenuId) return;

    const requestMenuId = selectedMenuId;
    setLinkingNode(true);
    setLinkNodeError(null);
    try {
      const created = await createPracticeStepGroupNode({
        stepGroupId: groupId,
        nodeId,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          step_group_nodes: [...prev.step_group_nodes, created],
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) =>
            g.groupId === groupId
              ? { ...g, nodeCount: g.nodeCount + 1 }
              : g,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setShowLinkNodeInput(false);
        resetLinkNodeDrafts();
        setLinkNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setLinkNodeError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setLinkingNode(false);
      }
    }
  };

  const handleLinkNodeCancel = () => {
    setShowLinkNodeInput(false);
    resetLinkNodeDrafts();
    setLinkNodeError(null);
  };

  const handleUnlinkNode = async (stepGroupId: string, nodeId: string) => {
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;
    if (
      !bundle.step_group_nodes.some(
        (sgn) => sgn.step_group_id === stepGroupId && sgn.node_id === nodeId,
      )
    ) {
      return;
    }
    if (
      unlinkingNodeId !== null ||
      deletingIngredientNodeId !== null ||
      deletingActionNodeId !== null ||
      editingIngredientStepDraft !== null ||
      editingIngredientStepSaving ||
      editingIngredientNodeDraft !== null ||
      editingIngredientNodeSaving
    ) {
      return;
    }

    const requestMenuId = selectedMenuId;
    setUnlinkingNodeId(nodeId);
    setLastUnlinkAttemptNodeId(nodeId);
    setUnlinkNodeError(null);
    try {
      await deletePracticeStepGroupNodeLink({ stepGroupId, nodeId });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          step_group_nodes: prev.step_group_nodes.filter(
            (sgn) =>
              !(sgn.step_group_id === stepGroupId && sgn.node_id === nodeId),
          ),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          groups: prev.groups.map((g) =>
            g.groupId === stepGroupId
              ? { ...g, nodeCount: g.nodeCount - 1 }
              : g,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setUnlinkNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setUnlinkNodeError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setUnlinkingNodeId(null);
      }
    }
  };

  const resetTacitItemDrafts = () => {
    setTacitStepGroupIdDraft('');
    setTacitTypeDraft('observe');
    setTacitTitleDraft('');
    setTacitBodyDraft('');
    setTacitFlameLevelDraft('');
    setTacitColorNoteDraft('');
    setTacitViscosityNoteDraft('');
    setTacitSoundNoteDraft('');
    setTacitTextureNoteDraft('');
    setTacitTimingNoteDraft('');
  };

  const handleTacitItemCreateSubmit = async () => {
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (tacitStepGroupIdDraft === '') {
      setTacitItemError('step group을 선택하세요.');
      return;
    }
    if (!bundle.step_groups.some((g) => g.id === tacitStepGroupIdDraft)) {
      setTacitItemError('선택된 step group이 현재 메뉴에 없습니다.');
      return;
    }
    if (!(PRACTICE_TACIT_TYPES as readonly string[]).includes(tacitTypeDraft)) {
      setTacitItemError('tacit_type이 올바르지 않습니다.');
      return;
    }
    const trimmedTitle = tacitTitleDraft.trim();
    if (trimmedTitle === '') {
      setTacitItemError('제목을 입력하세요.');
      return;
    }
    if (!selectedMenuId) return;

    const groupId = tacitStepGroupIdDraft;
    const siblingSortOrders = bundle.tacit_items
      .filter((t) => t.step_group_id === groupId)
      .map((t) => t.sort_order);
    const sortOrder =
      siblingSortOrders.length === 0
        ? 0
        : Math.max(...siblingSortOrders) + 1;

    const isMedia = tacitTypeDraft === 'media';
    const requestMenuId = selectedMenuId;
    setCreatingTacitItem(true);
    setTacitItemError(null);
    try {
      const created = await createPracticeTacitItem({
        stepGroupId: groupId,
        tacitType: tacitTypeDraft,
        title: trimmedTitle,
        body: isMedia ? null : tacitBodyDraft.trim() || null,
        sortOrder,
        flameLevel: isMedia ? null : tacitFlameLevelDraft.trim() || null,
        colorNote: isMedia ? null : tacitColorNoteDraft.trim() || null,
        viscosityNote: isMedia ? null : tacitViscosityNoteDraft.trim() || null,
        soundNote: isMedia ? null : tacitSoundNoteDraft.trim() || null,
        textureNote: isMedia ? null : tacitTextureNoteDraft.trim() || null,
        timingNote: isMedia ? null : tacitTimingNoteDraft.trim() || null,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return { ...prev, tacit_items: [...prev.tacit_items, created] };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        const createdIsMedia = created.tacit_type === 'media';
        return {
          ...prev,
          tacitItemCount: prev.tacitItemCount + 1,
          groups: prev.groups.map((g) =>
            g.groupId === created.step_group_id
              ? createdIsMedia
                ? { ...g, pureMediaTacitCount: g.pureMediaTacitCount + 1 }
                : { ...g, textTacitCount: g.textTacitCount + 1 }
              : g,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setShowTacitItemInput(false);
        resetTacitItemDrafts();
        setTacitItemError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setTacitItemError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setCreatingTacitItem(false);
      }
    }
  };

  const handleTacitItemCreateCancel = () => {
    setShowTacitItemInput(false);
    resetTacitItemDrafts();
    setTacitItemError(null);
  };

  const resetTacitMediaDrafts = () => {
    setMediaTargetStepGroupIdDraft('');
    setMediaTargetTacitItemIdDraft('');
    setMediaTypeDraft('image');
    setMediaUrlDraft('');
  };

  const handleTacitMediaCreateSubmit = async () => {
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (mediaTargetStepGroupIdDraft === '') {
      setTacitMediaError('step group을 선택하세요.');
      return;
    }
    if (
      !bundle.step_groups.some((g) => g.id === mediaTargetStepGroupIdDraft)
    ) {
      setTacitMediaError('선택된 step group이 현재 메뉴에 없습니다.');
      return;
    }
    if (mediaTargetTacitItemIdDraft === '') {
      setTacitMediaError('대상 암묵지를 선택하세요.');
      return;
    }
    const targetTacit = bundle.tacit_items.find(
      (t) =>
        t.id === mediaTargetTacitItemIdDraft &&
        t.step_group_id === mediaTargetStepGroupIdDraft,
    );
    if (!targetTacit) {
      setTacitMediaError('선택된 암묵지가 현재 스텝 그룹에 없습니다.');
      return;
    }
    if (
      !(PRACTICE_TACIT_MEDIA_TYPES as readonly string[]).includes(mediaTypeDraft)
    ) {
      setTacitMediaError('media_type이 올바르지 않습니다.');
      return;
    }
    const trimmedUrl = mediaUrlDraft.trim();
    if (trimmedUrl === '') {
      setTacitMediaError('URL을 입력하세요.');
      return;
    }
    if (!selectedMenuId) return;

    const targetTacitItemId = targetTacit.id;
    const targetGroupId = targetTacit.step_group_id;
    const siblingSortOrders = bundle.tacit_media
      .filter((m) => m.tacit_item_id === targetTacitItemId)
      .map((m) => m.sort_order);
    const sortOrder =
      siblingSortOrders.length === 0
        ? 0
        : Math.max(...siblingSortOrders) + 1;

    const requestMenuId = selectedMenuId;
    setCreatingTacitMedia(true);
    setTacitMediaError(null);
    try {
      const created = await createPracticeTacitMedia({
        tacitItemId: targetTacitItemId,
        mediaType: mediaTypeDraft,
        url: trimmedUrl,
        sortOrder,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return { ...prev, tacit_media: [...prev.tacit_media, created] };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          tacitMediaCount: prev.tacitMediaCount + 1,
          groups: prev.groups.map((g) =>
            g.groupId === targetGroupId
              ? { ...g, linkedMediaCount: g.linkedMediaCount + 1 }
              : g,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setShowMediaAttachInput(false);
        resetTacitMediaDrafts();
        setTacitMediaError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setTacitMediaError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setCreatingTacitMedia(false);
      }
    }
  };

  const handleTacitMediaCreateCancel = () => {
    setShowMediaAttachInput(false);
    resetTacitMediaDrafts();
    setTacitMediaError(null);
  };

  const handleDetachTacitMedia = async (mediaId: string) => {
    if (
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      showTacitItemInput ||
      showMediaAttachInput ||
      editingTacitItemDraft !== null ||
      editingTacitItemSaving ||
      editingStepGroupDraft !== null ||
      editingStepGroupSaving ||
      editDraft !== null ||
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      detachingMediaId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const targetMedia = bundle.tacit_media.find((m) => m.id === mediaId);
    if (!targetMedia) {
      setDetachMediaError({
        mediaId,
        message: '대상 미디어를 찾을 수 없습니다.',
      });
      return;
    }
    const parentTacit = bundle.tacit_items.find(
      (t) => t.id === targetMedia.tacit_item_id,
    );
    if (!parentTacit) {
      setDetachMediaError({
        mediaId,
        message: '연결된 스텝 그룹을 찾을 수 없습니다.',
      });
      return;
    }
    const targetStepGroupId = parentTacit.step_group_id;

    if (parentTacit.tacit_type === 'media') {
      const siblingCount = bundle.tacit_media.filter(
        (m) => m.tacit_item_id === parentTacit.id,
      ).length;
      if (siblingCount <= 1) {
        setDetachMediaError({
          mediaId,
          message: '마지막 미디어는 제거할 수 없습니다.',
        });
        return;
      }
    }

    const requestMenuId = selectedMenuId;
    setDetachingMediaId(mediaId);
    setDetachMediaError(null);
    try {
      await deletePracticeTacitMedia({ mediaId });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          tacit_media: prev.tacit_media.filter((m) => m.id !== mediaId),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          tacitMediaCount: prev.tacitMediaCount - 1,
          groups: prev.groups.map((g) =>
            g.groupId === targetStepGroupId
              ? { ...g, linkedMediaCount: g.linkedMediaCount - 1 }
              : g,
          ),
        };
      });
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDetachMediaError({
          mediaId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDetachingMediaId(null);
      }
    }
  };

  const handleDeletePureMediaTacit = async (tacitItemId: string) => {
    if (
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      showTacitItemInput ||
      showMediaAttachInput ||
      editingTacitItemDraft !== null ||
      editingTacitItemSaving ||
      editingStepGroupDraft !== null ||
      editingStepGroupSaving ||
      editDraft !== null ||
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      detachingMediaId !== null ||
      deletingPureMediaTacitId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const parentTacit = bundle.tacit_items.find(
      (t) => t.id === tacitItemId && t.tacit_type === 'media',
    );
    if (!parentTacit) {
      setDeletePureMediaError({
        tacitItemId,
        message: '대상 tacit을 찾을 수 없습니다.',
      });
      return;
    }
    const targetStepGroupId = parentTacit.step_group_id;
    const removedMediaCount = bundle.tacit_media.filter(
      (m) => m.tacit_item_id === tacitItemId,
    ).length;

    const requestMenuId = selectedMenuId;
    setDeletingPureMediaTacitId(tacitItemId);
    setDeletePureMediaError(null);
    try {
      await deletePracticeTacitItem({ tacitItemId });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          tacit_items: prev.tacit_items.filter((t) => t.id !== tacitItemId),
          tacit_media: prev.tacit_media.filter(
            (m) => m.tacit_item_id !== tacitItemId,
          ),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          tacitItemCount: prev.tacitItemCount - 1,
          tacitMediaCount: prev.tacitMediaCount - removedMediaCount,
          groups: prev.groups.map((g) =>
            g.groupId === targetStepGroupId
              ? {
                  ...g,
                  pureMediaTacitCount: g.pureMediaTacitCount - 1,
                  linkedMediaCount: g.linkedMediaCount - removedMediaCount,
                }
              : g,
          ),
        };
      });
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeletePureMediaError({
          tacitItemId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeletingPureMediaTacitId(null);
      }
    }
  };

  const handleDeleteTextTacit = async (tacitItemId: string) => {
    if (
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      showTacitItemInput ||
      showMediaAttachInput ||
      editingTacitItemDraft !== null ||
      editingTacitItemSaving ||
      editingStepGroupDraft !== null ||
      editingStepGroupSaving ||
      editDraft !== null ||
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      detachingMediaId !== null ||
      deletingPureMediaTacitId !== null ||
      deletingTextTacitId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const parentTacit = bundle.tacit_items.find(
      (t) => t.id === tacitItemId && t.tacit_type !== 'media',
    );
    if (!parentTacit) {
      setDeleteTextTacitError({
        tacitItemId,
        message: '대상 tacit을 찾을 수 없습니다.',
      });
      return;
    }
    const targetStepGroupId = parentTacit.step_group_id;
    const removedMediaCount = bundle.tacit_media.filter(
      (m) => m.tacit_item_id === tacitItemId,
    ).length;

    const requestMenuId = selectedMenuId;
    setDeletingTextTacitId(tacitItemId);
    setDeleteTextTacitError(null);
    try {
      await deletePracticeTacitItem({ tacitItemId });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          tacit_items: prev.tacit_items.filter((t) => t.id !== tacitItemId),
          tacit_media: prev.tacit_media.filter(
            (m) => m.tacit_item_id !== tacitItemId,
          ),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          tacitItemCount: prev.tacitItemCount - 1,
          tacitMediaCount: prev.tacitMediaCount - removedMediaCount,
          groups: prev.groups.map((g) =>
            g.groupId === targetStepGroupId
              ? {
                  ...g,
                  textTacitCount: g.textTacitCount - 1,
                  linkedMediaCount: g.linkedMediaCount - removedMediaCount,
                }
              : g,
          ),
        };
      });
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeleteTextTacitError({
          tacitItemId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeletingTextTacitId(null);
      }
    }
  };

  const handleDeleteStepGroup = async (stepGroupId: string) => {
    if (
      editingStepGroupDraft !== null ||
      showStepGroupInput ||
      editingStepGroupSaving ||
      editingMediaUrlDraft !== null ||
      editingMediaUrlSaving ||
      editingPureMediaTitleDraft !== null ||
      editingPureMediaTitleSaving ||
      detachingMediaId !== null ||
      editingTacitItemDraft !== null ||
      editingTacitItemSaving ||
      creatingTacitItem ||
      creatingTacitMedia ||
      creatingStepGroup ||
      linkingNode ||
      unlinkingNodeId !== null ||
      deletingPureMediaTacitId !== null ||
      deletingTextTacitId !== null ||
      deletingStepGroupId !== null
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const removedTacitIds = bundle.tacit_items
      .filter((ti) => ti.step_group_id === stepGroupId)
      .map((ti) => ti.id);
    const removedTacitIdSet = new Set(removedTacitIds);
    const removedTacitCount = removedTacitIds.length;
    const removedMediaCount = bundle.tacit_media.filter((m) =>
      removedTacitIdSet.has(m.tacit_item_id),
    ).length;

    const requestMenuId = selectedMenuId;
    setDeletingStepGroupId(stepGroupId);
    setDeleteStepGroupError(null);
    try {
      await deletePracticeStepGroup({ stepGroupId });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          step_groups: prev.step_groups.filter((sg) => sg.id !== stepGroupId),
          step_group_nodes: prev.step_group_nodes.filter(
            (sgn) => sgn.step_group_id !== stepGroupId,
          ),
          tacit_items: prev.tacit_items.filter(
            (ti) => ti.step_group_id !== stepGroupId,
          ),
          tacit_media: prev.tacit_media.filter(
            (m) => !removedTacitIdSet.has(m.tacit_item_id),
          ),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          stepGroupCount: prev.stepGroupCount - 1,
          tacitItemCount: prev.tacitItemCount - removedTacitCount,
          tacitMediaCount: prev.tacitMediaCount - removedMediaCount,
          groups: prev.groups.filter((g) => g.groupId !== stepGroupId),
        };
      });
      setExpandedGroupId((prev) => (prev === stepGroupId ? null : prev));
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeleteStepGroupError({
          stepGroupId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeletingStepGroupId(null);
      }
    }
  };

  const handleDeleteActionNode = async (nodeId: string) => {
    if (
      showActionNodeInput ||
      creatingActionNode ||
      showLinkNodeInput ||
      linkingNode ||
      unlinkingNodeId !== null ||
      deletingActionNodeId !== null ||
      deletingStepGroupId !== null ||
      editingActionNodeDraft !== null ||
      editingActionNodeSaving ||
      editingActionStepDraft !== null ||
      editingActionStepSaving ||
      editingIngredientStepDraft !== null ||
      editingIngredientStepSaving ||
      editingIngredientNodeDraft !== null ||
      editingIngredientNodeSaving
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const target = bundle.action_nodes.find((a) => a.node.id === nodeId);
    if (!target) {
      setDeleteActionNodeError({
        nodeId,
        message: '대상 액션 노드를 찾지 못했습니다.',
      });
      return;
    }
    const linkedGroup = bundle.step_group_nodes.find(
      (sgn) => sgn.node_id === nodeId,
    );
    const linkedGroupId = linkedGroup?.step_group_id ?? null;

    const requestMenuId = selectedMenuId;
    setDeletingActionNodeId(nodeId);
    setDeleteActionNodeError(null);
    try {
      await deletePracticeRecipeNode({ nodeId });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          action_nodes: prev.action_nodes.filter((a) => a.node.id !== nodeId),
          step_group_nodes: prev.step_group_nodes.filter(
            (sgn) => sgn.node_id !== nodeId,
          ),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          actionNodeCount: prev.actionNodeCount - 1,
          totalNodes: prev.totalNodes - 1,
          groups:
            linkedGroupId == null
              ? prev.groups
              : prev.groups.map((g) =>
                  g.groupId === linkedGroupId
                    ? { ...g, nodeCount: g.nodeCount - 1 }
                    : g,
                ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeleteActionNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeleteActionNodeError({
          nodeId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeletingActionNodeId(null);
      }
    }
  };

  const handleActionNodeEditStart = (item: { nodeId: string }) => {
    if (
      showActionNodeInput ||
      creatingActionNode ||
      showLinkNodeInput ||
      linkingNode ||
      unlinkingNodeId !== null ||
      deletingActionNodeId !== null ||
      deletingIngredientNodeId !== null ||
      deletingStepGroupId !== null ||
      editingActionNodeDraft !== null ||
      editingActionNodeSaving ||
      editingActionStepDraft !== null ||
      editingActionStepSaving ||
      editingIngredientStepDraft !== null ||
      editingIngredientStepSaving ||
      editingIngredientNodeDraft !== null ||
      editingIngredientNodeSaving
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const target = bundle.action_nodes.find((a) => a.node.id === item.nodeId);
    if (!target) {
      setEditingActionNodeError({
        nodeId: item.nodeId,
        message: '대상 액션 노드를 찾지 못했습니다.',
      });
      return;
    }
    const fallbackLocationId =
      target.action.location_id != null &&
      bundle.locations.some((l) => l.id === target.action.location_id)
        ? target.action.location_id
        : '';
    setEditingActionNodeDraft({
      nodeId: item.nodeId,
      actionType: target.action.action_type,
      locationId: fallbackLocationId,
      duration:
        target.action.duration_sec == null
          ? ''
          : String(target.action.duration_sec),
    });
    setEditingActionNodeError(null);
  };

  const handleActionNodeEditCancel = () => {
    if (editingActionNodeSaving) return;
    setEditingActionNodeDraft(null);
    setEditingActionNodeError(null);
  };

  const handleActionNodeEditSave = async () => {
    const draft = editingActionNodeDraft;
    if (!draft) return;
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    if (!PRACTICE_ACTION_TYPES.includes(draft.actionType)) {
      setEditingActionNodeError({
        nodeId: draft.nodeId,
        message: 'action_type이 올바르지 않습니다.',
      });
      return;
    }
    if (draft.locationId === '') {
      setEditingActionNodeError({
        nodeId: draft.nodeId,
        message: 'location을 선택하세요.',
      });
      return;
    }
    if (!bundle.locations.some((l) => l.id === draft.locationId)) {
      setEditingActionNodeError({
        nodeId: draft.nodeId,
        message: '선택된 location이 현재 메뉴에 없습니다.',
      });
      return;
    }

    let durationSec: number | null = null;
    const trimmedDuration = draft.duration.trim();
    if (trimmedDuration !== '') {
      const parsed = Number(trimmedDuration);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setEditingActionNodeError({
          nodeId: draft.nodeId,
          message: 'duration_sec는 0 이상의 숫자여야 합니다.',
        });
        return;
      }
      durationSec = parsed;
    }

    const requestMenuId = selectedMenuId;
    setEditingActionNodeSaving(true);
    setEditingActionNodeError(null);
    try {
      const updated = await updatePracticeActionNode({
        nodeId: draft.nodeId,
        actionType: draft.actionType,
        locationId: draft.locationId,
        durationSec,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          action_nodes: prev.action_nodes.map((a) =>
            a.node.id === draft.nodeId ? { ...a, action: updated } : a,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingActionNodeDraft(null);
        setEditingActionNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingActionNodeError({
          nodeId: draft.nodeId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingActionNodeSaving(false);
      }
    }
  };

  const commitStepNoEdit = async (args: {
    draft: { nodeId: string; stepNo: string };
    setDraft: (value: { nodeId: string; stepNo: string } | null) => void;
    setSaving: (value: boolean) => void;
    setError: (value: { nodeId: string; message: string } | null) => void;
    mergeBundle: (
      prev: PracticeMenuBundle,
      updated: PracticeRecipeNode,
    ) => PracticeMenuBundle;
  }): Promise<void> => {
    const { draft, setDraft, setSaving, setError, mergeBundle } = args;
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const trimmedStep = draft.stepNo.trim();
    if (trimmedStep === '') {
      setError({
        nodeId: draft.nodeId,
        message: 'step_no를 입력하세요.',
      });
      return;
    }
    const stepNo = Number(trimmedStep);
    if (!Number.isInteger(stepNo) || stepNo < 1) {
      setError({
        nodeId: draft.nodeId,
        message: 'step_no는 1 이상의 정수여야 합니다.',
      });
      return;
    }

    const requestMenuId = selectedMenuId;
    setSaving(true);
    setError(null);
    try {
      const updated = await updatePracticeRecipeNodeStepNo({
        nodeId: draft.nodeId,
        stepNo,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return mergeBundle(prev, updated);
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setDraft(null);
        setError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setError({
          nodeId: draft.nodeId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setSaving(false);
      }
    }
  };

  const handleActionStepEditStart = (item: { nodeId: string }) => {
    if (
      showActionNodeInput ||
      creatingActionNode ||
      showLinkNodeInput ||
      linkingNode ||
      unlinkingNodeId !== null ||
      deletingActionNodeId !== null ||
      deletingIngredientNodeId !== null ||
      deletingStepGroupId !== null ||
      editingActionNodeDraft !== null ||
      editingActionNodeSaving ||
      editingActionStepDraft !== null ||
      editingActionStepSaving ||
      editingIngredientStepDraft !== null ||
      editingIngredientStepSaving ||
      editingIngredientNodeDraft !== null ||
      editingIngredientNodeSaving
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const target = bundle.action_nodes.find((a) => a.node.id === item.nodeId);
    if (!target) {
      setEditingActionStepError({
        nodeId: item.nodeId,
        message: '대상 액션 노드를 찾지 못했습니다.',
      });
      return;
    }
    setEditingActionStepDraft({
      nodeId: item.nodeId,
      stepNo: String(target.node.step_no),
    });
    setEditingActionStepError(null);
  };

  const handleActionStepEditCancel = () => {
    if (editingActionStepSaving) return;
    setEditingActionStepDraft(null);
    setEditingActionStepError(null);
  };

  const handleActionStepEditSave = async () => {
    const draft = editingActionStepDraft;
    if (!draft) return;
    await commitStepNoEdit({
      draft,
      setDraft: setEditingActionStepDraft,
      setSaving: setEditingActionStepSaving,
      setError: setEditingActionStepError,
      mergeBundle: (prev, updated) => ({
        ...prev,
        action_nodes: prev.action_nodes.map((a) =>
          a.node.id === draft.nodeId ? { ...a, node: updated } : a,
        ),
      }),
    });
  };

  const handleDeleteIngredientNode = async (nodeId: string) => {
    if (
      showIngredientNodeInput ||
      creatingIngredientNode ||
      addHopTargetNodeId !== null ||
      creatingHop ||
      deletingTailHopNodeId !== null ||
      showLinkNodeInput ||
      linkingNode ||
      unlinkingNodeId !== null ||
      deletingActionNodeId !== null ||
      deletingIngredientNodeId !== null ||
      deletingStepGroupId !== null ||
      editingIngredientStepDraft !== null ||
      editingIngredientStepSaving ||
      editingIngredientNodeDraft !== null ||
      editingIngredientNodeSaving
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const target = bundle.ingredient_nodes.find((n) => n.node.id === nodeId);
    if (!target) {
      setDeleteIngredientNodeError({
        nodeId,
        message: '대상 재료 노드를 찾지 못했습니다.',
      });
      return;
    }
    const linkedGroup = bundle.step_group_nodes.find(
      (sgn) => sgn.node_id === nodeId,
    );
    const linkedGroupId = linkedGroup?.step_group_id ?? null;

    const requestMenuId = selectedMenuId;
    setDeletingIngredientNodeId(nodeId);
    setDeleteIngredientNodeError(null);
    try {
      await deletePracticeRecipeNode({ nodeId });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          ingredient_nodes: prev.ingredient_nodes.filter(
            (n) => n.node.id !== nodeId,
          ),
          step_group_nodes: prev.step_group_nodes.filter(
            (sgn) => sgn.node_id !== nodeId,
          ),
        };
      });
      setSummary((prev) => {
        if (!prev || prev.menuId !== requestMenuId) return prev;
        return {
          ...prev,
          ingredientNodeCount: prev.ingredientNodeCount - 1,
          totalNodes: prev.totalNodes - 1,
          groups:
            linkedGroupId == null
              ? prev.groups
              : prev.groups.map((g) =>
                  g.groupId === linkedGroupId
                    ? { ...g, nodeCount: g.nodeCount - 1 }
                    : g,
                ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeleteIngredientNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeleteIngredientNodeError({
          nodeId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setDeletingIngredientNodeId(null);
      }
    }
  };

  const handleIngredientStepEditStart = (item: { nodeId: string }) => {
    if (
      showIngredientNodeInput ||
      creatingIngredientNode ||
      addHopTargetNodeId !== null ||
      creatingHop ||
      deletingTailHopNodeId !== null ||
      showLinkNodeInput ||
      linkingNode ||
      unlinkingNodeId !== null ||
      deletingActionNodeId !== null ||
      deletingIngredientNodeId !== null ||
      deletingStepGroupId !== null ||
      editingActionNodeDraft !== null ||
      editingActionNodeSaving ||
      editingActionStepDraft !== null ||
      editingActionStepSaving ||
      editingIngredientStepDraft !== null ||
      editingIngredientStepSaving ||
      editingIngredientNodeDraft !== null ||
      editingIngredientNodeSaving
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const target = bundle.ingredient_nodes.find(
      (n) => n.node.id === item.nodeId,
    );
    if (!target) {
      setEditingIngredientStepError({
        nodeId: item.nodeId,
        message: '대상 재료 노드를 찾지 못했습니다.',
      });
      return;
    }
    setEditingIngredientStepDraft({
      nodeId: item.nodeId,
      stepNo: String(target.node.step_no),
    });
    setEditingIngredientStepError(null);
  };

  const handleIngredientStepEditCancel = () => {
    if (editingIngredientStepSaving) return;
    setEditingIngredientStepDraft(null);
    setEditingIngredientStepError(null);
  };

  const handleIngredientStepEditSave = async () => {
    const draft = editingIngredientStepDraft;
    if (!draft) return;
    await commitStepNoEdit({
      draft,
      setDraft: setEditingIngredientStepDraft,
      setSaving: setEditingIngredientStepSaving,
      setError: setEditingIngredientStepError,
      mergeBundle: (prev, updated) => ({
        ...prev,
        ingredient_nodes: prev.ingredient_nodes.map((n) =>
          n.node.id === draft.nodeId ? { ...n, node: updated } : n,
        ),
      }),
    });
  };

  const handleIngredientNodeEditStart = (item: { nodeId: string }) => {
    if (
      showIngredientNodeInput ||
      creatingIngredientNode ||
      addHopTargetNodeId !== null ||
      creatingHop ||
      deletingTailHopNodeId !== null ||
      showLinkNodeInput ||
      linkingNode ||
      unlinkingNodeId !== null ||
      deletingActionNodeId !== null ||
      deletingIngredientNodeId !== null ||
      deletingStepGroupId !== null ||
      editingActionNodeDraft !== null ||
      editingActionNodeSaving ||
      editingActionStepDraft !== null ||
      editingActionStepSaving ||
      editingIngredientStepDraft !== null ||
      editingIngredientStepSaving ||
      editingIngredientNodeDraft !== null ||
      editingIngredientNodeSaving
    ) {
      return;
    }
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    const target = bundle.ingredient_nodes.find(
      (n) => n.node.id === item.nodeId,
    );
    if (!target) {
      setEditingIngredientNodeError({
        nodeId: item.nodeId,
        message: '대상 재료 노드를 찾지 못했습니다.',
      });
      return;
    }
    const fallbackIngredientId = storeIngredientOptions.some(
      (o) => o.id === target.ingredient.ingredient_id,
    )
      ? target.ingredient.ingredient_id
      : '';
    setEditingIngredientNodeDraft({
      nodeId: item.nodeId,
      ingredientId: fallbackIngredientId,
      isDeco: target.ingredient.is_deco,
      quantity: String(target.ingredient.quantity),
    });
    setEditingIngredientNodeError(null);
  };

  const handleIngredientNodeEditCancel = () => {
    if (editingIngredientNodeSaving) return;
    setEditingIngredientNodeDraft(null);
    setEditingIngredientNodeError(null);
  };

  const handleIngredientNodeEditSave = async () => {
    const draft = editingIngredientNodeDraft;
    if (!draft) return;
    if (!bundle || bundle.menu.id !== selectedMenuId) return;
    if (!selectedMenuId) return;

    if (draft.ingredientId === '') {
      setEditingIngredientNodeError({
        nodeId: draft.nodeId,
        message: '재료를 선택하세요.',
      });
      return;
    }
    if (!storeIngredientOptions.some((o) => o.id === draft.ingredientId)) {
      setEditingIngredientNodeError({
        nodeId: draft.nodeId,
        message: '선택된 재료가 현재 매장 목록에 없습니다.',
      });
      return;
    }
    const trimmedQty = draft.quantity.trim();
    if (trimmedQty === '') {
      setEditingIngredientNodeError({
        nodeId: draft.nodeId,
        message: 'quantity를 입력하세요.',
      });
      return;
    }
    const quantity = Number(trimmedQty);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setEditingIngredientNodeError({
        nodeId: draft.nodeId,
        message: 'quantity는 0 이상의 숫자여야 합니다.',
      });
      return;
    }

    const requestMenuId = selectedMenuId;
    setEditingIngredientNodeSaving(true);
    setEditingIngredientNodeError(null);
    try {
      const updated = await updatePracticeIngredientNode({
        nodeId: draft.nodeId,
        ingredientId: draft.ingredientId,
        isDeco: draft.isDeco,
        quantity,
      });
      setBundle((prev) => {
        if (!prev || prev.menu.id !== requestMenuId) return prev;
        return {
          ...prev,
          ingredient_nodes: prev.ingredient_nodes.map((n) =>
            n.node.id === draft.nodeId ? { ...n, ingredient: updated } : n,
          ),
        };
      });
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingIngredientNodeDraft(null);
        setEditingIngredientNodeError(null);
      }
    } catch (e: unknown) {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingIngredientNodeError({
          nodeId: draft.nodeId,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      if (selectedMenuIdRef.current === requestMenuId) {
        setEditingIngredientNodeSaving(false);
      }
    }
  };

  // ——— Effect 1: menu list fetch ———
  useEffect(() => {
    if (!selectedStore) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchPracticeMenus(selectedStore.id);
        if (!cancelled) setMenus(data);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    return () => { cancelled = true; };
  }, [selectedStore]);

  // ——— Effect 1b: store ingredient options fetch (page-wide error와 격리) ———
  useEffect(() => {
    if (!selectedStore) return;
    let cancelled = false;

    const load = async () => {
      setStoreIngredientOptionsLoading(true);
      setStoreIngredientOptionsError(null);
      try {
        const options = await fetchStoreIngredientOptions(selectedStore.id);
        if (!cancelled) setStoreIngredientOptions(options);
      } catch (e: unknown) {
        if (!cancelled) {
          setStoreIngredientOptionsError(
            e instanceof Error ? e.message : String(e),
          );
          setStoreIngredientOptions([]);
        }
      } finally {
        if (!cancelled) setStoreIngredientOptionsLoading(false);
      }
    };
    load();

    return () => { cancelled = true; };
  }, [selectedStore]);

  // ——— Effect 2: bundle fetch on menu selection ———
  useEffect(() => {
    setSummary(null);
    setBundle(null);
    setSummaryError(null);
    setSummaryLoading(false);
    setExpandedGroupId(null);
    setEditDraft(null);
    setEditSaving(false);
    setEditError(null);
    setPreviewBroken(false);
    setShowLocationInput(false);
    setLocationKeyDraft('');
    setLocationLabelDraft('');
    setCreatingLocation(false);
    setLocationError(null);
    setShowActionNodeInput(false);
    setActionStepNoDraft('');
    setActionTypeDraft('fry');
    setActionLocationIdDraft('');
    setActionDurationDraft('');
    setCreatingActionNode(false);
    setActionNodeError(null);
    setShowIngredientNodeInput(false);
    setIngredientStepNoDraft('');
    setIngredientIdDraft('');
    setIngredientIsDecoDraft(false);
    setIngredientQuantityDraft('');
    setIngredientInitialLocationIdDraft('');
    setCreatingIngredientNode(false);
    setIngredientNodeError(null);
    setAddHopTargetNodeId(null);
    setHopLocationIdDraft('');
    setCreatingHop(false);
    setHopError(null);
    setDeletingTailHopNodeId(null);
    setLastTailHopDeleteNodeId(null);
    setTailHopDeleteError(null);
    setShowStepGroupInput(false);
    setStepGroupDisplayStepNoDraft('');
    setStepGroupTitleDraft('');
    setStepGroupSummaryDraft('');
    setStepGroupPrimaryLocationIdDraft('');
    setCreatingStepGroup(false);
    setStepGroupError(null);
    setEditingStepGroupDraft(null);
    setEditingStepGroupSaving(false);
    setEditingStepGroupError(null);
    setShowLinkNodeInput(false);
    setLinkStepGroupIdDraft('');
    setLinkNodeIdDraft('');
    setLinkingNode(false);
    setLinkNodeError(null);
    setUnlinkingNodeId(null);
    setLastUnlinkAttemptNodeId(null);
    setUnlinkNodeError(null);
    setShowTacitItemInput(false);
    setTacitStepGroupIdDraft('');
    setTacitTypeDraft('observe');
    setTacitTitleDraft('');
    setTacitBodyDraft('');
    setTacitFlameLevelDraft('');
    setTacitColorNoteDraft('');
    setTacitViscosityNoteDraft('');
    setTacitSoundNoteDraft('');
    setTacitTextureNoteDraft('');
    setTacitTimingNoteDraft('');
    setCreatingTacitItem(false);
    setTacitItemError(null);
    setEditingTacitItemDraft(null);
    setEditingTacitItemSaving(false);
    setEditingTacitItemError(null);
    setShowMediaAttachInput(false);
    setMediaTargetStepGroupIdDraft('');
    setMediaTargetTacitItemIdDraft('');
    setMediaTypeDraft('image');
    setMediaUrlDraft('');
    setCreatingTacitMedia(false);
    setTacitMediaError(null);
    setEditingMediaUrlDraft(null);
    setEditingMediaUrlSaving(false);
    setEditingMediaUrlError(null);
    setEditingPureMediaTitleDraft(null);
    setEditingPureMediaTitleSaving(false);
    setEditingPureMediaTitleError(null);
    setDetachingMediaId(null);
    setDetachMediaError(null);
    setDeletingPureMediaTacitId(null);
    setDeletePureMediaError(null);
    setDeletingTextTacitId(null);
    setDeleteTextTacitError(null);
    setDeletingStepGroupId(null);
    setDeleteStepGroupError(null);
    setDeletingActionNodeId(null);
    setDeleteActionNodeError(null);
    setEditingActionNodeDraft(null);
    setEditingActionNodeSaving(false);
    setEditingActionNodeError(null);
    setEditingActionStepDraft(null);
    setEditingActionStepSaving(false);
    setEditingActionStepError(null);
    setDeletingIngredientNodeId(null);
    setDeleteIngredientNodeError(null);
    setEditingIngredientStepDraft(null);
    setEditingIngredientStepSaving(false);
    setEditingIngredientStepError(null);
    setEditingIngredientNodeDraft(null);
    setEditingIngredientNodeSaving(false);
    setEditingIngredientNodeError(null);

    if (!selectedMenuId) return;
    let cancelled = false;
    setSummaryLoading(true);

    fetchPracticeMenuBundle(selectedMenuId)
      .then((b) => {
        if (!cancelled) {
          setBundle(b);
          setSummary(buildMenuStructureSummary(b));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setSummaryError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => { cancelled = true; };
  }, [selectedMenuId]);

  useEffect(() => {
    if (bundle && bundle.menu.id === selectedMenuId) {
      setPreviewEngineState(bootstrapEngineState(bundle));
    } else {
      setPreviewEngineState(null);
    }
  }, [bundle, selectedMenuId]);

  const handlePreviewReset = () => {
    if (bundle && bundle.menu.id === selectedMenuId) {
      setPreviewEngineState(bootstrapEngineState(bundle));
    }
  };

  const handlePreviewActionClick = (action: LegalAction) => {
    setPreviewEngineState((prev) => {
      if (!prev) return prev;
      switch (action.type) {
        case 'place': {
          const r = tryPlaceIngredient(
            action.ingredientId,
            action.targetLocationId,
            prev,
          );
          return r.allowed ? r.newState : prev;
        }
        case 'action': {
          const r = tryExecuteAction(action.actionType, action.locationId, prev);
          return r.allowed ? r.newState : prev;
        }
        case 'pour': {
          const r = tryPour(
            action.sourceLocationId,
            action.targetLocationId,
            prev,
          );
          return r.allowed ? r.newState : prev;
        }
      }
    });
  };

  if (!selectedStore) return null;

  return (
    <div className={styles.container}>
      <h1>연습 관리자</h1>
      <p className={styles.subtitle}>메뉴별 구조 현황을 확인합니다.</p>

      {!loading && !error && (
        <div className={styles.createMenuSection}>
          {!showCreateInput && (
            <button
              className={styles.createMenuBtn}
              onClick={() => {
                setCreateError(null);
                setShowCreateInput(true);
              }}
            >
              + 새 메뉴 추가
            </button>
          )}
          {showCreateInput && (
            <div className={styles.createMenuForm}>
              <label className={styles.metaEditLabel}>
                메뉴 이름
                <input
                  className={styles.metaEditInput}
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateSubmit();
                    if (e.key === 'Escape') handleCreateCancel();
                  }}
                  disabled={creating}
                  autoFocus
                  placeholder="예: 아메리카노"
                />
              </label>
              {createError && <p className={styles.errorText}>{createError}</p>}
              <div className={styles.metaEditActions}>
                <button
                  className={styles.metaEditSaveBtn}
                  onClick={handleCreateSubmit}
                  disabled={creating}
                >
                  {creating ? '생성 중...' : '생성'}
                </button>
                <button
                  className={styles.metaEditCancelBtn}
                  onClick={handleCreateCancel}
                  disabled={creating}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <p className={styles.loadingText}>메뉴 목록 불러오는 중...</p>}

      {error && <p className={styles.errorText}>{error}</p>}

      {!loading && !error && menus.length === 0 && (
        <p className={styles.subtitle}>등록된 메뉴가 없습니다.</p>
      )}

      {!loading && !error && menus.length > 0 && (
        <div className={styles.menuList}>
          {menus.map((menu) => {
            const isSelected = selectedMenuId === menu.id;
            const showImage =
              menu.image_url != null &&
              menu.image_url.trim() !== '' &&
              !brokenImages.has(menu.id);

            let cardClass: string;
            if (isSelected) {
              cardClass = showImage
                ? styles.menuCardSelectedWithImage
                : styles.menuCardSelected;
            } else {
              cardClass = showImage
                ? styles.menuCardWithImage
                : styles.menuCard;
            }

            return (
              <div key={menu.id}>
                <button
                  className={cardClass}
                  onClick={() => handleMenuClick(menu.id)}
                  aria-pressed={isSelected}
                >
                  {showImage && (
                    <img
                      src={menu.image_url!}
                      alt={menu.name}
                      className={styles.menuCardThumb}
                      loading="lazy"
                      onError={() => handleImageError(menu.id)}
                    />
                  )}
                  <div className={showImage ? styles.menuCardTextWrap : undefined}>
                    <p className={styles.menuCardName}>{menu.name}</p>
                    {menu.description && (
                      <p className={styles.menuCardDesc}>{menu.description}</p>
                    )}
                  </div>
                </button>

                {isSelected && !editDraft && (
                  <button
                    className={styles.metaEditTrigger}
                    onClick={() => handleEditStart(menu)}
                  >
                    메타 편집
                  </button>
                )}

                {isSelected && editDraft && (
                  <div
                    className={styles.metaEditForm}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <label className={styles.metaEditLabel}>
                      이름
                      <input
                        className={styles.metaEditInput}
                        type="text"
                        value={editDraft.name}
                        onChange={(e) =>
                          setEditDraft((d) => d && { ...d, name: e.target.value })
                        }
                        disabled={editSaving}
                      />
                    </label>
                    <label className={styles.metaEditLabel}>
                      설명
                      <textarea
                        className={styles.metaEditTextarea}
                        value={editDraft.description}
                        onChange={(e) =>
                          setEditDraft((d) => d && { ...d, description: e.target.value })
                        }
                        rows={2}
                        disabled={editSaving}
                      />
                    </label>
                    <label className={styles.metaEditLabel}>
                      이미지 URL
                      <input
                        className={styles.metaEditInput}
                        type="text"
                        value={editDraft.imageUrl}
                        onChange={(e) => {
                          setEditDraft((d) => d && { ...d, imageUrl: e.target.value });
                          setPreviewBroken(false);
                        }}
                        disabled={editSaving}
                      />
                    </label>
                    {editDraft.imageUrl.trim() !== '' && !previewBroken && (
                      <img
                        src={editDraft.imageUrl.trim()}
                        alt="미리보기"
                        className={styles.metaEditPreview}
                        onError={() => setPreviewBroken(true)}
                      />
                    )}
                    {editError && <p className={styles.errorText}>{editError}</p>}
                    <div className={styles.metaEditActions}>
                      <button
                        className={styles.metaEditSaveBtn}
                        onClick={() => handleEditSave(menu.id)}
                        disabled={editSaving}
                      >
                        {editSaving ? '저장 중...' : '저장'}
                      </button>
                      <button
                        className={styles.metaEditCancelBtn}
                        onClick={handleEditCancel}
                        disabled={editSaving}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedMenuId && summaryLoading && (
        <p className={styles.loadingText}>구조 정보 불러오는 중...</p>
      )}

      {selectedMenuId && summaryError && (
        <p className={styles.errorText}>{summaryError}</p>
      )}

      {bundle && bundle.menu.id === selectedMenuId && (
        <div className={styles.locationsSection}>
          <h3 className={styles.locationsHeading}>위치 (practice_locations)</h3>
          {bundle.locations.length === 0 && (
            <p className={styles.adminEmptyHint}>등록된 위치가 없습니다.</p>
          )}
          {bundle.locations.length > 0 && (
            <div className={styles.locationsList}>
              {bundle.locations.map((loc) => (
                <div key={loc.id} className={styles.locationRow}>
                  <span className={styles.locationKeyTag}>{loc.loc_key}</span>
                  <span className={styles.locationLabelText}>{loc.label}</span>
                </div>
              ))}
            </div>
          )}
          {!showLocationInput && (
            <button
              className={styles.createMenuBtn}
              onClick={() => {
                setLocationError(null);
                setShowLocationInput(true);
              }}
            >
              + 위치 추가
            </button>
          )}
          {showLocationInput && (
            <div className={styles.createMenuForm}>
              <label className={styles.metaEditLabel}>
                loc_key
                <input
                  className={styles.metaEditInput}
                  type="text"
                  value={locationKeyDraft}
                  onChange={(e) => setLocationKeyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLocationCreateSubmit();
                    if (e.key === 'Escape') handleLocationCreateCancel();
                  }}
                  disabled={creatingLocation}
                  autoFocus
                  placeholder="예: espresso_machine"
                />
              </label>
              <label className={styles.metaEditLabel}>
                label
                <input
                  className={styles.metaEditInput}
                  type="text"
                  value={locationLabelDraft}
                  onChange={(e) => setLocationLabelDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLocationCreateSubmit();
                    if (e.key === 'Escape') handleLocationCreateCancel();
                  }}
                  disabled={creatingLocation}
                  placeholder="예: 에스프레소 머신"
                />
              </label>
              {locationError && <p className={styles.errorText}>{locationError}</p>}
              <div className={styles.metaEditActions}>
                <button
                  className={styles.metaEditSaveBtn}
                  onClick={handleLocationCreateSubmit}
                  disabled={creatingLocation}
                >
                  {creatingLocation ? '생성 중...' : '생성'}
                </button>
                <button
                  className={styles.metaEditCancelBtn}
                  onClick={handleLocationCreateCancel}
                  disabled={creatingLocation}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {bundle && bundle.menu.id === selectedMenuId && (() => {
        const actionList = buildAdminActionNodeList(bundle);
        const hasLocations = bundle.locations.length > 0;
        return (
          <div className={styles.adminActionNodesSection}>
            <h3 className={styles.adminActionNodesHeading}>
              액션 노드 (practice_action_nodes)
            </h3>
            {actionList.length === 0 && (
              <p className={styles.adminEmptyHint}>
                등록된 액션 노드가 없습니다.
              </p>
            )}
            {actionList.length > 0 && (
              <div className={styles.locationsList}>
                {actionList.map((item) => (
                  <div key={item.nodeId} className={styles.adminNodeItem}>
                    {editingActionNodeDraft?.nodeId === item.nodeId ? (
                      <div className={styles.createMenuForm}>
                        <label className={styles.metaEditLabel}>
                          action_type
                          <select
                            className={styles.metaEditInput}
                            value={editingActionNodeDraft.actionType}
                            onChange={(e) =>
                              setEditingActionNodeDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      actionType: e.target
                                        .value as PracticeActionType,
                                    }
                                  : d,
                              )
                            }
                            disabled={editingActionNodeSaving}
                          >
                            {PRACTICE_ACTION_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.metaEditLabel}>
                          location
                          <select
                            className={styles.metaEditInput}
                            value={editingActionNodeDraft.locationId}
                            onChange={(e) =>
                              setEditingActionNodeDraft((d) =>
                                d ? { ...d, locationId: e.target.value } : d,
                              )
                            }
                            disabled={editingActionNodeSaving}
                          >
                            <option value="">(선택)</option>
                            {bundle.locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.loc_key} — {l.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.metaEditLabel}>
                          duration_sec (선택)
                          <input
                            className={styles.metaEditInput}
                            type="number"
                            min={0}
                            step="any"
                            value={editingActionNodeDraft.duration}
                            onChange={(e) =>
                              setEditingActionNodeDraft((d) =>
                                d ? { ...d, duration: e.target.value } : d,
                              )
                            }
                            disabled={editingActionNodeSaving}
                            placeholder="비워두면 null"
                          />
                        </label>
                        {editingActionNodeError?.nodeId === item.nodeId && (
                          <p className={styles.errorText}>
                            {editingActionNodeError.message}
                          </p>
                        )}
                        <div className={styles.metaEditActions}>
                          <button
                            className={styles.metaEditSaveBtn}
                            onClick={handleActionNodeEditSave}
                            disabled={editingActionNodeSaving}
                          >
                            {editingActionNodeSaving ? '저장 중...' : '저장'}
                          </button>
                          <button
                            className={styles.metaEditCancelBtn}
                            onClick={handleActionNodeEditCancel}
                            disabled={editingActionNodeSaving}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : editingActionStepDraft?.nodeId === item.nodeId ? (
                      <div className={styles.createMenuForm}>
                        <label className={styles.metaEditLabel}>
                          step_no
                          <input
                            className={styles.metaEditInput}
                            type="number"
                            min={1}
                            step={1}
                            value={editingActionStepDraft.stepNo}
                            onChange={(e) =>
                              setEditingActionStepDraft((d) =>
                                d ? { ...d, stepNo: e.target.value } : d,
                              )
                            }
                            disabled={editingActionStepSaving}
                            autoFocus
                          />
                        </label>
                        {editingActionStepError?.nodeId === item.nodeId && (
                          <p className={styles.errorText}>
                            {editingActionStepError.message}
                          </p>
                        )}
                        <div className={styles.metaEditActions}>
                          <button
                            className={styles.metaEditSaveBtn}
                            onClick={handleActionStepEditSave}
                            disabled={editingActionStepSaving}
                          >
                            {editingActionStepSaving ? '저장 중...' : '저장'}
                          </button>
                          <button
                            className={styles.metaEditCancelBtn}
                            onClick={handleActionStepEditCancel}
                            disabled={editingActionStepSaving}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className={styles.adminNodeLabel}>액션</span>
                        <span className={styles.adminNodeDetail}>
                          #{item.stepNo} {item.actionType}
                          {item.locationLabel
                            ? ` @ ${item.locationLabel}`
                            : ' @ (알 수 없음)'}
                          {item.durationSec != null
                            ? ` ${item.durationSec}초`
                            : ''}
                        </span>
                        <div className={styles.metaEditActions}>
                          <button
                            type="button"
                            className={styles.metaEditSaveBtn}
                            disabled={
                              deletingActionNodeId !== null ||
                              editingActionNodeDraft !== null ||
                              editingActionNodeSaving ||
                              editingActionStepDraft !== null ||
                              editingActionStepSaving ||
                              editingIngredientNodeDraft !== null ||
                              editingIngredientNodeSaving
                            }
                            onClick={() => handleActionStepEditStart(item)}
                          >
                            stepNo 편집
                          </button>
                          <button
                            type="button"
                            className={styles.metaEditSaveBtn}
                            disabled={
                              deletingActionNodeId !== null ||
                              editingActionNodeDraft !== null ||
                              editingActionNodeSaving ||
                              editingActionStepDraft !== null ||
                              editingActionStepSaving ||
                              editingIngredientNodeDraft !== null ||
                              editingIngredientNodeSaving
                            }
                            onClick={() => handleActionNodeEditStart(item)}
                          >
                            편집
                          </button>
                          <button
                            type="button"
                            className={styles.metaEditCancelBtn}
                            disabled={
                              deletingActionNodeId !== null ||
                              editingActionNodeDraft !== null ||
                              editingActionNodeSaving ||
                              editingActionStepDraft !== null ||
                              editingActionStepSaving ||
                              editingIngredientNodeDraft !== null ||
                              editingIngredientNodeSaving
                            }
                            onClick={() => handleDeleteActionNode(item.nodeId)}
                          >
                            × 삭제
                          </button>
                          {deletingActionNodeId === item.nodeId && (
                            <span className={styles.nodeSummary}>
                              삭제 중…
                            </span>
                          )}
                          {deleteActionNodeError?.nodeId === item.nodeId &&
                            deletingActionNodeId === null && (
                              <div className={styles.errorText}>
                                {deleteActionNodeError.message}
                              </div>
                            )}
                          {editingActionNodeError?.nodeId === item.nodeId &&
                            editingActionNodeDraft === null &&
                            !editingActionNodeSaving && (
                              <div className={styles.errorText}>
                                {editingActionNodeError.message}
                              </div>
                            )}
                          {editingActionStepError?.nodeId === item.nodeId &&
                            editingActionStepDraft === null &&
                            !editingActionStepSaving && (
                              <div className={styles.errorText}>
                                {editingActionStepError.message}
                              </div>
                            )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!hasLocations && (
              <p className={styles.adminEmptyHint}>
                위치를 먼저 추가한 뒤 액션 노드를 생성하세요.
              </p>
            )}
            {hasLocations &&
              !showActionNodeInput &&
              deletingActionNodeId === null &&
              editingActionNodeDraft === null &&
              !editingActionNodeSaving &&
              editingActionStepDraft === null &&
              !editingActionStepSaving && (
                <button
                  className={styles.createMenuBtn}
                  onClick={() => {
                    setActionNodeError(null);
                    setShowActionNodeInput(true);
                  }}
                >
                  + 액션 노드 추가
                </button>
              )}
            {hasLocations && showActionNodeInput && (
              <div className={styles.createMenuForm}>
                <label className={styles.metaEditLabel}>
                  step_no
                  <input
                    className={styles.metaEditInput}
                    type="number"
                    min={1}
                    step={1}
                    value={actionStepNoDraft}
                    onChange={(e) => setActionStepNoDraft(e.target.value)}
                    disabled={creatingActionNode}
                    autoFocus
                    placeholder="예: 1"
                  />
                </label>
                <label className={styles.metaEditLabel}>
                  action_type
                  <select
                    className={styles.metaEditInput}
                    value={actionTypeDraft}
                    onChange={(e) =>
                      setActionTypeDraft(e.target.value as PracticeActionType)
                    }
                    disabled={creatingActionNode}
                  >
                    {PRACTICE_ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.metaEditLabel}>
                  location
                  <select
                    className={styles.metaEditInput}
                    value={actionLocationIdDraft}
                    onChange={(e) => setActionLocationIdDraft(e.target.value)}
                    disabled={creatingActionNode}
                  >
                    <option value="">(선택)</option>
                    {bundle.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.loc_key} — {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.metaEditLabel}>
                  duration_sec (선택)
                  <input
                    className={styles.metaEditInput}
                    type="number"
                    min={0}
                    step="any"
                    value={actionDurationDraft}
                    onChange={(e) => setActionDurationDraft(e.target.value)}
                    disabled={creatingActionNode}
                    placeholder="비워두면 null"
                  />
                </label>
                {actionNodeError && (
                  <p className={styles.errorText}>{actionNodeError}</p>
                )}
                <div className={styles.metaEditActions}>
                  <button
                    className={styles.metaEditSaveBtn}
                    onClick={handleActionNodeCreateSubmit}
                    disabled={creatingActionNode}
                  >
                    {creatingActionNode ? '생성 중...' : '생성'}
                  </button>
                  <button
                    className={styles.metaEditCancelBtn}
                    onClick={handleActionNodeCreateCancel}
                    disabled={creatingActionNode}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {bundle && bundle.menu.id === selectedMenuId && (() => {
        const ingredientList = buildAdminIngredientNodeList(bundle);
        const hasLocations = bundle.locations.length > 0;
        const hasIngredientOptions = storeIngredientOptions.length > 0;
        const canCreate =
          hasLocations &&
          !storeIngredientOptionsLoading &&
          storeIngredientOptionsError == null &&
          hasIngredientOptions;
        return (
          <div className={styles.adminIngredientNodesSection}>
            <h3 className={styles.adminIngredientNodesHeading}>
              재료 노드 (practice_ingredient_nodes)
            </h3>
            {ingredientList.length === 0 && (
              <p className={styles.adminEmptyHint}>
                등록된 재료 노드가 없습니다.
              </p>
            )}
            {ingredientList.length > 0 && (
              <div className={styles.locationsList}>
                {ingredientList.map((item) => (
                  <div key={item.nodeId} className={styles.adminNodeItem}>
                    <span className={styles.adminNodeLabel}>재료</span>
                    <span className={styles.adminNodeDetail}>
                      #{item.stepNo} {item.ingredientId}
                      {item.isDeco ? ' (데코)' : ''} ×{item.quantity}
                    </span>
                    {item.locationPathLabels.length > 0 && (
                      <span className={styles.adminNodePath}>
                        {item.locationPathLabels.join(' → ')}
                      </span>
                    )}
                    {addHopTargetNodeId === item.nodeId ? (
                      <div className={styles.createMenuForm}>
                        <label className={styles.metaEditLabel}>
                          다음 location
                          <select
                            className={styles.metaEditInput}
                            value={hopLocationIdDraft}
                            onChange={(e) =>
                              setHopLocationIdDraft(e.target.value)
                            }
                          >
                            <option value="">(선택)</option>
                            {bundle.locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        {hopError && (
                          <div className={styles.errorText}>{hopError}</div>
                        )}
                        <div className={styles.metaEditActions}>
                          <button
                            type="button"
                            className={styles.metaEditSaveBtn}
                            disabled={creatingHop}
                            onClick={handleAddHopSubmit}
                          >
                            {creatingHop ? '추가 중…' : 'hop 추가'}
                          </button>
                          <button
                            type="button"
                            className={styles.metaEditCancelBtn}
                            disabled={creatingHop}
                            onClick={handleAddHopCancel}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : editingIngredientStepDraft?.nodeId === item.nodeId ? (
                      <div className={styles.createMenuForm}>
                        <label className={styles.metaEditLabel}>
                          step_no
                          <input
                            className={styles.metaEditInput}
                            type="number"
                            min={1}
                            step={1}
                            value={editingIngredientStepDraft.stepNo}
                            onChange={(e) =>
                              setEditingIngredientStepDraft((d) =>
                                d ? { ...d, stepNo: e.target.value } : d,
                              )
                            }
                            disabled={editingIngredientStepSaving}
                            autoFocus
                          />
                        </label>
                        {editingIngredientStepError?.nodeId === item.nodeId && (
                          <p className={styles.errorText}>
                            {editingIngredientStepError.message}
                          </p>
                        )}
                        <div className={styles.metaEditActions}>
                          <button
                            type="button"
                            className={styles.metaEditSaveBtn}
                            onClick={handleIngredientStepEditSave}
                            disabled={editingIngredientStepSaving}
                          >
                            {editingIngredientStepSaving ? '저장 중...' : '저장'}
                          </button>
                          <button
                            type="button"
                            className={styles.metaEditCancelBtn}
                            onClick={handleIngredientStepEditCancel}
                            disabled={editingIngredientStepSaving}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : editingIngredientNodeDraft?.nodeId === item.nodeId ? (
                      <div className={styles.createMenuForm}>
                        <label className={styles.metaEditLabel}>
                          재료
                          <select
                            className={styles.metaEditInput}
                            value={editingIngredientNodeDraft.ingredientId}
                            onChange={(e) =>
                              setEditingIngredientNodeDraft((d) =>
                                d ? { ...d, ingredientId: e.target.value } : d,
                              )
                            }
                            disabled={editingIngredientNodeSaving}
                            autoFocus
                          >
                            <option value="">(선택)</option>
                            {storeIngredientOptions.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.display_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.metaEditLabel}>
                          <input
                            type="checkbox"
                            checked={editingIngredientNodeDraft.isDeco}
                            onChange={(e) =>
                              setEditingIngredientNodeDraft((d) =>
                                d ? { ...d, isDeco: e.target.checked } : d,
                              )
                            }
                            disabled={editingIngredientNodeSaving}
                          />
                          데코
                        </label>
                        <label className={styles.metaEditLabel}>
                          quantity
                          <input
                            className={styles.metaEditInput}
                            type="number"
                            min={0}
                            step="any"
                            value={editingIngredientNodeDraft.quantity}
                            onChange={(e) =>
                              setEditingIngredientNodeDraft((d) =>
                                d ? { ...d, quantity: e.target.value } : d,
                              )
                            }
                            disabled={editingIngredientNodeSaving}
                          />
                        </label>
                        {editingIngredientNodeError?.nodeId === item.nodeId && (
                          <p className={styles.errorText}>
                            {editingIngredientNodeError.message}
                          </p>
                        )}
                        <div className={styles.metaEditActions}>
                          <button
                            type="button"
                            className={styles.metaEditSaveBtn}
                            onClick={handleIngredientNodeEditSave}
                            disabled={editingIngredientNodeSaving}
                          >
                            {editingIngredientNodeSaving ? '저장 중...' : '저장'}
                          </button>
                          <button
                            type="button"
                            className={styles.metaEditCancelBtn}
                            onClick={handleIngredientNodeEditCancel}
                            disabled={editingIngredientNodeSaving}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.metaEditActions}>
                        <button
                          type="button"
                          className={styles.metaEditSaveBtn}
                          disabled={
                            addHopTargetNodeId !== null ||
                            deletingTailHopNodeId !== null ||
                            deletingIngredientNodeId !== null ||
                            deletingActionNodeId !== null ||
                            editingIngredientStepDraft !== null ||
                            editingIngredientStepSaving ||
                            editingIngredientNodeDraft !== null ||
                            editingIngredientNodeSaving
                          }
                          onClick={() => handleIngredientStepEditStart(item)}
                        >
                          stepNo 편집
                        </button>
                        <button
                          type="button"
                          className={styles.metaEditSaveBtn}
                          disabled={
                            addHopTargetNodeId !== null ||
                            deletingTailHopNodeId !== null ||
                            deletingIngredientNodeId !== null ||
                            deletingActionNodeId !== null ||
                            editingIngredientStepDraft !== null ||
                            editingIngredientStepSaving ||
                            editingIngredientNodeDraft !== null ||
                            editingIngredientNodeSaving
                          }
                          onClick={() => handleIngredientNodeEditStart(item)}
                        >
                          재료 편집
                        </button>
                        <button
                          type="button"
                          className={styles.createMenuBtn}
                          disabled={
                            addHopTargetNodeId !== null ||
                            bundle.locations.length === 0 ||
                            deletingTailHopNodeId !== null ||
                            deletingIngredientNodeId !== null ||
                            deletingActionNodeId !== null ||
                            editingIngredientStepDraft !== null ||
                            editingIngredientStepSaving ||
                            editingIngredientNodeDraft !== null ||
                            editingIngredientNodeSaving
                          }
                          onClick={() => handleAddHopOpen(item.nodeId)}
                        >
                          + hop 추가
                        </button>
                        {item.locationPathLabels.length > 1 && (
                          <button
                            type="button"
                            className={styles.metaEditCancelBtn}
                            disabled={
                              addHopTargetNodeId !== null ||
                              deletingTailHopNodeId !== null ||
                              deletingIngredientNodeId !== null ||
                              deletingActionNodeId !== null ||
                              editingIngredientStepDraft !== null ||
                              editingIngredientStepSaving ||
                              editingIngredientNodeDraft !== null ||
                              editingIngredientNodeSaving
                            }
                            onClick={() => handleDeleteTailHop(item.nodeId)}
                          >
                            {deletingTailHopNodeId === item.nodeId
                              ? '삭제 중…'
                              : '× 마지막 hop 제거'}
                          </button>
                        )}
                        {lastTailHopDeleteNodeId === item.nodeId &&
                          deletingTailHopNodeId === null &&
                          tailHopDeleteError && (
                            <div className={styles.errorText}>
                              {tailHopDeleteError}
                            </div>
                          )}
                        <button
                          type="button"
                          className={styles.metaEditCancelBtn}
                          disabled={
                            addHopTargetNodeId !== null ||
                            deletingTailHopNodeId !== null ||
                            deletingIngredientNodeId !== null ||
                            editingIngredientStepDraft !== null ||
                            editingIngredientStepSaving ||
                            editingIngredientNodeDraft !== null ||
                            editingIngredientNodeSaving
                          }
                          onClick={() => handleDeleteIngredientNode(item.nodeId)}
                        >
                          × 삭제
                        </button>
                        {deletingIngredientNodeId === item.nodeId && (
                          <span className={styles.nodeSummary}>삭제 중…</span>
                        )}
                        {deleteIngredientNodeError?.nodeId === item.nodeId &&
                          deletingIngredientNodeId === null && (
                            <div className={styles.errorText}>
                              {deleteIngredientNodeError.message}
                            </div>
                          )}
                        {editingIngredientStepError?.nodeId === item.nodeId &&
                          editingIngredientStepDraft === null &&
                          !editingIngredientStepSaving && (
                            <div className={styles.errorText}>
                              {editingIngredientStepError.message}
                            </div>
                          )}
                        {editingIngredientNodeError?.nodeId === item.nodeId &&
                          editingIngredientNodeDraft === null &&
                          !editingIngredientNodeSaving && (
                            <div className={styles.errorText}>
                              {editingIngredientNodeError.message}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!hasLocations && (
              <p className={styles.adminEmptyHint}>
                위치를 먼저 추가한 뒤 재료 노드를 생성하세요.
              </p>
            )}
            {hasLocations && storeIngredientOptionsLoading && (
              <p className={styles.loadingText}>재료 목록 불러오는 중...</p>
            )}
            {hasLocations && storeIngredientOptionsError != null && (
              <p className={styles.errorText}>
                재료 목록 불러오기 실패: {storeIngredientOptionsError}
              </p>
            )}
            {hasLocations &&
              !storeIngredientOptionsLoading &&
              storeIngredientOptionsError == null &&
              !hasIngredientOptions && (
                <p className={styles.adminEmptyHint}>
                  현재 매장에 등록된 재료가 없어 재료 노드를 생성할 수 없습니다.
                </p>
              )}
            {canCreate &&
              !showIngredientNodeInput &&
              deletingIngredientNodeId === null &&
              editingIngredientStepDraft === null &&
              !editingIngredientStepSaving &&
              editingIngredientNodeDraft === null &&
              !editingIngredientNodeSaving && (
                <button
                  className={styles.createMenuBtn}
                  onClick={() => {
                    setIngredientNodeError(null);
                    setShowIngredientNodeInput(true);
                  }}
                >
                  + 재료 노드 추가
                </button>
              )}
            {canCreate && showIngredientNodeInput && (
              <div className={styles.createMenuForm}>
                <label className={styles.metaEditLabel}>
                  step_no
                  <input
                    className={styles.metaEditInput}
                    type="number"
                    min={1}
                    step={1}
                    value={ingredientStepNoDraft}
                    onChange={(e) => setIngredientStepNoDraft(e.target.value)}
                    disabled={creatingIngredientNode}
                    autoFocus
                    placeholder="예: 1"
                  />
                </label>
                <label className={styles.metaEditLabel}>
                  ingredient
                  <select
                    className={styles.metaEditInput}
                    value={ingredientIdDraft}
                    onChange={(e) => setIngredientIdDraft(e.target.value)}
                    disabled={creatingIngredientNode}
                  >
                    <option value="">(선택)</option>
                    {storeIngredientOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.metaEditLabel}>
                  is_deco
                  <input
                    type="checkbox"
                    checked={ingredientIsDecoDraft}
                    onChange={(e) => setIngredientIsDecoDraft(e.target.checked)}
                    disabled={creatingIngredientNode}
                  />
                </label>
                <label className={styles.metaEditLabel}>
                  quantity
                  <input
                    className={styles.metaEditInput}
                    type="number"
                    min={0}
                    step="any"
                    value={ingredientQuantityDraft}
                    onChange={(e) => setIngredientQuantityDraft(e.target.value)}
                    disabled={creatingIngredientNode}
                    placeholder="예: 1"
                  />
                </label>
                <label className={styles.metaEditLabel}>
                  initial_location (seq 0)
                  <select
                    className={styles.metaEditInput}
                    value={ingredientInitialLocationIdDraft}
                    onChange={(e) =>
                      setIngredientInitialLocationIdDraft(e.target.value)
                    }
                    disabled={creatingIngredientNode}
                  >
                    <option value="">(선택)</option>
                    {bundle.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.loc_key} — {l.label}
                      </option>
                    ))}
                  </select>
                </label>
                {ingredientNodeError && (
                  <p className={styles.errorText}>{ingredientNodeError}</p>
                )}
                <div className={styles.metaEditActions}>
                  <button
                    className={styles.metaEditSaveBtn}
                    onClick={handleIngredientNodeCreateSubmit}
                    disabled={creatingIngredientNode}
                  >
                    {creatingIngredientNode ? '생성 중...' : '생성'}
                  </button>
                  <button
                    className={styles.metaEditCancelBtn}
                    onClick={handleIngredientNodeCreateCancel}
                    disabled={creatingIngredientNode}
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {bundle && bundle.menu.id === selectedMenuId && (
        <div className={styles.adminStepGroupsSection}>
          <h3 className={styles.adminStepGroupsHeading}>
            스텝 그룹 (practice_step_groups)
          </h3>
          {bundle.step_groups.length === 0 && (
            <p className={styles.adminEmptyHint}>
              등록된 스텝 그룹이 없습니다.
            </p>
          )}
          {bundle.step_groups.length > 0 && (
            <div className={styles.locationsList}>
              {bundle.step_groups.map((g) => {
                const primaryLabel =
                  g.primary_location_id != null
                    ? bundle.locations.find(
                        (l) => l.id === g.primary_location_id,
                      )?.label ?? '(알 수 없음)'
                    : null;
                const isEditingThisGroup =
                  editingStepGroupDraft?.groupId === g.id;
                if (isEditingThisGroup && editingStepGroupDraft) {
                  return (
                    <div key={g.id} className={styles.metaEditForm}>
                      <label className={styles.metaEditLabel}>
                        display_step_no
                        <input
                          className={styles.metaEditInput}
                          type="number"
                          min={1}
                          step={1}
                          value={editingStepGroupDraft.displayStepNo}
                          onChange={(e) =>
                            setEditingStepGroupDraft((d) =>
                              d && { ...d, displayStepNo: e.target.value },
                            )
                          }
                          disabled={editingStepGroupSaving}
                          autoFocus
                        />
                      </label>
                      <label className={styles.metaEditLabel}>
                        title
                        <input
                          className={styles.metaEditInput}
                          type="text"
                          value={editingStepGroupDraft.title}
                          onChange={(e) =>
                            setEditingStepGroupDraft((d) =>
                              d && { ...d, title: e.target.value },
                            )
                          }
                          disabled={editingStepGroupSaving}
                        />
                      </label>
                      <label className={styles.metaEditLabel}>
                        summary (선택)
                        <textarea
                          className={styles.metaEditTextarea}
                          value={editingStepGroupDraft.summary}
                          onChange={(e) =>
                            setEditingStepGroupDraft((d) =>
                              d && { ...d, summary: e.target.value },
                            )
                          }
                          rows={2}
                          disabled={editingStepGroupSaving}
                          placeholder="비워두면 null"
                        />
                      </label>
                      <label className={styles.metaEditLabel}>
                        primary_location (선택)
                        <select
                          className={styles.metaEditInput}
                          value={editingStepGroupDraft.primaryLocationId}
                          onChange={(e) =>
                            setEditingStepGroupDraft((d) =>
                              d && { ...d, primaryLocationId: e.target.value },
                            )
                          }
                          disabled={editingStepGroupSaving}
                        >
                          <option value="">(선택 없음)</option>
                          {bundle.locations.map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.loc_key} — {l.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {editingStepGroupError && (
                        <p className={styles.errorText}>
                          {editingStepGroupError}
                        </p>
                      )}
                      <div className={styles.metaEditActions}>
                        <button
                          className={styles.metaEditSaveBtn}
                          onClick={handleStepGroupEditSave}
                          disabled={editingStepGroupSaving}
                        >
                          {editingStepGroupSaving ? '저장 중...' : '저장'}
                        </button>
                        <button
                          className={styles.metaEditCancelBtn}
                          onClick={handleStepGroupEditCancel}
                          disabled={editingStepGroupSaving}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={g.id} className={styles.adminNodeItem}>
                    <span className={styles.adminNodeLabel}>그룹</span>
                    <span className={styles.adminNodeDetail}>
                      #{g.display_step_no} {g.title}
                      {g.summary ? ` — ${g.summary}` : ''}
                      {primaryLabel != null ? ` @ ${primaryLabel}` : ''}
                    </span>
                    {editingStepGroupDraft === null &&
                      !showStepGroupInput &&
                      !editingStepGroupSaving &&
                      editingMediaUrlDraft === null &&
                      !editingMediaUrlSaving &&
                      editingPureMediaTitleDraft === null &&
                      !editingPureMediaTitleSaving &&
                      detachingMediaId === null &&
                      deletingStepGroupId === null && (
                        <>
                          <button
                            className={styles.metaEditTrigger}
                            onClick={() => handleStepGroupEditStart(g)}
                          >
                            메타 편집
                          </button>
                          <button
                            className={styles.metaEditCancelBtn}
                            onClick={() => handleDeleteStepGroup(g.id)}
                          >
                            × 삭제
                          </button>
                        </>
                      )}
                    {deletingStepGroupId === g.id && (
                      <span className={styles.nodeSummary}>삭제 중…</span>
                    )}
                    {deleteStepGroupError?.stepGroupId === g.id &&
                      deletingStepGroupId === null && (
                        <div className={styles.errorText}>
                          {deleteStepGroupError.message}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
          {!showStepGroupInput &&
            editingStepGroupDraft === null &&
            editingMediaUrlDraft === null &&
            !editingMediaUrlSaving &&
            editingPureMediaTitleDraft === null &&
            !editingPureMediaTitleSaving &&
            detachingMediaId === null &&
            deletingStepGroupId === null && (
              <button
                className={styles.createMenuBtn}
                onClick={() => {
                  setStepGroupError(null);
                  setShowStepGroupInput(true);
                }}
              >
                + 스텝 그룹 추가
              </button>
            )}
          {showStepGroupInput && (
            <div className={styles.createMenuForm}>
              <label className={styles.metaEditLabel}>
                display_step_no
                <input
                  className={styles.metaEditInput}
                  type="number"
                  min={1}
                  step={1}
                  value={stepGroupDisplayStepNoDraft}
                  onChange={(e) =>
                    setStepGroupDisplayStepNoDraft(e.target.value)
                  }
                  disabled={creatingStepGroup}
                  autoFocus
                  placeholder="예: 1"
                />
              </label>
              <label className={styles.metaEditLabel}>
                title
                <input
                  className={styles.metaEditInput}
                  type="text"
                  value={stepGroupTitleDraft}
                  onChange={(e) => setStepGroupTitleDraft(e.target.value)}
                  disabled={creatingStepGroup}
                  placeholder="예: 준비"
                />
              </label>
              <label className={styles.metaEditLabel}>
                summary (선택)
                <textarea
                  className={styles.metaEditTextarea}
                  value={stepGroupSummaryDraft}
                  onChange={(e) => setStepGroupSummaryDraft(e.target.value)}
                  rows={2}
                  disabled={creatingStepGroup}
                  placeholder="비워두면 null"
                />
              </label>
              <label className={styles.metaEditLabel}>
                primary_location (선택)
                <select
                  className={styles.metaEditInput}
                  value={stepGroupPrimaryLocationIdDraft}
                  onChange={(e) =>
                    setStepGroupPrimaryLocationIdDraft(e.target.value)
                  }
                  disabled={creatingStepGroup}
                >
                  <option value="">(선택 없음)</option>
                  {bundle.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.loc_key} — {l.label}
                    </option>
                  ))}
                </select>
              </label>
              {stepGroupError && (
                <p className={styles.errorText}>{stepGroupError}</p>
              )}
              <div className={styles.metaEditActions}>
                <button
                  className={styles.metaEditSaveBtn}
                  onClick={handleStepGroupCreateSubmit}
                  disabled={creatingStepGroup}
                >
                  {creatingStepGroup ? '생성 중...' : '생성'}
                </button>
                <button
                  className={styles.metaEditCancelBtn}
                  onClick={handleStepGroupCreateCancel}
                  disabled={creatingStepGroup}
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {bundle && bundle.menu.id === selectedMenuId && (() => {
        const unlinkedOptions = buildAdminUnlinkedNodeOptions(bundle);
        const ingredientNameById = new Map<string, string>();
        for (const opt of storeIngredientOptions) {
          ingredientNameById.set(opt.id, opt.display_name);
        }
        const locationLabelById = new Map<string, string>();
        for (const loc of bundle.locations) {
          locationLabelById.set(loc.id, loc.label);
        }
        const totalNodes =
          bundle.ingredient_nodes.length + bundle.action_nodes.length;
        const actionOptions = unlinkedOptions.filter(
          (o) => o.nodeType === 'action',
        );
        const ingredientOptions = unlinkedOptions.filter(
          (o) => o.nodeType === 'ingredient',
        );

        return (
          <div className={styles.adminLinkNodeSection}>
            <h3 className={styles.adminLinkNodeHeading}>
              노드 ↔ 스텝 그룹 연결 (practice_step_group_nodes)
            </h3>
            {bundle.step_groups.length === 0 && (
              <p className={styles.adminEmptyHint}>
                스텝 그룹을 먼저 추가하세요.
              </p>
            )}
            {bundle.step_groups.length > 0 && totalNodes === 0 && (
              <p className={styles.adminEmptyHint}>
                연결할 노드가 없습니다. 재료 / 액션 노드를 먼저 추가하세요.
              </p>
            )}
            {bundle.step_groups.length > 0 &&
              totalNodes > 0 &&
              unlinkedOptions.length === 0 && (
                <p className={styles.adminEmptyHint}>
                  모든 노드가 이미 스텝 그룹에 연결되었습니다.
                </p>
              )}
            {bundle.step_groups.length > 0 &&
              unlinkedOptions.length > 0 &&
              !showLinkNodeInput &&
              editingMediaUrlDraft === null &&
              !editingMediaUrlSaving &&
              editingPureMediaTitleDraft === null &&
              !editingPureMediaTitleSaving &&
              detachingMediaId === null &&
              deletingActionNodeId === null &&
              deletingIngredientNodeId === null &&
              editingActionNodeDraft === null &&
              !editingActionNodeSaving &&
              editingActionStepDraft === null &&
              !editingActionStepSaving &&
              editingIngredientStepDraft === null &&
              !editingIngredientStepSaving &&
              editingIngredientNodeDraft === null &&
              !editingIngredientNodeSaving && (
                <button
                  className={styles.createMenuBtn}
                  onClick={() => {
                    setLinkNodeError(null);
                    setShowLinkNodeInput(true);
                  }}
                >
                  + 노드 연결
                </button>
              )}
            {bundle.step_groups.length > 0 &&
              unlinkedOptions.length > 0 &&
              showLinkNodeInput && (
                <div className={styles.createMenuForm}>
                  <label className={styles.metaEditLabel}>
                    스텝 그룹
                    <select
                      className={styles.metaEditInput}
                      value={linkStepGroupIdDraft}
                      onChange={(e) =>
                        setLinkStepGroupIdDraft(e.target.value)
                      }
                      disabled={linkingNode}
                      autoFocus
                    >
                      <option value="">(선택)</option>
                      {bundle.step_groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          #{g.display_step_no} {g.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.metaEditLabel}>
                    노드
                    <select
                      className={styles.metaEditInput}
                      value={linkNodeIdDraft}
                      onChange={(e) => setLinkNodeIdDraft(e.target.value)}
                      disabled={linkingNode}
                    >
                      <option value="">(선택)</option>
                      {actionOptions.length > 0 && (
                        <optgroup label="action">
                          {actionOptions.map((o) => {
                            const locLabel =
                              o.locationId != null
                                ? locationLabelById.get(o.locationId) ??
                                  o.locationId
                                : '';
                            return (
                              <option key={o.nodeId} value={o.nodeId}>
                                step {o.stepNo} · {o.actionType} @ {locLabel}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                      {ingredientOptions.length > 0 && (
                        <optgroup label="ingredient">
                          {ingredientOptions.map((o) => {
                            const name =
                              o.ingredientId != null
                                ? ingredientNameById.get(o.ingredientId) ??
                                  o.ingredientId
                                : '';
                            const decoSuffix = o.isDeco ? ' (deco)' : '';
                            return (
                              <option key={o.nodeId} value={o.nodeId}>
                                step {o.stepNo} · {name}
                                {decoSuffix} x{o.quantity}
                              </option>
                            );
                          })}
                        </optgroup>
                      )}
                    </select>
                  </label>
                  {linkNodeError && (
                    <p className={styles.errorText}>{linkNodeError}</p>
                  )}
                  <div className={styles.metaEditActions}>
                    <button
                      className={styles.metaEditSaveBtn}
                      onClick={handleLinkNodeSubmit}
                      disabled={linkingNode}
                    >
                      {linkingNode ? '연결 중...' : '연결'}
                    </button>
                    <button
                      className={styles.metaEditCancelBtn}
                      onClick={handleLinkNodeCancel}
                      disabled={linkingNode}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
          </div>
        );
      })()}

      {bundle && bundle.menu.id === selectedMenuId && (
        <div className={styles.adminTacitItemsSection}>
          <h3 className={styles.adminTacitItemsHeading}>
            암묵지 추가 (practice_tacit_items)
          </h3>
          {bundle.step_groups.length === 0 ? (
            <p className={styles.adminEmptyHint}>
              스텝 그룹을 먼저 추가하세요.
            </p>
          ) : (
            <>
              {!showTacitItemInput &&
                editingTacitItemDraft === null &&
                editingMediaUrlDraft === null &&
                !editingMediaUrlSaving &&
                editingPureMediaTitleDraft === null &&
                !editingPureMediaTitleSaving &&
                detachingMediaId === null && (
                <button
                  className={styles.createMenuBtn}
                  onClick={() => {
                    setTacitItemError(null);
                    setShowTacitItemInput(true);
                  }}
                >
                  + 암묵지 추가
                </button>
              )}
              {showTacitItemInput && (
                <div className={styles.createMenuForm}>
                  <label className={styles.metaEditLabel}>
                    스텝 그룹
                    <select
                      className={styles.metaEditInput}
                      value={tacitStepGroupIdDraft}
                      onChange={(e) =>
                        setTacitStepGroupIdDraft(e.target.value)
                      }
                      disabled={creatingTacitItem}
                      autoFocus
                    >
                      <option value="">(선택)</option>
                      {[...bundle.step_groups]
                        .sort(
                          (a, b) => a.display_step_no - b.display_step_no,
                        )
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            #{g.display_step_no} {g.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.metaEditLabel}>
                    타입
                    <select
                      className={styles.metaEditInput}
                      value={tacitTypeDraft}
                      onChange={(e) =>
                        setTacitTypeDraft(e.target.value as PracticeTacitType)
                      }
                      disabled={creatingTacitItem}
                    >
                      {PRACTICE_TACIT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TACIT_TYPE_FULL_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.metaEditLabel}>
                    제목
                    <input
                      className={styles.metaEditInput}
                      value={tacitTitleDraft}
                      onChange={(e) => setTacitTitleDraft(e.target.value)}
                      disabled={creatingTacitItem}
                    />
                  </label>
                  {tacitTypeDraft !== 'media' && (
                    <>
                      <label className={styles.metaEditLabel}>
                        본문 (선택)
                        <textarea
                          className={styles.metaEditTextarea}
                          value={tacitBodyDraft}
                          onChange={(e) => setTacitBodyDraft(e.target.value)}
                          disabled={creatingTacitItem}
                        />
                      </label>
                      {ADMIN_SENSORY_FIELDS.map(({ field, label }) => {
                        const value =
                          field === 'flame_level'
                            ? tacitFlameLevelDraft
                            : field === 'color_note'
                            ? tacitColorNoteDraft
                            : field === 'viscosity_note'
                            ? tacitViscosityNoteDraft
                            : field === 'sound_note'
                            ? tacitSoundNoteDraft
                            : field === 'texture_note'
                            ? tacitTextureNoteDraft
                            : tacitTimingNoteDraft;
                        const setValue = (v: string) => {
                          if (field === 'flame_level')
                            setTacitFlameLevelDraft(v);
                          else if (field === 'color_note')
                            setTacitColorNoteDraft(v);
                          else if (field === 'viscosity_note')
                            setTacitViscosityNoteDraft(v);
                          else if (field === 'sound_note')
                            setTacitSoundNoteDraft(v);
                          else if (field === 'texture_note')
                            setTacitTextureNoteDraft(v);
                          else setTacitTimingNoteDraft(v);
                        };
                        return (
                          <label key={field} className={styles.metaEditLabel}>
                            {label} (선택)
                            <input
                              className={styles.metaEditInput}
                              value={value}
                              onChange={(e) => setValue(e.target.value)}
                              disabled={creatingTacitItem}
                            />
                          </label>
                        );
                      })}
                    </>
                  )}
                  {tacitItemError && (
                    <p className={styles.errorText}>{tacitItemError}</p>
                  )}
                  <div className={styles.metaEditActions}>
                    <button
                      className={styles.metaEditSaveBtn}
                      onClick={handleTacitItemCreateSubmit}
                      disabled={creatingTacitItem}
                    >
                      {creatingTacitItem ? '생성 중...' : '생성'}
                    </button>
                    <button
                      className={styles.metaEditCancelBtn}
                      onClick={handleTacitItemCreateCancel}
                      disabled={creatingTacitItem}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {bundle && bundle.menu.id === selectedMenuId && (
        <div className={styles.adminMediaAttachSection}>
          <h3 className={styles.adminMediaAttachHeading}>
            미디어 첨부 (practice_tacit_media)
          </h3>
          {bundle.step_groups.length === 0 ? (
            <p className={styles.adminEmptyHint}>
              스텝 그룹을 먼저 추가하세요.
            </p>
          ) : bundle.tacit_items.length === 0 ? (
            <p className={styles.adminEmptyHint}>
              암묵지 항목을 먼저 추가하세요.
            </p>
          ) : (
            <>
              {!showMediaAttachInput &&
                editingMediaUrlDraft === null &&
                !editingMediaUrlSaving &&
                editingPureMediaTitleDraft === null &&
                !editingPureMediaTitleSaving &&
                detachingMediaId === null && (
                <button
                  className={styles.createMenuBtn}
                  onClick={() => {
                    setTacitMediaError(null);
                    setShowMediaAttachInput(true);
                  }}
                >
                  + 미디어 첨부
                </button>
              )}
              {showMediaAttachInput && (
                <div className={styles.createMenuForm}>
                  <label className={styles.metaEditLabel}>
                    스텝 그룹
                    <select
                      className={styles.metaEditInput}
                      value={mediaTargetStepGroupIdDraft}
                      onChange={(e) => {
                        setMediaTargetStepGroupIdDraft(e.target.value);
                        setMediaTargetTacitItemIdDraft('');
                      }}
                      disabled={creatingTacitMedia}
                      autoFocus
                    >
                      <option value="">(선택)</option>
                      {[...bundle.step_groups]
                        .sort(
                          (a, b) => a.display_step_no - b.display_step_no,
                        )
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            #{g.display_step_no} {g.title}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className={styles.metaEditLabel}>
                    대상 암묵지
                    <select
                      className={styles.metaEditInput}
                      value={mediaTargetTacitItemIdDraft}
                      onChange={(e) =>
                        setMediaTargetTacitItemIdDraft(e.target.value)
                      }
                      disabled={
                        creatingTacitMedia ||
                        mediaTargetStepGroupIdDraft === ''
                      }
                    >
                      <option value="">
                        {mediaTargetStepGroupIdDraft === ''
                          ? '(먼저 스텝 그룹 선택)'
                          : '(선택)'}
                      </option>
                      {mediaTargetStepGroupIdDraft !== '' &&
                        [...bundle.tacit_items]
                          .filter(
                            (t) =>
                              t.step_group_id === mediaTargetStepGroupIdDraft,
                          )
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {TACIT_TYPE_FULL_LABELS[t.tacit_type]} · {t.title}
                            </option>
                          ))}
                    </select>
                  </label>
                  <label className={styles.metaEditLabel}>
                    미디어 타입
                    <select
                      className={styles.metaEditInput}
                      value={mediaTypeDraft}
                      onChange={(e) =>
                        setMediaTypeDraft(
                          e.target.value as PracticeTacitMediaType,
                        )
                      }
                      disabled={creatingTacitMedia}
                    >
                      {PRACTICE_TACIT_MEDIA_TYPES.map((m) => (
                        <option key={m} value={m}>
                          {MEDIA_TYPE_LABELS[m]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.metaEditLabel}>
                    URL
                    <input
                      className={styles.metaEditInput}
                      type="url"
                      placeholder="https://..."
                      value={mediaUrlDraft}
                      onChange={(e) => setMediaUrlDraft(e.target.value)}
                      disabled={creatingTacitMedia}
                    />
                  </label>
                  {tacitMediaError && (
                    <p className={styles.errorText}>{tacitMediaError}</p>
                  )}
                  <div className={styles.metaEditActions}>
                    <button
                      className={styles.metaEditSaveBtn}
                      onClick={handleTacitMediaCreateSubmit}
                      disabled={creatingTacitMedia}
                    >
                      {creatingTacitMedia ? '첨부 중...' : '첨부'}
                    </button>
                    <button
                      className={styles.metaEditCancelBtn}
                      onClick={handleTacitMediaCreateCancel}
                      disabled={creatingTacitMedia}
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {summary && summary.menuId === selectedMenuId && (
        <div className={styles.stepList}>
          <div className={styles.stepItem}>
            <span className={styles.stepTitle}>레시피 노드</span>
            <span className={styles.nodeSummary}>
              총 {summary.totalNodes}개 (재료 {summary.ingredientNodeCount} · 액션{' '}
              {summary.actionNodeCount})
            </span>
          </div>
          <div className={styles.stepItem}>
            <span className={styles.stepTitle}>스텝 그룹</span>
            <span className={styles.nodeSummary}>{summary.stepGroupCount}개</span>
          </div>
          <div className={styles.stepItem}>
            <span className={styles.stepTitle}>암묵지 항목</span>
            <span className={styles.nodeSummary}>{summary.tacitItemCount}개</span>
          </div>
          <div className={styles.stepItem}>
            <span className={styles.stepTitle}>미디어</span>
            <span className={styles.nodeSummary}>{summary.tacitMediaCount}개</span>
          </div>

          {summary.groups.map((g) => {
            const isExpanded = expandedGroupId === g.groupId;
            const drilldown =
              isExpanded && bundle
                ? buildStepGroupDrilldown(g.groupId, bundle)
                : null;

            return (
              <div key={g.groupId}>
                <button
                  className={styles.adminGroupButton}
                  onClick={() =>
                    setExpandedGroupId(isExpanded ? null : g.groupId)
                  }
                  aria-expanded={isExpanded}
                >
                  <span className={styles.stepNo}>단계 {g.displayStepNo}</span>
                  <span className={styles.stepTitle}>{g.title}</span>
                  <span className={styles.nodeSummary}>
                    노드 {g.nodeCount} · 암묵지 {g.textTacitCount} · 미디어타입{' '}
                    {g.pureMediaTacitCount} · 첨부 {g.linkedMediaCount}
                  </span>
                  <span className={styles.adminGroupChevron}>
                    {isExpanded ? '▾' : '▸'}
                  </span>
                </button>

                {drilldown && (
                  <div className={styles.adminDrilldown}>
                    {/* ——— 노드 섹션 ——— */}
                    <div className={styles.adminDrilldownSection}>
                      <h4 className={styles.adminDrilldownHeading}>
                        레시피 노드
                      </h4>
                      {drilldown.ingredientNodes.map((n) => (
                        <div key={n.nodeId} className={styles.adminNodeItem}>
                          <span className={styles.adminNodeLabel}>재료</span>
                          <span className={styles.adminNodeDetail}>
                            #{n.stepNo} {n.ingredientId}
                            {n.isDeco ? ' (데코)' : ''} ×{n.quantity}
                          </span>
                          {n.locationPathLabels.length > 0 && (
                            <span className={styles.adminNodePath}>
                              {n.locationPathLabels.join(' → ')}
                            </span>
                          )}
                          <div className={styles.metaEditActions}>
                            <button
                              type="button"
                              className={styles.metaEditCancelBtn}
                              disabled={
                                unlinkingNodeId !== null ||
                                deletingIngredientNodeId !== null ||
                                editingIngredientStepDraft !== null ||
                                editingIngredientStepSaving ||
                                editingIngredientNodeDraft !== null ||
                                editingIngredientNodeSaving
                              }
                              onClick={() =>
                                handleUnlinkNode(g.groupId, n.nodeId)
                              }
                            >
                              {unlinkingNodeId === n.nodeId
                                ? '해제 중…'
                                : '× 연결 해제'}
                            </button>
                            {lastUnlinkAttemptNodeId === n.nodeId &&
                              unlinkingNodeId === null &&
                              unlinkNodeError && (
                                <div className={styles.errorText}>
                                  {unlinkNodeError}
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                      {drilldown.actionNodes.map((n) => (
                        <div key={n.nodeId} className={styles.adminNodeItem}>
                          <span className={styles.adminNodeLabel}>액션</span>
                          <span className={styles.adminNodeDetail}>
                            #{n.stepNo} {n.actionType}
                            {n.locationLabel ? ` @ ${n.locationLabel}` : ''}
                            {n.durationSec != null
                              ? ` ${n.durationSec}초`
                              : ''}
                          </span>
                          <div className={styles.metaEditActions}>
                            <button
                              type="button"
                              className={styles.metaEditCancelBtn}
                              disabled={
                                unlinkingNodeId !== null ||
                                deletingActionNodeId !== null ||
                                editingActionNodeDraft !== null ||
                                editingActionNodeSaving ||
                                editingActionStepDraft !== null ||
                                editingActionStepSaving
                              }
                              onClick={() =>
                                handleUnlinkNode(g.groupId, n.nodeId)
                              }
                            >
                              {unlinkingNodeId === n.nodeId
                                ? '해제 중…'
                                : '× 연결 해제'}
                            </button>
                            {lastUnlinkAttemptNodeId === n.nodeId &&
                              unlinkingNodeId === null &&
                              unlinkNodeError && (
                                <div className={styles.errorText}>
                                  {unlinkNodeError}
                                </div>
                              )}
                          </div>
                        </div>
                      ))}
                      {drilldown.ingredientNodes.length === 0 &&
                        drilldown.actionNodes.length === 0 && (
                          <p className={styles.adminEmptyHint}>
                            연결된 노드가 없습니다.
                          </p>
                        )}
                    </div>

                    {/* ——— 암묵지 섹션 ——— */}
                    <div className={styles.adminDrilldownSection}>
                      <h4 className={styles.adminDrilldownHeading}>암묵지</h4>
                      {drilldown.textTacitItems.map((t) => {
                        const isEditing =
                          editingTacitItemDraft?.tacitItemId === t.id;
                        if (isEditing && editingTacitItemDraft) {
                          const draft = editingTacitItemDraft;
                          return (
                            <div key={t.id} className={styles.metaEditForm}>
                              <label className={styles.metaEditLabel}>
                                제목
                                <input
                                  className={styles.metaEditInput}
                                  value={draft.title}
                                  onChange={(e) =>
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      title: e.target.value,
                                    })
                                  }
                                  disabled={editingTacitItemSaving}
                                  autoFocus
                                />
                              </label>
                              <label className={styles.metaEditLabel}>
                                본문 (선택)
                                <textarea
                                  className={styles.metaEditTextarea}
                                  value={draft.body}
                                  onChange={(e) =>
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      body: e.target.value,
                                    })
                                  }
                                  disabled={editingTacitItemSaving}
                                />
                              </label>
                              {ADMIN_SENSORY_FIELDS.map(({ field, label }) => {
                                const value =
                                  field === 'flame_level'
                                    ? draft.flameLevel
                                    : field === 'color_note'
                                    ? draft.colorNote
                                    : field === 'viscosity_note'
                                    ? draft.viscosityNote
                                    : field === 'sound_note'
                                    ? draft.soundNote
                                    : field === 'texture_note'
                                    ? draft.textureNote
                                    : draft.timingNote;
                                const setValue = (v: string) => {
                                  if (field === 'flame_level')
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      flameLevel: v,
                                    });
                                  else if (field === 'color_note')
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      colorNote: v,
                                    });
                                  else if (field === 'viscosity_note')
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      viscosityNote: v,
                                    });
                                  else if (field === 'sound_note')
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      soundNote: v,
                                    });
                                  else if (field === 'texture_note')
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      textureNote: v,
                                    });
                                  else
                                    setEditingTacitItemDraft({
                                      ...draft,
                                      timingNote: v,
                                    });
                                };
                                return (
                                  <label
                                    key={field}
                                    className={styles.metaEditLabel}
                                  >
                                    {label} (선택)
                                    <input
                                      className={styles.metaEditInput}
                                      value={value}
                                      onChange={(e) => setValue(e.target.value)}
                                      disabled={editingTacitItemSaving}
                                    />
                                  </label>
                                );
                              })}
                              {editingTacitItemError && (
                                <p className={styles.errorText}>
                                  {editingTacitItemError}
                                </p>
                              )}
                              <div className={styles.metaEditActions}>
                                <button
                                  className={styles.metaEditSaveBtn}
                                  onClick={handleTacitItemEditSave}
                                  disabled={editingTacitItemSaving}
                                >
                                  {editingTacitItemSaving ? '저장 중...' : '저장'}
                                </button>
                                <button
                                  className={styles.metaEditCancelBtn}
                                  onClick={handleTacitItemEditCancel}
                                  disabled={editingTacitItemSaving}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={t.id} className={styles.adminTacitCard}>
                            <div className={styles.adminTacitHeader}>
                              <span className={styles.adminTacitTag}>
                                {ADMIN_TACIT_TYPE_LABELS[t.tacitType]}
                              </span>
                              <span className={styles.adminTacitTitle}>
                                {t.title}
                              </span>
                            </div>
                            {t.body && (
                              <p className={styles.adminTacitBody}>{t.body}</p>
                            )}
                            {t.sensoryEntries.length > 0 && (
                              <div className={styles.adminSensoryRow}>
                                {t.sensoryEntries.map((s) => (
                                  <span
                                    key={s.field}
                                    className={styles.adminSensoryTag}
                                  >
                                    <span className={styles.adminSensoryLabel}>
                                      {s.label}
                                    </span>{' '}
                                    {s.value}
                                  </span>
                                ))}
                              </div>
                            )}
                            {t.linkedMedia.length > 0 && (
                              <div className={styles.adminTacitMediaRow}>
                                {t.linkedMedia.map((m) => (
                                  <div
                                    key={m.id}
                                    className={styles.adminMediaItem}
                                  >
                                    {m.mediaType === 'image' ? (
                                      <img
                                        src={m.url}
                                        alt=""
                                        className={styles.adminTacitMediaThumb}
                                        loading="lazy"
                                      />
                                    ) : (
                                      <span
                                        className={styles.adminVideoLabel}
                                      >
                                        video
                                      </span>
                                    )}
                                    {editingMediaUrlDraft?.mediaId === m.id ? (
                                      <div className={styles.metaEditForm}>
                                        <label className={styles.metaEditLabel}>
                                          URL
                                          <input
                                            type="url"
                                            className={styles.metaEditInput}
                                            value={editingMediaUrlDraft.url}
                                            onChange={(e) =>
                                              setEditingMediaUrlDraft((prev) =>
                                                prev
                                                  ? {
                                                      ...prev,
                                                      url: e.target.value,
                                                    }
                                                  : prev,
                                              )
                                            }
                                          />
                                        </label>
                                        {editingMediaUrlError && (
                                          <p className={styles.errorText}>
                                            {editingMediaUrlError}
                                          </p>
                                        )}
                                        <div className={styles.metaEditActions}>
                                          <button
                                            className={styles.metaEditSaveBtn}
                                            onClick={handleMediaUrlEditSave}
                                            disabled={editingMediaUrlSaving}
                                          >
                                            저장
                                          </button>
                                          <button
                                            className={styles.metaEditCancelBtn}
                                            onClick={handleMediaUrlEditCancel}
                                            disabled={editingMediaUrlSaving}
                                          >
                                            취소
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <span
                                          className={styles.adminMediaUrl}
                                        >
                                          {m.url}
                                        </span>
                                        {editingMediaUrlDraft === null &&
                                          !editingMediaUrlSaving &&
                                          !showTacitItemInput &&
                                          !showMediaAttachInput &&
                                          editingTacitItemDraft === null &&
                                          !editingTacitItemSaving &&
                                          editingStepGroupDraft === null &&
                                          !editingStepGroupSaving &&
                                          editDraft === null &&
                                          editingPureMediaTitleDraft === null &&
                                          !editingPureMediaTitleSaving &&
                                          detachingMediaId === null &&
                                          deletingTextTacitId === null && (
                                            <button
                                              className={
                                                styles.metaEditTrigger
                                              }
                                              onClick={() =>
                                                handleMediaUrlEditStart(
                                                  m.id,
                                                  m.url,
                                                )
                                              }
                                            >
                                              URL 수정
                                            </button>
                                          )}
                                        {editingMediaUrlDraft === null &&
                                          !editingMediaUrlSaving &&
                                          !showTacitItemInput &&
                                          !showMediaAttachInput &&
                                          editingTacitItemDraft === null &&
                                          !editingTacitItemSaving &&
                                          editingStepGroupDraft === null &&
                                          !editingStepGroupSaving &&
                                          editDraft === null &&
                                          editingPureMediaTitleDraft === null &&
                                          !editingPureMediaTitleSaving &&
                                          detachingMediaId === null &&
                                          deletingTextTacitId === null && (
                                            <button
                                              className={
                                                styles.metaEditTrigger
                                              }
                                              onClick={() =>
                                                handleDetachTacitMedia(m.id)
                                              }
                                            >
                                              연결 해제
                                            </button>
                                          )}
                                        {detachMediaError?.mediaId === m.id &&
                                          detachingMediaId === null && (
                                            <p className={styles.errorText}>
                                              {detachMediaError.message}
                                            </p>
                                          )}
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                            {editingTacitItemDraft === null &&
                              !showTacitItemInput &&
                              editingMediaUrlDraft === null &&
                              !editingMediaUrlSaving &&
                              editingPureMediaTitleDraft === null &&
                              !editingPureMediaTitleSaving &&
                              detachingMediaId === null &&
                              deletingTextTacitId === null && (
                                <button
                                  className={styles.metaEditTrigger}
                                  onClick={() => {
                                    const raw = bundle?.tacit_items.find(
                                      (x) => x.id === t.id,
                                    );
                                    if (raw) handleTacitItemEditStart(raw);
                                  }}
                                >
                                  편집
                                </button>
                              )}
                            {editingTacitItemDraft === null &&
                              !showTacitItemInput &&
                              !showMediaAttachInput &&
                              editingMediaUrlDraft === null &&
                              !editingMediaUrlSaving &&
                              editingPureMediaTitleDraft === null &&
                              !editingPureMediaTitleSaving &&
                              editingStepGroupDraft === null &&
                              !editingStepGroupSaving &&
                              editDraft === null &&
                              detachingMediaId === null &&
                              deletingPureMediaTacitId === null &&
                              deletingTextTacitId === null && (
                                <button
                                  className={styles.metaEditTrigger}
                                  onClick={() => handleDeleteTextTacit(t.id)}
                                >
                                  삭제
                                </button>
                              )}
                            {deleteTextTacitError?.tacitItemId === t.id &&
                              deletingTextTacitId === null && (
                                <p className={styles.errorText}>
                                  {deleteTextTacitError.message}
                                </p>
                              )}
                          </div>
                        );
                      })}
                      {drilldown.pureMediaItems.map((pm) => (
                        <div key={pm.id} className={styles.adminTacitCard}>
                          {editingPureMediaTitleDraft?.tacitItemId === pm.id ? (
                            <div className={styles.metaEditForm}>
                              <label className={styles.metaEditLabel}>
                                제목
                                <input
                                  className={styles.metaEditInput}
                                  value={editingPureMediaTitleDraft.title}
                                  onChange={(e) =>
                                    setEditingPureMediaTitleDraft((prev) =>
                                      prev
                                        ? { ...prev, title: e.target.value }
                                        : prev,
                                    )
                                  }
                                  disabled={editingPureMediaTitleSaving}
                                  autoFocus
                                />
                              </label>
                              {editingPureMediaTitleError && (
                                <p className={styles.errorText}>
                                  {editingPureMediaTitleError}
                                </p>
                              )}
                              <div className={styles.metaEditActions}>
                                <button
                                  className={styles.metaEditSaveBtn}
                                  onClick={handlePureMediaTitleEditSave}
                                  disabled={editingPureMediaTitleSaving}
                                >
                                  {editingPureMediaTitleSaving
                                    ? '저장 중...'
                                    : '저장'}
                                </button>
                                <button
                                  className={styles.metaEditCancelBtn}
                                  onClick={handlePureMediaTitleEditCancel}
                                  disabled={editingPureMediaTitleSaving}
                                >
                                  취소
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <span className={styles.adminTacitTitle}>
                                {pm.title}
                              </span>
                              {editingPureMediaTitleDraft === null &&
                                !editingPureMediaTitleSaving &&
                                editingMediaUrlDraft === null &&
                                !editingMediaUrlSaving &&
                                !showTacitItemInput &&
                                !showMediaAttachInput &&
                                editingTacitItemDraft === null &&
                                !editingTacitItemSaving &&
                                editingStepGroupDraft === null &&
                                !editingStepGroupSaving &&
                                editDraft === null &&
                                detachingMediaId === null &&
                                deletingPureMediaTacitId === null && (
                                  <button
                                    className={styles.metaEditTrigger}
                                    onClick={() =>
                                      handlePureMediaTitleEditStart(
                                        pm.id,
                                        pm.title,
                                      )
                                    }
                                  >
                                    제목 수정
                                  </button>
                                )}
                              {editingPureMediaTitleDraft === null &&
                                !editingPureMediaTitleSaving &&
                                editingMediaUrlDraft === null &&
                                !editingMediaUrlSaving &&
                                !showTacitItemInput &&
                                !showMediaAttachInput &&
                                editingTacitItemDraft === null &&
                                !editingTacitItemSaving &&
                                editingStepGroupDraft === null &&
                                !editingStepGroupSaving &&
                                editDraft === null &&
                                detachingMediaId === null &&
                                deletingPureMediaTacitId === null && (
                                  <button
                                    className={styles.metaEditTrigger}
                                    onClick={() =>
                                      handleDeletePureMediaTacit(pm.id)
                                    }
                                  >
                                    삭제
                                  </button>
                                )}
                              {deletePureMediaError?.tacitItemId === pm.id &&
                                deletingPureMediaTacitId === null && (
                                  <p className={styles.errorText}>
                                    {deletePureMediaError.message}
                                  </p>
                                )}
                            </>
                          )}
                          <div className={styles.adminTacitMediaRow}>
                            {pm.media.map((m) => (
                              <div key={m.id} className={styles.adminMediaItem}>
                                {m.mediaType === 'image' ? (
                                  <img
                                    src={m.url}
                                    alt=""
                                    className={styles.adminTacitMediaThumb}
                                    loading="lazy"
                                  />
                                ) : (
                                  <span className={styles.adminVideoLabel}>
                                    video
                                  </span>
                                )}
                                {editingMediaUrlDraft?.mediaId === m.id ? (
                                  <div className={styles.metaEditForm}>
                                    <label className={styles.metaEditLabel}>
                                      URL
                                      <input
                                        type="url"
                                        className={styles.metaEditInput}
                                        value={editingMediaUrlDraft.url}
                                        onChange={(e) =>
                                          setEditingMediaUrlDraft((prev) =>
                                            prev
                                              ? {
                                                  ...prev,
                                                  url: e.target.value,
                                                }
                                              : prev,
                                          )
                                        }
                                      />
                                    </label>
                                    {editingMediaUrlError && (
                                      <p className={styles.errorText}>
                                        {editingMediaUrlError}
                                      </p>
                                    )}
                                    <div className={styles.metaEditActions}>
                                      <button
                                        className={styles.metaEditSaveBtn}
                                        onClick={handleMediaUrlEditSave}
                                        disabled={editingMediaUrlSaving}
                                      >
                                        저장
                                      </button>
                                      <button
                                        className={styles.metaEditCancelBtn}
                                        onClick={handleMediaUrlEditCancel}
                                        disabled={editingMediaUrlSaving}
                                      >
                                        취소
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <span className={styles.adminMediaUrl}>
                                      {m.url}
                                    </span>
                                    {editingMediaUrlDraft === null &&
                                      !editingMediaUrlSaving &&
                                      !showTacitItemInput &&
                                      !showMediaAttachInput &&
                                      editingTacitItemDraft === null &&
                                      !editingTacitItemSaving &&
                                      editingStepGroupDraft === null &&
                                      !editingStepGroupSaving &&
                                      editDraft === null &&
                                      editingPureMediaTitleDraft === null &&
                                      !editingPureMediaTitleSaving &&
                                      detachingMediaId === null &&
                                      deletingPureMediaTacitId === null && (
                                        <button
                                          className={styles.metaEditTrigger}
                                          onClick={() =>
                                            handleMediaUrlEditStart(m.id, m.url)
                                          }
                                        >
                                          URL 수정
                                        </button>
                                      )}
                                    {pm.media.length > 1 &&
                                      editingMediaUrlDraft === null &&
                                      !editingMediaUrlSaving &&
                                      !showTacitItemInput &&
                                      !showMediaAttachInput &&
                                      editingTacitItemDraft === null &&
                                      !editingTacitItemSaving &&
                                      editingStepGroupDraft === null &&
                                      !editingStepGroupSaving &&
                                      editDraft === null &&
                                      editingPureMediaTitleDraft === null &&
                                      !editingPureMediaTitleSaving &&
                                      detachingMediaId === null &&
                                      deletingPureMediaTacitId === null && (
                                        <button
                                          className={styles.metaEditTrigger}
                                          onClick={() =>
                                            handleDetachTacitMedia(m.id)
                                          }
                                        >
                                          연결 해제
                                        </button>
                                      )}
                                    {detachMediaError?.mediaId === m.id &&
                                      detachingMediaId === null && (
                                        <p className={styles.errorText}>
                                          {detachMediaError.message}
                                        </p>
                                      )}
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                      {drilldown.textTacitItems.length === 0 &&
                        drilldown.pureMediaItems.length === 0 && (
                          <p className={styles.adminEmptyHint}>
                            암묵지 항목이 없습니다.
                          </p>
                        )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {bundle &&
        bundle.menu.id === selectedMenuId &&
        previewEngineState &&
        previewEngineState.bundle === bundle &&
        (() => {
        const previewState = previewEngineState;
        const previewDerived = computeDerivedData(previewState);
        const tacitDetail: TacitDetailViewModel | null =
          buildTacitDetailViewModel(previewState);
        const nextPreview: NextGroupPreviewViewModel | null =
          buildNextGroupPreview(previewState);

        const previewIngredientNames = new Map<string, string>();
        for (const opt of storeIngredientOptions) {
          previewIngredientNames.set(opt.id, opt.display_name);
        }
        const previewLocationLabels = buildLocationLabelMap(
          previewState.bundle.locations,
        );
        const representativeAction = pickRepresentativeAction(
          previewDerived.legalActions,
        );

        return (
          <section className={styles.adminLinkNodeSection}>
            <h3 className={styles.adminLinkNodeHeading}>
              엔진 드라이런 시뮬레이터 (로컬 전용)
            </h3>
            <button
              type="button"
              className={styles.retryButton}
              onClick={handlePreviewReset}
            >
              초기 상태로 리셋
            </button>
            <p className={styles.progressText}>
              진행률 {previewDerived.satisfiedNodes}/
              {previewDerived.totalNodes} · legal action{' '}
              {previewDerived.legalActions.length}개
            </p>
            {previewDerived.isComplete && (
              <span className={styles.statusBadge}>완료 가능</span>
            )}

            {previewDerived.legalActions.length > 0 ? (
              <>
                {representativeAction && (
                  <div className={styles.representativeAction}>
                    <div className={styles.representativeLabel}>
                      대표 초기 액션
                    </div>
                    {formatFriendlyAction(
                      representativeAction,
                      previewIngredientNames,
                      previewLocationLabels,
                    )}
                  </div>
                )}
                <div className={styles.friendlyActionList}>
                  {previewDerived.legalActions.map(
                    (action: LegalAction, idx: number) => (
                      <div key={idx} className={styles.friendlyActionItem}>
                        {formatFriendlyAction(
                          action,
                          previewIngredientNames,
                          previewLocationLabels,
                        )}
                        <span className={styles.tacitSensoryTag}>
                          {formatLegalAction(action)}
                        </span>
                      </div>
                    ),
                  )}
                </div>
                <div className={styles.actionList}>
                  {previewDerived.legalActions.map(
                    (action: LegalAction, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        className={styles.actionButton}
                        onClick={() => handlePreviewActionClick(action)}
                      >
                        {formatLegalAction(action)}
                      </button>
                    ),
                  )}
                </div>
              </>
            ) : (
              <p className={styles.adminEmptyHint}>
                legal action이 없습니다 (노드/로케이션 구성을 확인하거나 리셋하세요).
              </p>
            )}

            {tacitDetail ? (
              <div className={styles.tacitPanel}>
                <div className={styles.tacitHeader}>
                  <span className={styles.tacitStepNo}>
                    Step {tacitDetail.stepGroup.display_step_no}
                  </span>
                  <span className={styles.tacitTitle}>
                    {tacitDetail.stepGroup.title}
                  </span>
                  {tacitDetail.primaryLocationLabel && (
                    <span className={styles.tacitLocationBadge}>
                      {tacitDetail.primaryLocationLabel}
                    </span>
                  )}
                </div>
                {tacitDetail.stepGroup.summary && (
                  <p className={styles.tacitSummary}>
                    {tacitDetail.stepGroup.summary}
                  </p>
                )}
                {tacitDetail.tacitItems.length > 0 ? (
                  <div className={styles.tacitItemList}>
                    {tacitDetail.tacitItems.map((item) => (
                      <div key={item.id} className={styles.tacitItemCard}>
                        <div className={styles.tacitItemTitle}>
                          {item.title}
                        </div>
                        {item.body && (
                          <p className={styles.tacitItemBody}>{item.body}</p>
                        )}
                        <PreviewTacitItemMedia
                          media={
                            tacitDetail.tacitMediaByItemId.get(item.id) ?? []
                          }
                        />
                        <PreviewTacitSensoryNotes item={item} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.tacitEmptyHint}>
                    이 단계의 암묵지가 아직 등록되지 않았습니다.
                  </p>
                )}
              </div>
            ) : (
              <p className={styles.adminEmptyHint}>
                활성 스텝 그룹이 없습니다 (스텝 그룹 + 노드 연결을 추가하세요).
              </p>
            )}

            {nextPreview && (
              <div className={styles.nextPreviewCard}>
                <div className={styles.nextPreviewHeader}>
                  <span className={styles.nextPreviewLabel}>다음 단계</span>
                </div>
                <div className={styles.nextPreviewBody}>
                  <span className={styles.nextPreviewStepNo}>
                    Step {nextPreview.stepGroup.display_step_no}
                  </span>
                  <span className={styles.nextPreviewTitle}>
                    {nextPreview.stepGroup.title}
                  </span>
                  {nextPreview.primaryLocationLabel && (
                    <span className={styles.nextPreviewLocationBadge}>
                      {nextPreview.primaryLocationLabel}
                    </span>
                  )}
                </div>
                {nextPreview.stepGroup.summary && (
                  <p className={styles.nextPreviewSummary}>
                    {nextPreview.stepGroup.summary}
                  </p>
                )}
                {nextPreview.tacitItems.length > 0 && (
                  <div className={styles.nextPreviewItemList}>
                    {nextPreview.tacitItems.map((item) => (
                      <div
                        key={item.id}
                        className={styles.nextPreviewItemTitle}
                      >
                        {item.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })()}

      <button className={styles.backButton} onClick={() => navigate('/practice')}>
        연습 목록으로
      </button>
    </div>
  );
};

export default PracticeAdminPage;
