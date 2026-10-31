import { useId } from "react";

interface SidebarToggleIconProps {
  className?: string;
  direction: "left" | "right";
}

/**
 * A rounded tile with the sidebar cut out of its left side: the cut is a
 * real hole, so whatever lies behind the button shows through it.
 *
 * The cut narrows with the sidebar: 26 units wide on a sidebar of 220px or
 * more, 17 on the collapsed rail (`direction` "right": the button would
 * open it). While the sidebar is dragged it follows the drag's width in
 * between.
 */
export function SidebarToggleIcon({
  className,
  direction,
}: SidebarToggleIconProps) {
  const cutId = `sidebar-toggle-cut-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <svg
      className={`[--sidebar-resize-preview-width:inherit] ${className ?? ""}`}
      width="64"
      height="64"
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      data-sidebar-toggle-direction={direction}
    >
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="13"
        fill="var(--sidebar-toggle-surface, #878d9a)"
        mask={`url(#${cutId})`}
      />
      <mask
        id={cutId}
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="64"
        height="64"
        className="[--sidebar-resize-preview-width:inherit]"
      >
        <rect x="0" y="0" width="64" height="64" fill="white" />
        <rect
          data-sidebar-toggle-cut=""
          data-sidebar-resize-reader=""
          x="9"
          y="9"
          width={direction === "left" ? 26 : 17}
          height="46"
          rx="8"
          fill="black"
          className="[--sidebar-resize-preview-width:inherit] [.courses-app--resizing_&]:[width:clamp(17px,calc(17px_+_(var(--sidebar-resize-preview-width)_-_76px)_/_16),26px)]"
        />
      </mask>
    </svg>
  );
}
