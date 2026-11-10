import { useId } from "react";

/**
 * A small clay diya with a flickering flame, drawn 62 by 46 (the flame on
 * the spout at the right); mirror it with `-scale-x-100` in `className`.
 */
export function DiyaIcon({
  className = "",
  flameDelay = "0s",
  glow = true,
}: {
  className?: string;
  flameDelay?: string;
  /** A warm halo behind the flame that breathes with it. */
  glow?: boolean;
}) {
  const id = useId();
  const flame = `${id}-flame`;
  const clay = `${id}-clay`;
  return (
    <span aria-hidden="true" className={`relative inline-block ${className}`}>
      {glow ? (
        <span
          style={{ animationDelay: flameDelay }}
          className="pointer-events-none absolute top-[-85%] left-[64%] aspect-square w-[150%] -translate-x-1/2 animate-[diwali-glow_5.4s_ease-in-out_infinite] rounded-full bg-[radial-gradient(circle,rgb(255_184_92/0.55),rgb(255_140_40/0.12)_45%,transparent_70%)] motion-reduce:animate-none [:root[data-rendering=software]_&]:animate-none"
        />
      ) : null}
      <svg
        viewBox="0 0 62 46"
        className="relative block h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id={flame} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#FFE7A0" />
            <stop offset=".55" stopColor="#FFB13B" />
            <stop offset="1" stopColor="#F26B1D" />
          </linearGradient>
          <linearGradient id={clay} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C8642F" />
            <stop offset="1" stopColor="#6E2810" />
          </linearGradient>
        </defs>
        <g
          style={{ animationDelay: flameDelay }}
          className="origin-[50%_100%] animate-[diwali-flicker_3.6s_ease-in-out_infinite] [transform-box:fill-box] motion-reduce:animate-none [:root[data-rendering=software]_&]:animate-none"
        >
          <path
            d="M51 1 C55.5 8 57.5 13.5 51 19.5 C44.5 13.5 46.5 8 51 1Z"
            fill={`url(#${flame})`}
          />
          <path
            d="M51 9 C53 12.5 53.5 15 51 17.5 C48.5 15 49 12.5 51 9Z"
            fill="#FFF8E1"
          />
        </g>
        <path d="M51 19.5 L50 22" stroke="#3a1a0c" strokeWidth="1.4" />
        <path
          d="M3 23 Q22 20.5 44 22.5 L58 19 Q56 27.5 47 30 Q41 43.5 25 43.5 Q9 42.5 3 23Z"
          fill={`url(#${clay})`}
        />
        <ellipse cx="25" cy="23.2" rx="21" ry="3.2" fill="#4a1d0b" />
        <path
          d="M3.2 23 Q24 19.5 46 22.4"
          stroke="#E08A4C"
          strokeWidth="1.2"
          fill="none"
        />
        <g fill="#F4C25B">
          <circle cx="12" cy="31" r="1.3" />
          <circle cx="18.5" cy="34" r="1.3" />
          <circle cx="25" cy="35" r="1.3" />
          <circle cx="31.5" cy="34" r="1.3" />
          <circle cx="38" cy="31.5" r="1.3" />
        </g>
      </svg>
    </span>
  );
}
