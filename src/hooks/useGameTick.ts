import { useEffect, useRef } from 'react';
import { useEquipmentStore } from '../stores/equipmentStore';
import { useGameStore } from '../stores/gameStore';
import { useScoringStore } from '../stores/scoringStore';

export function useGameTick() {
  const equipments = useEquipmentStore((s) => s.equipments);
  const tickWok = useEquipmentStore((s) => s.tickWok);
  const tickBasket = useEquipmentStore((s) => s.tickBasket);
  const tickMicrowave = useEquipmentStore((s) => s.tickMicrowave);
  const stirring_equipment_ids = useEquipmentStore((s) => s.stirring_equipment_ids);

  const containerInstances = useGameStore((s) => s.containerInstances);
  const tickMix = useGameStore((s) => s.tickMix);
  const sessionId = useGameStore((s) => s.sessionId);

  const addActionLog = useScoringStore((s) => s.addActionLog);
  const checkIdlePenalty = useScoringStore((s) => s.checkIdlePenalty);

  // staleRef 패턴: equipments는 매 렌더마다 갱신, tick 함수는 stable
  const equipmentsRef = useRef(equipments);
  const containerInstancesRef = useRef(containerInstances);
  const sessionIdRef = useRef(sessionId);
  const stirringRef = useRef(stirring_equipment_ids);

  // ref sync — render 직후 최신 값으로 갱신
  useEffect(() => {
    equipmentsRef.current = equipments;
    containerInstancesRef.current = containerInstances;
    sessionIdRef.current = sessionId;
    stirringRef.current = stirring_equipment_ids;
  });

  useEffect(() => {
    const intervalId = setInterval(() => {
      for (const equip of equipmentsRef.current) {
        switch (equip.equipment_type) {
          case 'wok':
            tickWok(equip.id);
            break;
          case 'frying_basket':
            tickBasket(equip.id);
            break;
          case 'microwave':
            tickMicrowave(equip.id);
            break;
          // sink has no tick logic
        }
      }

      // Container mix ticks
      for (const ci of containerInstancesRef.current) {
        tickMix(ci.id);
      }

      // 볶기 중인 웍이 있으면 매초 stir 로그 기록 (idle 방지)
      if (sessionIdRef.current && stirringRef.current.size > 0) {
        for (const equipId of stirringRef.current) {
          addActionLog({
            session_id: sessionIdRef.current,
            action_type: 'stir',
            timestamp_ms: Date.now(),
            metadata: { equipment_id: equipId },
          });
        }
      }

      // 공백 감지
      checkIdlePenalty(Date.now());
    }, 1000);

    return () => clearInterval(intervalId);
  }, []); // mount once — empty deps
}
