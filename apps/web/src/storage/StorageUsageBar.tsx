import { STORAGE_NEAR_FULL_RATIO } from "@veolms/contracts";

import { cn } from "../lib/utils";

/** How full a space is, for its colour: accent, then amber, then rose. */
export function storageTone(
  usedBytes: number,
  limitBytes: number,
  blocked = false,
): "ok" | "near" | "full" {
  if (blocked || usedBytes >= limitBytes) return "full";
  return usedBytes >= limitBytes * STORAGE_NEAR_FULL_RATIO ? "near" : "ok";
}

const fill = {
  ok: "bg-(--accent)",
  near: "bg-amber-500",
  full: "bg-rose-500",
} as const;

/** A thin bar of space used; the label is read out, not drawn. */
export function StorageUsageBar({
  usedBytes,
  limitBytes,
  blocked = false,
  label,
  className,
}: {
  usedBytes: number;
  limitBytes: number;
  blocked?: boolean;
  label: string;
  className?: string;
}) {
  const ratio = limitBytes > 0 ? Math.min(1, usedBytes / limitBytes) : 1;
  const percent = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--text)_10%,transparent)]",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          fill[storageTone(usedBytes, limitBytes, blocked)],
        )}
        // Below 1% a sliver still shows that something is stored.
        style={{ width: `${usedBytes > 0 ? Math.max(percent, 1) : 0}%` }}
      />
    </div>
  );
}
