export const SURFACE_TOP_RIGHT_ACCENT_GLOW =
  "pointer-events-none absolute -top-28 -right-20 z-0 size-80 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_28%,transparent)_0%,color-mix(in_srgb,var(--accent)_9%,transparent)_38%,transparent_70%)] blur-3xl";

export function SurfaceTopRightAccentGlow() {
  return <div aria-hidden="true" className={SURFACE_TOP_RIGHT_ACCENT_GLOW} />;
}
