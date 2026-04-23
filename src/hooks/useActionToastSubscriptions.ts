import { useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';
import { useEquipmentStore } from '../stores/equipmentStore';
import { useSelectionStore } from '../stores/selectionStore';
import { useUiStore } from '../stores/uiStore';
import type { Container, GameContainerInstance, GameEquipmentState, WokStatus } from '../types/db';
import type { SelectionState } from '../types/game';

interface Params {
  containersMap: Map<string, Container>;
  getRecipeName: (recipeId: string) => string;
}

/**
 * handleResolvedAction 바깥에서 일어나는 상태 전이를 감시해
 * 액션 피드백 토스트를 발사한다.
 *   - 새 주문 도착
 *   - 컨테이너 완성 (is_complete: false → true)
 *   - 웍 세척 완료 (wok_status: dirty → clean)
 *   - 웍 태움 (* → burned)
 *   - 선택 변경 (null → X, X → Y) — 해제(X → null)는 무시
 *
 * 첫 렌더에서는 prev snapshot만 초기화하고 알림은 발사하지 않음.
 */
function labelForSelection(
  sel: SelectionState,
  containersMap: Map<string, Container>,
  containerInstances: GameContainerInstance[],
  equipments: GameEquipmentState[],
): string {
  if (sel.type === 'ingredient') return sel.sourceLabel ?? '재료';
  if (sel.type === 'container') return sel.sourceLabel ?? '그릇';
  if (sel.type === 'placed-container') {
    const ci = containerInstances.find((c) => c.id === sel.containerInstanceId);
    const cname = ci ? containersMap.get(ci.container_id)?.name : undefined;
    return cname ?? '그릇';
  }
  if (sel.type === 'wok-content') {
    const eq = equipments.find((e) => e.id === sel.equipmentStateId);
    return eq?.equipment_index != null ? `웍 ${eq.equipment_index + 1} 내용` : '웍 내용';
  }
  return '';
}

export function useActionToastSubscriptions({ containersMap, getRecipeName }: Params) {
  const orders = useGameStore((s) => s.orders);
  const containerInstances = useGameStore((s) => s.containerInstances);
  const equipments = useEquipmentStore((s) => s.equipments);
  const selection = useSelectionStore((s) => s.selection);
  const pushActionToast = useUiStore((s) => s.pushActionToast);

  const prevOrderIdsRef = useRef<Set<string> | null>(null);
  const prevContainerCompleteRef = useRef<Map<string, boolean> | null>(null);
  const prevWokStatusRef = useRef<Map<string, WokStatus | null> | null>(null);
  const prevSelectionRef = useRef<SelectionState | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevOrderIdsRef.current;
    const current = new Set(orders.map((o) => o.id));
    if (prev == null) {
      prevOrderIdsRef.current = current;
      return;
    }
    for (const o of orders) {
      if (!prev.has(o.id)) {
        const name = getRecipeName(o.recipe_id);
        pushActionToast(`새 주문: ${name}`, 'info');
      }
    }
    prevOrderIdsRef.current = current;
  }, [orders, getRecipeName, pushActionToast]);

  useEffect(() => {
    const prev = prevContainerCompleteRef.current;
    const current = new Map<string, boolean>();
    for (const ci of containerInstances) current.set(ci.id, ci.is_complete);
    if (prev == null) {
      prevContainerCompleteRef.current = current;
      return;
    }
    for (const ci of containerInstances) {
      const was = prev.get(ci.id) ?? false;
      if (!was && ci.is_complete) {
        const cname = containersMap.get(ci.container_id)?.name ?? '그릇';
        pushActionToast(`${cname} 완성`, 'success');
      }
    }
    prevContainerCompleteRef.current = current;
  }, [containerInstances, containersMap, pushActionToast]);

  useEffect(() => {
    const prev = prevWokStatusRef.current;
    const current = new Map<string, WokStatus | null>();
    for (const e of equipments) {
      if (e.equipment_type === 'wok') current.set(e.id, e.wok_status);
    }
    if (prev == null) {
      prevWokStatusRef.current = current;
      return;
    }
    for (const e of equipments) {
      if (e.equipment_type !== 'wok') continue;
      const prevStatus = prev.get(e.id);
      const currentStatus = e.wok_status;
      if (prevStatus === 'dirty' && currentStatus === 'clean') {
        pushActionToast('웍 세척 완료', 'success');
      } else if (prevStatus !== 'burned' && currentStatus === 'burned') {
        pushActionToast('웍 태움!', 'danger');
      }
    }
    prevWokStatusRef.current = current;
  }, [equipments, pushActionToast]);

  useEffect(() => {
    const prev = prevSelectionRef.current;
    prevSelectionRef.current = selection;
    if (prev === undefined) return; // 첫 렌더 — snapshot만
    if (!selection) return; // 선택 해제는 알리지 않음
    if (prev === selection) return; // reference 동일 — 변화 없음
    const label = labelForSelection(selection, containersMap, containerInstances, equipments);
    if (label) pushActionToast(`${label} 선택`, 'info');
  }, [selection, containersMap, containerInstances, equipments, pushActionToast]);
}
