// Soft by its gradient alone, which runs out further than it did, not by a
// `blur()` on top: Safari draws a blurred box again whenever the page around
// it moves, and with the video's glow on the same page it dropped whole
// parts of the page for a moment (2026-11-16).
export const SURFACE_TOP_RIGHT_ACCENT_GLOW =
  "pointer-events-none absolute -top-28 -right-20 z-0 size-80 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_20%,transparent)_0%,color-mix(in_srgb,var(--accent)_11%,transparent)_24%,color-mix(in_srgb,var(--accent)_4%,transparent)_48%,transparent_72%)]";

export function SurfaceTopRightAccentGlow() {
  return <div aria-hidden="true" className={SURFACE_TOP_RIGHT_ACCENT_GLOW} />;
}
