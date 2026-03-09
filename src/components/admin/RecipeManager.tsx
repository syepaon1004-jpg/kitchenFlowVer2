import { useEffect, useMemo, useState } from 'react';
import { ACTION_TYPES } from '../../types/db';
import type { ActionType, Container, Recipe, RecipeIngredient, RecipeStep, StoreIngredient } from '../../types/db';
import { supabase } from '../../lib/supabase';
import { uploadToStorage } from '../../lib/storage';
import { analyzeRecipe, toValidActionType } from '../../lib/recipe/analyzeRecipe';
import styles from './RecipeManager.module.css';


interface IngredientRow {
  key: number; // local key for React list
  ingredient_id: string;
  quantity: number;
  quantity_tolerance: number;
  plate_order: number;
  required_action_type: ActionType | null;
  required_duration_min: number | null;
  required_duration_max: number | null;
}

const emptyRow = (key: number): IngredientRow => ({
  key,
  ingredient_id: '',
  quantity: 1,
  quantity_tolerance: 0.1,
  plate_order: 1,
  required_action_type: null,
  required_duration_min: null,
  required_duration_max: null,
});

interface StepRow {
  step_order: number;
  image_url: string | null; // existing URL from DB
  file: File | null;         // newly selected file
}

interface Props {
  storeId: string;
  ingredients: StoreIngredient[];
  containers: Container[];
}

