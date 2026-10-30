import type { ReactNode } from "react";

import type { PopoverMenuAlign, PopoverMenuSide } from "./PopoverMenu";

export interface PlayerMenuCommonProps {
  className?: string;
  triggerClassName?: string;
  panelClassName?: string;
  trigger?: ReactNode;
  side?: PopoverMenuSide;
  align?: PopoverMenuAlign;
  disabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
