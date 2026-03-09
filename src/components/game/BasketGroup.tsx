import { useState, useMemo } from 'react';
import { useDndMonitor } from '@dnd-kit/core';
import type { AreaDefinition } from '../../types/db';
import HitboxItem from './HitboxItem';
import DraggableHitbox from './DraggableHitbox';

interface Props {
  basket: AreaDefinition;
  children: AreaDefinition[]; // sort_order 오름차순 정렬 완료
}

/** 펼침 시 자식 간 Y축 오프셋 (비율값, 0~1) */
const STEP = 0.04;

export default function BasketGroup({ basket, children }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [locked, setLocked] = useState(false);
  const [draggingChildId, setDraggingChildId] = useState<string | null>(null);

  // 자식 area id Set (드래그 소스 판별용)
  const childIds = useMemo(() => new Set(children.map((c) => c.id)), [children]);

  // 드래그 lock/unlock: 자식을 드래그하면 펼침 고정
  useDndMonitor({
    onDragStart(event) {
      const sourceAreaId = event.active.data.current?.sourceAreaId as string | undefined;
      if (sourceAreaId && childIds.has(sourceAreaId)) {
        setExpanded(true);
        setLocked(true);
        setDraggingChildId(sourceAreaId);
      }
    },
    onDragEnd() {
      if (locked) {
        setLocked(false);
        setExpanded(false);
        setDraggingChildId(null);
      }
    },
  });

  // wrapper bounding box: basket + 자식 전체를 감싸는 영역 (펼침 오프셋 반영)
  const bounds = useMemo(() => {
    const all = [basket, ...children];
    const maxExpandOffset = children.length * STEP;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const a of all) {
      minX = Math.min(minX, a.x);
      minY = Math.min(minY, a.y);
      maxX = Math.max(maxX, a.x + a.w);
      minY = Math.min(minY, a.y - maxExpandOffset);
      maxY = Math.max(maxY, a.y + a.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [basket, children]);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${bounds.x * 100}%`,
        top: `${bounds.y * 100}%`,
        width: `${bounds.w * 100}%`,
        height: `${bounds.h * 100}%`,
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => { if (!locked) setExpanded(false); }}
    >
      {/* 투명 커버: 펼침 시 wrapper 전체를 채워 호버 이탈 방지 */}
      {expanded && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      )}

      {/* basket 자체 (배경 역할, zIndex: 0) */}
      <div
        style={{
          position: 'absolute',
          left: `${((basket.x - bounds.x) / bounds.w) * 100}%`,
          top: `${((basket.y - bounds.y) / bounds.h) * 100}%`,
          width: `${(basket.w / bounds.w) * 100}%`,
          height: `${(basket.h / bounds.h) * 100}%`,
          zIndex: 0,
        }}
      >
        <svg
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <HitboxItem area={basket} fillParent />
        </svg>
      </div>

      {/* 자식 렌더: sort_order 오름차순 (낮은 것 먼저 = 뒤에 깔림) */}
      {children.map((child, i) => {
        // 낮은 sort_order(index 0) → 가장 많이 이동, 높은 sort_order → 가장 적게
        const yOffset = expanded ? -(children.length - i) * STEP : 0;
        return (
          <div
            key={child.id}
            style={{
              position: 'absolute',
              left: `${((child.x - bounds.x) / bounds.w) * 100}%`,
              top: `${((child.y + yOffset - bounds.y) / bounds.h) * 100}%`,
              width: `${(child.w / bounds.w) * 100}%`,
              height: `${(child.h / bounds.h) * 100}%`,
              transition: 'top 0.2s ease',
              opacity: draggingChildId === child.id ? 0 : 1,
              zIndex: i + 1,
            }}
          >
            {/* 이미지 렌더링 (SVG) */}
            <svg
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
              }}
            >
              <HitboxItem area={child} fillParent />
            </svg>
            {/* 드래그 감지: fillParent로 부모 div를 채움 */}
            <DraggableHitbox area={child} fillParent />
          </div>
        );
      })}
    </div>
  );
}
