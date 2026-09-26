export const DESCRIPTION_SURFACE_BASE =
  "bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] shadow-[0_14px_38px_color-mix(in_srgb,var(--canvas)_34%,transparent),0_1px_0_color-mix(in_srgb,var(--text)_6%,transparent)]";

export const DESCRIPTION_SURFACE = `rounded-xl ${DESCRIPTION_SURFACE_BASE}`;

export const COMPACT_COMPOSER_SURFACE = `${DESCRIPTION_SURFACE_BASE} rounded-md transition-[background-color,box-shadow] hover:bg-[color-mix(in_srgb,var(--surface)_96%,var(--hover))]`;

export const MOBILE_COMPOSER_SURFACE_BASE =
  "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-transparent backdrop-blur-xl px-3 pt-2 pb-[max(8px,var(--app-safe-area-bottom))]";
