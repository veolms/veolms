import type { ReactNode } from "react";
import { usePlayerTheme } from "../../themes/PlayerThemeContext";

interface MenuTriggerContentProps {
  icon: ReactNode;
  value: ReactNode;
}

export function MenuTriggerContent({ icon, value }: MenuTriggerContentProps) {
  const DisclosureIcon = usePlayerTheme().icons.disclosure;
  return (
    <>
      <span
        className="grid size-4 shrink-0 place-items-center text-(--video-player-control-text-muted)"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className="min-w-0 truncate">{value}</span>
      <DisclosureIcon
        className="size-3.5 shrink-0 text-(--video-player-control-text-muted)"
        aria-hidden="true"
        style={{ transform: "rotate(90deg)" }}
      />
    </>
  );
}
