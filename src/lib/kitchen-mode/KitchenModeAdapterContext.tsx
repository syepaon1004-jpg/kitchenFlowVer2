import type { ReactNode } from 'react';
import type { KitchenModeAdapter } from './KitchenModeAdapter';
import { KitchenModeAdapterContext } from './KitchenModeAdapter';

// Provider component only. The Context object and the matching `useKitchenModeAdapter` hook
// are co-located in `./KitchenModeAdapter.ts` because `react-refresh/only-export-components`
// disallows Context / non-component exports from a `.tsx` file.
export interface KitchenModeAdapterProviderProps {
  adapter: KitchenModeAdapter;
  children: ReactNode;
}

export function KitchenModeAdapterProvider({ adapter, children }: KitchenModeAdapterProviderProps) {
  return (
    <KitchenModeAdapterContext.Provider value={adapter}>
      {children}
    </KitchenModeAdapterContext.Provider>
  );
}
