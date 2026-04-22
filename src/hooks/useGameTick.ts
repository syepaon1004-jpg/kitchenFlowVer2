import { useEffect, useRef } from 'react';
import { useEquipmentStore } from '../stores/equipmentStore';
import { useGameStore } from '../stores/gameStore';

export function useGameTick(options?: { onPostTick?: () => void }) {
  const equipments = useEquipmentStore((s) => s.equipments);
  const tickWok = useEquipmentStore((s) => s.tickWok);
  const tickBasket = useEquipmentStore((s) => s.tickBasket);
  const tickMicrowave = useEquipmentStore((s) => s.tickMicrowave);

  const containerInstances = useGameStore((s) => s.containerInstances);
  const tickMix = useGameStore((s) => s.tickMix);

  // staleRef 패턴: equipments는 매 렌더마다 갱신, tick 함수는 stable
  const equipmentsRef = useRef(equipments);
  const containerInstancesRef = useRef(containerInstances);
  const onPostTickRef = useRef(options?.onPostTick);

  // ref sync — render 직후 최신 값으로 갱신
  useEffect(() => {
    equipmentsRef.current = equipments;
    containerInstancesRef.current = containerInstances;
    onPostTickRef.current = options?.onPostTick;
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

      onPostTickRef.current?.();
    }, 1000);

    return () => clearInterval(intervalId);
  }, []); // mount once — empty deps
}
