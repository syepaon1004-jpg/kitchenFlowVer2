import { useEffect, useRef } from 'react';

const MIN_SWIPE_DISTANCE = 50;
const MAX_SWIPE_TIME = 500;
const DIRECTION_RATIO = 1.2;
const DEFAULT_COOLDOWN_MS = 500;
const EDGE_GUARD_PX = 20;

interface UseSwipeNavigationOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onSwipeVertical: () => void;
  enabled: boolean;
  cooldownMs?: number;
}

function isTouchOnInteractive(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.closest('[aria-roledescription="draggable"]')) return true;
  if (el.closest('button')) return true;
  return false;
}

export function useSwipeNavigation({
  containerRef,
  onSwipeLeft,
  onSwipeRight,
  onSwipeVertical,
  enabled,
  cooldownMs = DEFAULT_COOLDOWN_MS,
}: UseSwipeNavigationOptions): void {
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastSwipeTimestampRef = useRef(0);

  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const onSwipeLeftRef = useRef(onSwipeLeft);
  onSwipeLeftRef.current = onSwipeLeft;

  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeRightRef.current = onSwipeRight;

  const onSwipeVerticalRef = useRef(onSwipeVertical);
  onSwipeVerticalRef.current = onSwipeVertical;

  const cooldownMsRef = useRef(cooldownMs);
  cooldownMsRef.current = cooldownMs;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      if (!enabledRef.current) return;
      if (e.touches.length > 1) return;
      if (isTouchOnInteractive(e.target)) return;

      const touch = e.touches[0];
      // 브라우저 뒤로가기 edge swipe 방어
      if (touch.clientX < EDGE_GUARD_PX) return;

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    }

    function handleTouchMove(e: TouchEvent) {
      if (!touchStartRef.current) return;
      // 멀티터치 전환 시 추적 취소
      if (e.touches.length > 1) {
        touchStartRef.current = null;
        return;
      }
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartRef.current.x);
      const dy = Math.abs(touch.clientY - touchStartRef.current.y);
      if ((dx > 10 || dy > 10) && e.cancelable) {
        e.preventDefault();
      }
    }

    function handleTouchEnd(e: TouchEvent) {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;

      const touch = e.changedTouches[0];
      const endTime = Date.now();
      const elapsed = endTime - start.time;
      if (elapsed > MAX_SWIPE_TIME) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (Math.max(absDx, absDy) < MIN_SWIPE_DISTANCE) return;
      if (endTime - lastSwipeTimestampRef.current < cooldownMsRef.current) return;

      if (absDx >= absDy * DIRECTION_RATIO) {
        // 수평 스와이프
        lastSwipeTimestampRef.current = endTime;
        if (dx < 0) onSwipeLeftRef.current();
        else onSwipeRightRef.current();
      } else if (absDy >= absDx * DIRECTION_RATIO) {
        // 수직 스와이프 → 뒤돌기
        lastSwipeTimestampRef.current = endTime;
        onSwipeVerticalRef.current();
      }
    }

    function handleTouchCancel() {
      touchStartRef.current = null;
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [containerRef]);
}
