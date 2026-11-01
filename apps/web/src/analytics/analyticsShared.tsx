import { useEffect, useRef } from "react";
import type { AnalyticsExportSection } from "@veolms/web-core";

export const selectTriggerClass =
  "!h-9 sm:!h-10 !rounded-[9px] sm:!rounded-[10px] !border !border-[color-mix(in_srgb,var(--text)_12%,transparent)] !bg-[color-mix(in_srgb,var(--canvas)_75%,var(--surface))] !px-2.5 sm:!px-3.5 !text-xs sm:!text-sm !font-medium !text-(--text) focus:!border-(--accent)";

/**
 * Hands the page the tab's tables for the Export button, once per change
 * of data, and withdraws them when the tab goes away.
 */
export function useTabExport<Data>(
  onExportChange: (sections: AnalyticsExportSection[] | null) => void,
  data: Data | undefined,
  build: (data: Data) => AnalyticsExportSection[],
) {
  // The builder is a new function every render; only the data it reads
  // decides when the export changes.
  const buildRef = useRef(build);
  buildRef.current = build;
  useEffect(() => {
    onExportChange(data === undefined ? null : buildRef.current(data));
  }, [onExportChange, data]);
  useEffect(() => () => onExportChange(null), [onExportChange]);
}

/** A whole-number percent for a CSV cell. */
export function percentCell(value: number): number {
  return Math.round(value * 10) / 10;
}
