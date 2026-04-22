import type { ReactNode } from 'react';

// SharedKitchenShell — mode-agnostic frame for the shared kitchen surface.
// Scope: Phase 2 skeleton only. Owns no store subscriptions.
// The shell receives mode-specific content via named slot props.
// See docs/practice/EXECUTION_PLAN_2026-04-21.md §12 Gate A (decisions 1 and 4)
// for the boundary rationale. Not wired into router/page in this skeleton task.
export interface SharedKitchenShellProps {
  hudSlots?: ReactNode;
  overlaySlots?: ReactNode;
  children?: ReactNode;
}

export function SharedKitchenShell({ hudSlots, overlaySlots, children }: SharedKitchenShellProps) {
  return (
    <div data-shared-kitchen-shell>
      {hudSlots}
      {children}
      {overlaySlots}
    </div>
  );
}
