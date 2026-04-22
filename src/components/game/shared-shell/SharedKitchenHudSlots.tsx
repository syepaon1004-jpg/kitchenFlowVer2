import type { ReactNode } from 'react';

// SharedKitchenHudSlots — named HUD slot container for the shared kitchen shell.
// Each slot prop is supplied by the mode-specific overlay/adapter consumer, not
// by the shell itself. Shell-level position/layout concerns stay here, mode
// semantics (rejection popup, guide, order queue, step panel) stay out.
// References docs/practice/SHARED_SHELL_BOUNDARY_APPENDIX_2026-04-21.md §5.1.
export interface SharedKitchenHudSlotsProps {
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomLeft?: ReactNode;
  bottomRight?: ReactNode;
  modeSummary?: ReactNode;
}

export function SharedKitchenHudSlots({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
  modeSummary,
}: SharedKitchenHudSlotsProps) {
  return (
    <div data-shared-kitchen-hud-slots>
      {modeSummary}
      {topLeft}
      {topRight}
      {bottomLeft}
      {bottomRight}
    </div>
  );
}
