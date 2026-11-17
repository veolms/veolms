import { inputClass } from "../../workshops/workshopHelpers";

/**
 * The editor's shared class lists, matching the course editor's fields
 * (workshopHelpers' `inputClass`, the sales page editor's labels).
 */

export const fieldLabelClasses =
  "mb-1.5 block text-[12.5px] font-medium text-(--muted)";

export const textInputClasses = `${inputClass} w-full`;

/** ThemedSelect's trigger, boxed like the text fields around it. */
export const selectTriggerClasses =
  "h-9! sm:h-10! rounded-[10px]! border! border-solid! border-[color-mix(in_srgb,var(--text)_12%,transparent)]! bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))]! px-3! text-sm! shadow-none!";

export const textareaClasses = `${inputClass} h-auto! w-full resize-y py-2.5 leading-6`;

export const smallButtonClasses =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_14%,transparent)] bg-transparent px-3 text-[13px] font-semibold text-(--text) transition-colors hover:border-(--accent)/50 hover:text-(--accent) disabled:pointer-events-none disabled:opacity-40";

export const addButtonClasses =
  "inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-[color-mix(in_srgb,var(--text)_18%,transparent)] bg-transparent px-3 text-[13px] font-semibold text-(--text) transition-colors hover:border-(--accent)/50 hover:text-(--accent) disabled:pointer-events-none disabled:opacity-40";

export const iconButtonClasses =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-(--muted) transition-colors hover:bg-(--hover) hover:text-(--text) disabled:pointer-events-none disabled:opacity-30";

export const panelCardClasses =
  "grid gap-3 rounded-xl border border-[color-mix(in_srgb,var(--text)_9%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_40%,var(--surface))] p-3";

/** A row of choices, one selected: the tab-like switch used in settings. */
export const segmentGroupClasses =
  "grid auto-cols-fr grid-flow-col gap-1 rounded-[10px] bg-[color-mix(in_srgb,var(--text)_6%,transparent)] p-1";

export function segmentClasses(selected: boolean): string {
  return `h-8 cursor-pointer rounded-lg border-none px-2 text-[12.5px] font-semibold transition-colors ${
    selected
      ? "bg-(--surface) text-(--text) shadow-[0_1px_3px_rgb(0_0_0/.18)]"
      : "bg-transparent text-(--muted) hover:text-(--text)"
  }`;
}
