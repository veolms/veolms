import type { SVGProps } from "react";

/**
 * The signed-out profile mark: a solid person inside a ring. The icon set's
 * own user-in-a-circle is either all outline or a solid disc with the person
 * cut out of it; neither has the person filled and only a line around it.
 * Drawn on the icon set's 256 grid so it sits beside its icons.
 */
export function GuestProfileIcon({
  size = 24,
  ringWidth = 8,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "width" | "height"> & {
  size?: number;
  /** The ring's thickness on the 256 grid: 8 is thin, 16 is regular. */
  ringWidth?: number;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="currentColor"
      {...props}
    >
      <circle
        cx="128"
        cy="128"
        r="96"
        fill="none"
        stroke="currentColor"
        strokeWidth={ringWidth}
      />
      <circle cx="128" cy="118" r="36" />
      {/* The shoulders, closed off along the ring. */}
      <path d="M63.8,199.4a80,80,0,0,1,128.4,0A96,96,0,0,1,63.8,199.4Z" />
    </svg>
  );
}
