interface SidebarToggleIconProps {
  className?: string;
  direction: "left" | "right";
}

export function SidebarToggleIcon({
  className,
  direction,
}: SidebarToggleIconProps) {
  const arrowPath =
    direction === "left" ? "M18 27L13 32L18 37" : "M23 27L28 32L23 37";

  return (
    <svg
      className={className}
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
        rx="14"
        fill="var(--sidebar-toggle-surface, #878d9a)"
      />
      <rect
        x="34"
        y="10"
        width="22"
        height="44"
        rx="7"
        fill="var(--sidebar-toggle-ink, white)"
      />
      <path
        d="M13 32H28"
        stroke="var(--sidebar-toggle-ink, white)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d={arrowPath}
        stroke="var(--sidebar-toggle-ink, white)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