const RecipeManager = ({ storeId, ingredients, containers }: Props) => {
  // ── Recipe list state ──
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Form state ──
  const [mode, setMode] = useState<'view' | 'create' | 'edit'>('view');
  const [formName, setFormName] = useState('');
  const [formContainerId, setFormContainerId] = useState<string | null>(null);
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Step image state ──
  const [stepRows, setStepRows] = useState<StepRow[]>([]);
  const [, setLoadedSteps] = useState<RecipeStep[]>([]);

  // AI analysis
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLowConfidence, setAiLowConfidence] = useState<Set<number>>(new Set());

  // ── Load recipes on mount ──
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('recipes')
        .select('*')
        .eq('store_id', storeId);
      if (data) setRecipes(data as Recipe[]);
    };
    load();
  }, [storeId]);

  // ── Select a recipe ──
  const handleSelect = async (recipe: Recipe) => {
    setSelectedId(recipe.id);
    setMode('view');
    setSaveError(null);

    // Load ingredients and steps for this recipe
    const [ingRes, stepRes] = await Promise.all([
      supabase.from('recipe_ingredients').select('*').eq('recipe_id', recipe.id),
      supabase.from('recipe_steps').select('*').eq('recipe_id', recipe.id),
    ]);

    const ingRows = (ingRes.data as RecipeIngredient[] | null) ?? [];
    let k = 1;
    setRows(
      ingRows.map((ri) => ({
        key: k++,
        ingredient_id: ri.ingredient_id,
        quantity: ri.quantity,
        quantity_tolerance: ri.quantity_tolerance,
        plate_order: ri.plate_order,
        required_action_type: ri.required_action_type,
        required_duration_min: ri.required_duration_min,
        required_duration_max: ri.required_duration_max,
      })),
    );
    setNextKey(k);
    setFormName(recipe.name);
    setFormContainerId(recipe.target_container_id);

    // Load step images
    const steps = (stepRes.data as RecipeStep[] | null) ?? [];
    setLoadedSteps(steps);

    // Build stepRows from plate_orders + existing steps
    const plateOrders = new Set(ingRows.map((ri) => ri.plate_order));
    plateOrders.add(0); // step 0 = empty container
    const stepMap = new Map(steps.map((s) => [s.step_order, s.image_url]));
    setStepRows(
      Array.from(plateOrders)
        .sort((a, b) => a - b)
        .map((order) => ({
          step_order: order,
          image_url: stepMap.get(order) ?? null,
          file: null,
        })),
    );

    setAiText('');
    setAiLowConfidence(new Set());
    setAiError(null);
  };

  // ── Start create mode ──
  const handleStartCreate = () => {
    setSelectedId(null);
    setMode('create');
    setFormName('');
    setFormContainerId(null);
    setRows([emptyRow(1)]);
    setNextKey(2);
    setSaveError(null);
    setStepRows([{ step_order: 0, image_url: null, file: null }]);
    setLoadedSteps([]);
    setAiText('');
    setAiLowConfidence(new Set());
    setAiError(null);
  };

  // ── Start edit mode ──
  const handleStartEdit = () => {
    setMode('edit');
    setSaveError(null);
  };

  // ── Cancel editing ──
  const handleCancel = () => {
    setAiLowConfidence(new Set());
    setAiError(null);
    if (mode === 'create') {
      setMode('view');
      setSelectedId(null);
    } else {
      // Re-select to reload original data
      const recipe = recipes.find((r) => r.id === selectedId);
      if (recipe) handleSelect(recipe);
      else setMode('view');
    }
  };

  // ── AI analysis ──
  const handleAiAnalyze = async () => {
    const text = aiText.trim();
    if (!text) return;

    // 기존 데이터 덮어쓰기 경고
    const hasData = rows.some((r) => r.ingredient_id !== '');
    if (hasData) {
      const confirmed = window.confirm(
        'AI 분석 결과로 기존 재료 목록을 덮어씁니다. 계속하시겠습니까?',
      );
      if (!confirmed) return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiLowConfidence(new Set());

    try {
      const result = await analyzeRecipe({
        natural_text: text,
        store_ingredients: ingredients,
        containers,
      });

      let key = nextKey;
      const lowKeys = new Set<number>();

      const newRows: IngredientRow[] = result.ingredients.map((ai) => {
        const rowKey = key++;

        if (ai.confidence === 'low' || ai.matched_ingredient_id === null) {
          lowKeys.add(rowKey);
        }

        const actionType = toValidActionType(ai.action_type);
        const duration = ai.duration_sec > 0 ? ai.duration_sec : null;

        return {
          key: rowKey,
          ingredient_id: ai.matched_ingredient_id ?? '',
          quantity: ai.quantity,
          quantity_tolerance: 0.1,
          plate_order: ai.plate_order,
          required_action_type: actionType,
          required_duration_min: duration,
          required_duration_max: null,
        };
      });

      setRows(newRows);
      setNextKey(key);
      setAiLowConfidence(lowKeys);

      if (result.target_container?.matched_container_id) {
        setFormContainerId(result.target_container.matched_container_id);
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI 분석 중 오류 발생');
    } finally {
      setAiLoading(false);
    }
  };

  // ── Delete recipe ──
  const handleDelete = async (recipe: Recipe) => {
    const confirmed = window.confirm(
      `'${recipe.name}' 레시피를 삭제하시겠습니까?\n연결된 레시피 재료도 모두 삭제됩니다.`,
    );
    if (!confirmed) return;

    setDeleteError(null);
    const { error } = await supabase.from('recipes').delete().eq('id', recipe.id);

    if (error) {
      setDeleteError(error.message);
      return;
    }

    setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
    if (selectedId === recipe.id) {
      setSelectedId(null);
      setMode('view');
    }
  };

  // ── Row manipulation ──
  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(nextKey)]);
    setNextKey((k) => k + 1);
  };

  const removeRow = (key: number) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const updateRow = (key: number, field: keyof IngredientRow, value: unknown) => {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  };

  // ── Save step images helper ──
  const saveStepImages = async (recipeId: string): Promise<string | null> => {
    // Delete existing steps
    const { error: delStepErr } = await supabase
      .from('recipe_steps')
      .delete()
      .eq('recipe_id', recipeId);

    if (delStepErr) return delStepErr.message;

    // Upload new files and collect rows to insert
    const stepInsertRows: { recipe_id: string; store_id: string; step_order: number; image_url: string }[] = [];

    for (const step of stepRows) {
      let url = step.image_url;
      if (step.file) {
        url = await uploadToStorage(step.file, 'recipe-steps');
      }
      if (url) {
        stepInsertRows.push({
          recipe_id: recipeId,
          store_id: storeId,
          step_order: step.step_order,
          image_url: url,
        });
      }
    }

    if (stepInsertRows.length > 0) {
      const { error: stepInsertErr } = await supabase
        .from('recipe_steps')
        .insert(stepInsertRows);
      if (stepInsertErr) return stepInsertErr.message;
    }

    return null;
  };

  // ── Save ──
  const handleSave = async () => {
    if (!formName.trim()) return;

    // Validate all rows have ingredient selected
    const validRows = rows.filter((r) => r.ingredient_id !== '');
    if (validRows.length === 0) {
      setSaveError('최소 1개의 재료를 추가해주세요.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      if (mode === 'create') {
        // Insert recipe
        const { data: recipeData, error: recipeErr } = await supabase
          .from('recipes')
          .insert({
            store_id: storeId,
            name: formName.trim(),
            target_container_id: formContainerId,
          })
          .select()
          .single();

        if (recipeErr) {
          setSaveError(recipeErr.message);
          return;
        }

        const newRecipe = recipeData as Recipe;

        // Insert ingredients
        const ingRows = validRows.map((r) => ({
          recipe_id: newRecipe.id,
          ingredient_id: r.ingredient_id,
          quantity: r.quantity,
          quantity_tolerance: r.quantity_tolerance,
          plate_order: r.plate_order,
          required_action_type: r.required_action_type,
          required_duration_min: r.required_duration_min,
          required_duration_max: r.required_duration_max,
        }));

        const { error: ingErr } = await supabase
          .from('recipe_ingredients')
          .insert(ingRows);

        if (ingErr) {
          // Rollback: delete the recipe
          await supabase.from('recipes').delete().eq('id', newRecipe.id);
          setSaveError(ingErr.message);
          return;
        }

        // Save step images
        const stepErr = await saveStepImages(newRecipe.id);
        if (stepErr) {
          setSaveError(stepErr);
          return;
        }

        setRecipes((prev) => [...prev, newRecipe]);
        setSelectedId(newRecipe.id);
        setMode('view');
      } else if (mode === 'edit' && selectedId) {
        // Update recipe
        const { data: recipeData, error: recipeErr } = await supabase
          .from('recipes')
          .update({
            name: formName.trim(),
            target_container_id: formContainerId,
          })
          .eq('id', selectedId)
          .select()
          .single();

        if (recipeErr) {
          setSaveError(recipeErr.message);
          return;
        }

        const updatedRecipe = recipeData as Recipe;

        // Delete old ingredients, then re-insert
        const { error: delErr } = await supabase
          .from('recipe_ingredients')
          .delete()
          .eq('recipe_id', selectedId);

        if (delErr) {
          setSaveError(delErr.message);
          return;
        }

        const ingRows = validRows.map((r) => ({
          recipe_id: selectedId,
          ingredient_id: r.ingredient_id,
          quantity: r.quantity,
          quantity_tolerance: r.quantity_tolerance,
          plate_order: r.plate_order,
          required_action_type: r.required_action_type,
          required_duration_min: r.required_duration_min,
          required_duration_max: r.required_duration_max,
        }));

        const { error: ingErr } = await supabase
          .from('recipe_ingredients')
          .insert(ingRows);

        if (ingErr) {
          setSaveError(ingErr.message);
          return;
        }

        // Save step images
        const stepErr = await saveStepImages(selectedId);
        if (stepErr) {
          setSaveError(stepErr);
          return;
        }

        setRecipes((prev) =>
          prev.map((r) => (r.id === selectedId ? updatedRecipe : r)),
        );
        setMode('view');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '알 수 없는 오류');
    } finally {
      setSaving(false);
    }
  };

  // ── Sync stepRows with rows' plate_orders ──
  const derivedStepOrders = useMemo(() => {
    const orders = new Set(rows.filter((r) => r.ingredient_id !== '').map((r) => r.plate_order));
    orders.add(0); // step 0 = empty container
    return Array.from(orders).sort((a, b) => a - b);
  }, [rows]);

  // Keep stepRows in sync with derivedStepOrders (preserve existing file/image_url)
  useEffect(() => {
    setStepRows((prev) => {
      const prevMap = new Map(prev.map((s) => [s.step_order, s]));
      return derivedStepOrders.map((order) => prevMap.get(order) ?? {
        step_order: order,
        image_url: null,
        file: null,
      });
    });
  }, [derivedStepOrders]);

  // ── Helpers ──
  const selectedRecipe = recipes.find((r) => r.id === selectedId) ?? null;
  const isEditing = mode === 'create' || mode === 'edit';
  const canSave = formName.trim() !== '' && rows.some((r) => r.ingredient_id !== '');

  const getIngredientName = (id: string) =>
    ingredients.find((i) => i.id === id)?.display_name ?? id;

  const getContainerName = (id: string | null) =>
    id ? (containers.find((c) => c.id === id)?.name ?? id) : '없음';

  return (
    <div className={styles.container}>
      <h2>레시피 관리</h2>

      {deleteError && <div className={styles.error}>{deleteError}</div>}

      <div className={styles.layout}>
        {/* ── Left: Recipe list ── */}
        <div className={styles.recipeList}>
          <h3>레시피 목록</h3>
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              className={`${styles.recipeItem} ${recipe.id === selectedId ? styles.recipeItemActive : ''}`}
              onClick={() => handleSelect(recipe)}
            >
              <span>{recipe.name}</span>
              <span
                className={styles.recipeDeleteBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(recipe);
                }}
              >
                ✕
              </span>
            </button>
          ))}
          <button className={styles.addRecipeBtn} onClick={handleStartCreate}>
            + 새 레시피
          </button>
        </div>

        {/* ── Right: Detail panel ── */}
        <div className={styles.detailPanel}>
          {!selectedRecipe && mode !== 'create' ? (
            <div className={styles.emptyDetail}>
              레시피를 선택하거나 새로 만들어주세요.
            </div>
          ) : (
            <>
              {saveError && <div className={styles.error}>{saveError}</div>}

              {/* Recipe basic info */}
              <div className={styles.formGrid}>
                <div className={styles.formField}>
                  <label>레시피 이름</label>
                  {isEditing ? (
                    <input
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="예: 불고기덮밥"
                    />
                  ) : (
                    <span>{formName}</span>
                  )}
                </div>
                <div className={styles.formField}>
                  <label>완성 그릇</label>
                  {isEditing ? (
                    <select
                      value={formContainerId ?? ''}
                      onChange={(e) =>
                        setFormContainerId(e.target.value || null)
                      }
                    >
                      <option value="">없음</option>
                      {containers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.container_type})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>{getContainerName(formContainerId)}</span>
                  )}
                </div>
              </div>

              {/* Recipe ingredients */}
              <div className={styles.ingredientSection}>
                <h4>레시피 재료</h4>
                <table className={styles.ingTable}>
                  <thead>
                    <tr>
                      <th>재료</th>
                      <th>수량</th>
                      <th>허용오차</th>
                      <th>순서</th>
                      <th>조리법</th>
                      <th>최소(초)</th>
                      <th>최대(초)</th>
                      {isEditing && <th></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.key}
                        className={aiLowConfidence.has(row.key) ? styles.lowConfidenceRow : undefined}
                      >
                        <td>
                          {isEditing ? (
                            <select
                              value={row.ingredient_id}
                              onChange={(e) =>
                                updateRow(row.key, 'ingredient_id', e.target.value)
                              }
                            >
                              <option value="">— 선택 —</option>
                              {ingredients.map((ing) => (
                                <option key={ing.id} value={ing.id}>
                                  {ing.display_name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            getIngredientName(row.ingredient_id)
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.quantity}
                              onChange={(e) =>
                                updateRow(row.key, 'quantity', Number(e.target.value))
                              }
                            />
                          ) : (
                            row.quantity
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={row.quantity_tolerance}
                              onChange={(e) =>
                                updateRow(row.key, 'quantity_tolerance', Number(e.target.value))
                              }
                            />
                          ) : (
                            row.quantity_tolerance
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={row.plate_order}
                              onChange={(e) =>
                                updateRow(row.key, 'plate_order', Number(e.target.value))
                              }
                            />
                          ) : (
                            row.plate_order
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <select
                              value={row.required_action_type ?? ''}
                              onChange={(e) =>
                                updateRow(
                                  row.key,
                                  'required_action_type',
                                  e.target.value || null,
                                )
                              }
                            >
                              <option value="">없음</option>
                              {ACTION_TYPES.map((a) => (
                                <option key={a} value={a}>
                                  {a}
                                </option>
                              ))}
                            </select>
                          ) : (
                            row.required_action_type ?? '—'
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.required_duration_min ?? ''}
                              onChange={(e) =>
                                updateRow(
                                  row.key,
                                  'required_duration_min',
                                  e.target.value === '' ? null : Number(e.target.value),
                                )
                              }
                            />
                          ) : (
                            row.required_duration_min ?? '—'
                          )}
                        </td>
                        <td>
                          {isEditing ? (
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={row.required_duration_max ?? ''}
                              onChange={(e) =>
                                updateRow(
                                  row.key,
                                  'required_duration_max',
                                  e.target.value === '' ? null : Number(e.target.value),
                                )
                              }
                            />
                          ) : (
                            row.required_duration_max ?? '—'
                          )}
                        </td>
                        {isEditing && (
                          <td>
                            <button
                              className={styles.removeRowBtn}
                              onClick={() => removeRow(row.key)}
                            >
                              ✕
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {isEditing && (
                  <button className={styles.addRowBtn} onClick={addRow}>
                    + 재료 행 추가
                  </button>
                )}
              </div>

              {/* Step images */}
              <div className={styles.stepSection}>
                <h4>스텝 이미지</h4>
                <p className={styles.stepHint}>
                  Step 0 = 빈 그릇, 이후 각 plate_order에 해당하는 조리 단계 이미지
                </p>
                <div className={styles.stepGrid}>
                  {stepRows.map((step) => (
                    <div key={step.step_order} className={styles.stepCard}>
                      <div className={styles.stepLabel}>
                        Step {step.step_order}
                        {step.step_order === 0 ? ' (빈 그릇)' : ''}
                      </div>
                      <div className={styles.stepPreview}>
                        {step.file ? (
                          <img src={URL.createObjectURL(step.file)} alt={`Step ${step.step_order}`} />
                        ) : step.image_url ? (
                          <img src={step.image_url} alt={`Step ${step.step_order}`} />
                        ) : (
                          <span className={styles.stepPlaceholder}>—</span>
                        )}
                      </div>
                      {isEditing && (
                        <input
                          className={styles.stepFileInput}
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setStepRows((prev) =>
                              prev.map((s) =>
                                s.step_order === step.step_order ? { ...s, file } : s,
                              ),
                            );
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* AI analysis */}
              {isEditing && (
                <div className={styles.aiSection}>
                  <h4>AI 자연어 분석</h4>
                  <p className={styles.aiHint}>
                    조리 과정을 자연어로 입력하세요.<br />
                    예: 양파 50g을 넣고 10초 볶고 양배추 100g을 넣고...
                  </p>
                  <textarea
                    className={styles.aiTextarea}
                    value={aiText}
                    onChange={(e) => setAiText(e.target.value)}
                    placeholder="레시피를 자유롭게 입력하세요"
                    disabled={aiLoading}
                  />
                  <div className={styles.aiBtnRow}>
                    <button
                      className={styles.aiBtn}
                      onClick={handleAiAnalyze}
                      disabled={aiLoading || !aiText.trim()}
                    >
                      {aiLoading ? 'AI 분석 중...' : 'AI 분석'}
                    </button>
                  </div>
                  {aiError && <div className={styles.error}>{aiError}</div>}
                </div>
              )}

              {/* Actions */}
              <div className={styles.formActions}>
                {isEditing ? (
                  <>
                    <button
                      className={styles.saveBtn}
                      onClick={handleSave}
                      disabled={!canSave || saving}
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                    <button
                      className={styles.cancelBtn}
                      onClick={handleCancel}
                      disabled={saving}
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    className={styles.saveBtn}
                    onClick={handleStartEdit}
                  >
                    편집
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecipeManager;
