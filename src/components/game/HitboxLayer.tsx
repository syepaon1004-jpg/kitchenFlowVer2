import { useEffect, useState, useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { AreaDefinition, GameEquipmentState, EquipmentType } from '../../types/db';
import { supabase } from '../../lib/supabase';
import { useUiStore } from '../../stores/uiStore';
import { useEquipmentStore } from '../../stores/equipmentStore';
import HitboxItem from './HitboxItem';
import DraggableHitbox from './DraggableHitbox';
import BasketGroup from './BasketGroup';
import { polygonClipPath } from '../../lib/hitbox/polygonClipPath';
import WokComponent from '../equipment/WokComponent';
import FryingBasketComponent from '../equipment/FryingBasketComponent';
import MicrowaveComponent from '../equipment/MicrowaveComponent';
import SinkComponent from '../equipment/SinkComponent';

interface Props {
  zoneId: string;
  imageWidth?: number;
  imageHeight?: number;
}

/** 웍이 씽크에 있을 때 원래 위치에 표시되는 빈 droppable placeholder */
function WokStationPlaceholder({
  area,
  equipmentStateId,
}: {
  area: AreaDefinition;
  equipmentStateId: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `wok-station-${equipmentStateId}`,
    data: { equipmentStateId, equipmentType: 'wok' },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left: `${area.x * 100}%`,
        top: `${area.y * 100}%`,
        width: `${area.w * 100}%`,
        height: `${area.h * 100}%`,
        clipPath: polygonClipPath(area),
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: isOver ? 'rgba(76,175,80,0.3)' : 'rgba(0,0,0,0.3)',
          border: `2px dashed ${isOver ? '#4caf50' : '#666'}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          color: '#999',
        }}
      >
        Wok 자리
      </div>
    </div>
  );
}

/** droppable ID를 기존 컴포넌트와 동일 형식으로 생성 */
function equipmentDroppableId(equipmentType: EquipmentType, stateId: string): string {
  switch (equipmentType) {
    case 'wok': return `equipment-wok-${stateId}`;
    case 'frying_basket': return `equipment-basket-${stateId}`;
    case 'microwave': return `equipment-mw-${stateId}`;
    case 'sink': return `equipment-sink-${stateId}`;
  }
}

/** overlay_image_url이 있는 equipment: 이미지=히트박스, 버튼=이미지 아래 */
function EquipmentOverlayWrapper({
  area,
  equipState,
  EquipComp,
}: {
  area: AreaDefinition;
  equipState: GameEquipmentState;
  EquipComp: React.ComponentType<{ equipmentState: GameEquipmentState; skipDroppable?: boolean }>;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: equipmentDroppableId(area.equipment_type!, equipState.id),
    data: { equipmentStateId: equipState.id, equipmentType: area.equipment_type },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        position: 'absolute',
        left: `${area.x * 100}%`,
        top: `${area.y * 100}%`,
        width: `${area.w * 100}%`,
        height: `${area.h * 100}%`,
        border: isOver ? '2px solid #4caf50' : undefined,
      }}
    >
      {/* 이미지가 히트박스 역할 */}
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
        <HitboxItem area={area} fillParent />
      </svg>
      {/* 버튼은 이미지 하단 내부에 오버레이 */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', background: 'rgba(0,0,0,0.7)', borderRadius: '0 0 6px 6px' }}>
        <EquipComp equipmentState={equipState} skipDroppable />
      </div>
    </div>
  );
}

export default function HitboxLayer({ zoneId, imageWidth, imageHeight }: Props) {
  const vbW = imageWidth ?? 1000;
  const vbH = imageHeight ?? 1000;
  const [areas, setAreas] = useState<AreaDefinition[]>([]);
  const setLeftSidebarZone = useUiStore((s) => s.setLeftSidebarZone);
  const equipments = useEquipmentStore((s) => s.equipments);
  const wokAtSink = useEquipmentStore((s) => s.wok_at_sink);

  useEffect(() => {
    setAreas([]);
    supabase
      .from('area_definitions')
      .select('*')
      .eq('zone_id', zoneId)
      .then(({ data, error }) => {
        if (!error && data) {
          setAreas(data as AreaDefinition[]);
        }
      });
  }, [zoneId]);

  // 무한 리렌더 방지: 파생 계산은 useMemo로 감싸기
  const draggableAreas = useMemo(
    () => areas.filter((a) =>
      (a.area_type === 'ingredient' || a.area_type === 'container') && !a.parent_area_id
    ),
    [areas],
  );
  const navigateAreas = useMemo(
    () => areas.filter((a) => a.area_type === 'navigate'),
    [areas],
  );
  const equipmentAreas = useMemo(
    () => areas.filter((a) => a.area_type === 'equipment'),
    [areas],
  );
  const basketAreas = useMemo(
    () => areas.filter((a) => a.area_type === 'basket'),
    [areas],
  );
  const basketChildrenMap = useMemo(() => {
    const map = new Map<string, AreaDefinition[]>();
    for (const area of areas) {
      if (area.parent_area_id) {
        const list = map.get(area.parent_area_id) ?? [];
        list.push(area);
        map.set(area.parent_area_id, list);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [areas]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 시각 렌더링 전용 SVG — pointerEvents: none */}
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        {areas
          .filter((a) => a.area_type !== 'basket' && !a.parent_area_id)
          .map((area) => (
            <HitboxItem key={area.id} area={area} vbW={vbW} vbH={vbH} />
          ))}
      </svg>

      {/* 드래그 감지용 HTML div 오버레이 (ingredient / container) */}
      {draggableAreas.map((area) => (
        <DraggableHitbox key={`drag-${area.id}`} area={area} />
      ))}

      {/* navigate 클릭 감지용 HTML div */}
      {navigateAreas.map((area) => (
        <div
          key={`nav-${area.id}`}
          onClick={() =>
            area.navigate_zone_id && setLeftSidebarZone(area.navigate_zone_id)
          }
          style={{
            position: 'absolute',
            left: `${area.x * 100}%`,
            top: `${area.y * 100}%`,
            width: `${area.w * 100}%`,
            height: `${area.h * 100}%`,
            cursor: 'pointer',
            clipPath: polygonClipPath(area),
          }}
        />
      ))}

      {/* equipment 컴포넌트 렌더링 */}
      {equipmentAreas.map((area) => {
        const equipState = equipments.find(
          (e) =>
            e.equipment_type === area.equipment_type &&
            e.equipment_index === area.equipment_index,
        );
        if (!equipState) return null;

        // 웍이 씽크에 있으면: 원래 위치에 빈 placeholder 렌더
        if (area.equipment_type === 'wok' && wokAtSink.has(equipState.id)) {
          return (
            <WokStationPlaceholder
              key={`equip-${area.id}`}
              area={area}
              equipmentStateId={equipState.id}
            />
          );
        }

        // 씽크 area: 웍이 이 씽크에 와있으면 WokComponent를 씽크 위치에 렌더
        if (area.equipment_type === 'sink') {
          const wokAtThisSink = [...wokAtSink.entries()].find(
            ([, sinkId]) => sinkId === equipState.id,
          );
          if (wokAtThisSink) {
            const wokEquipState = equipments.find((e) => e.id === wokAtThisSink[0]);
            if (wokEquipState) {
              return (
                <div
                  key={`equip-${area.id}`}
                  style={{
                    position: 'absolute',
                    left: `${area.x * 100}%`,
                    top: `${area.y * 100}%`,
                    width: `${area.w * 100}%`,
                    height: `${area.h * 100}%`,
                    clipPath: polygonClipPath(area),
                  }}
                >
                  <WokComponent equipmentState={wokEquipState} atSink />
                </div>
              );
            }
          }
        }

        const EquipComp =
          area.equipment_type === 'wok'
            ? WokComponent
            : area.equipment_type === 'frying_basket'
              ? FryingBasketComponent
              : area.equipment_type === 'microwave'
                ? MicrowaveComponent
                : area.equipment_type === 'sink'
                  ? SinkComponent
                  : null;

        if (!EquipComp) return null;

        // overlay_image_url이 있으면 이미지+버튼 외부 배치 구조
        if (area.overlay_image_url) {
          return (
            <EquipmentOverlayWrapper
              key={`equip-${area.id}`}
              area={area}
              equipState={equipState}
              EquipComp={EquipComp}
            />
          );
        }

        return (
          <div
            key={`equip-${area.id}`}
            style={{
              position: 'absolute',
              left: `${area.x * 100}%`,
              top: `${area.y * 100}%`,
              width: `${area.w * 100}%`,
              height: `${area.h * 100}%`,
            }}
          >
            <EquipComp equipmentState={equipState} />
          </div>
        );
      })}

      {/* basket 그룹 렌더링 */}
      {basketAreas.map((basket) => (
        <BasketGroup
          key={`basket-${basket.id}`}
          basket={basket}
          children={basketChildrenMap.get(basket.id) ?? []}
        />
      ))}
    </div>
  );
}
