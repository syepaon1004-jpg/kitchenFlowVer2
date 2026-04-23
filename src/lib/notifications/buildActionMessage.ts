import type { ResolvedAction } from '../../types/game';
import type { Container, GameContainerInstance, StoreIngredient } from '../../types/db';
import type { ToastSeverity } from '../../stores/uiStore';

export interface ToastMessage {
  message: string;
  severity: ToastSeverity;
}

export interface MessageContext {
  ingredients: Map<string, StoreIngredient>;
  containers: Map<string, Container>;
  containerInstances: Map<string, GameContainerInstance>;
  quantity?: number;
}

const MAX_LEN = 40;

function truncate(s: string): string {
  if (s.length <= MAX_LEN) return s;
  return s.slice(0, MAX_LEN - 1) + '…';
}

function ingName(ctx: MessageContext, id: string | undefined): string {
  if (!id) return '재료';
  const si = ctx.ingredients.get(id);
  return si?.display_name ?? id;
}

function ingUnit(ctx: MessageContext, id: string | undefined): string {
  if (!id) return '';
  return ctx.ingredients.get(id)?.unit ?? '';
}

function containerName(ctx: MessageContext, instanceId: string | undefined): string {
  if (!instanceId) return '그릇';
  const inst = ctx.containerInstances.get(instanceId);
  if (!inst) return '그릇';
  const c = ctx.containers.get(inst.container_id);
  return c?.name ?? '그릇';
}

export function buildActionMessage(
  action: ResolvedAction,
  ctx: MessageContext,
): ToastMessage | null {
  switch (action.type) {
    case 'add-ingredient': {
      const name = ingName(ctx, action.ingredientId);
      const unit = ingUnit(ctx, action.ingredientId);
      const qty = ctx.quantity;
      const qtyText = qty != null ? `${qty}${unit}` : '';
      const loc = action.destination?.locationType;
      if (loc === 'equipment') {
        return {
          message: truncate(qtyText ? `${name} ${qtyText} 투입!` : `${name} 투입!`),
          severity: 'info',
        };
      }
      if (loc === 'container') {
        const dest = containerName(ctx, action.destination?.containerInstanceId);
        return {
          message: truncate(qtyText ? `${name} ${qtyText} → ${dest}` : `${name} → ${dest}`),
          severity: 'info',
        };
      }
      if (loc === 'hand') {
        return { message: truncate(`${name} 들기`), severity: 'info' };
      }
      return null;
    }

    case 'pour': {
      const src = action.source;
      const dst = action.destination;
      if (!src || !dst) return null;
      if (src.locationType === 'equipment' && dst.locationType === 'container') {
        const destName = containerName(ctx, dst.containerInstanceId);
        return { message: truncate(`웍 내용물 → ${destName}`), severity: 'info' };
      }
      if (src.locationType === 'container' && dst.locationType === 'equipment') {
        const srcName = containerName(ctx, src.containerInstanceId);
        return { message: truncate(`${srcName} → 웍에 붓기`), severity: 'info' };
      }
      if (src.locationType === 'container' && dst.locationType === 'container') {
        const srcName = containerName(ctx, src.containerInstanceId);
        const destName = containerName(ctx, dst.containerInstanceId);
        return { message: truncate(`${srcName} → ${destName}`), severity: 'info' };
      }
      return null;
    }

    case 'place-container': {
      if (!action.containerId) return null;
      const name = ctx.containers.get(action.containerId)?.name ?? '그릇';
      return { message: truncate(`${name} 배치`), severity: 'info' };
    }

    case 'move-container': {
      const name = containerName(ctx, action.containerInstanceId);
      return { message: truncate(`${name} 이동`), severity: 'info' };
    }

    case 'dispose': {
      const name = containerName(ctx, action.containerInstanceId);
      return { message: truncate(`${name} 폐기`), severity: 'warning' };
    }

    case 'move-wok-to-sink':
      return { message: '웍 싱크대로 이동 (씻기 시작)', severity: 'info' };

    case 'serve-order':
      return { message: '주문 서빙 완료', severity: 'success' };

    default:
      return null;
  }
}
