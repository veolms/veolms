import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { EyeIcon as Eye } from "@phosphor-icons/react/Eye";
import type { ShortLink } from "@veolms/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import { modeLabel } from "./linkStyles";

/** Redirect 302 / Redirect 301 / Shown here. */
export function LinkTypeBadge({
  link,
}: {
  link: Pick<ShortLink, "mode" | "redirectStatus">;
}) {
  const Icon = link.mode === "rewrite" ? Eye : ArrowSquareOut;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--card-surface) px-2 py-1 text-xs font-semibold whitespace-nowrap text-(--text-secondary)">
      <Icon size={13} className="shrink-0 text-(--accent)" aria-hidden />
      {modeLabel(link)}
    </span>
  );
}

/** Active (green) or Paused (grey), as the Students page marks status. */
export function LinkStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
      <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-(--border) bg-(--surface-strong) px-2 py-0.5 text-[11px] font-semibold text-(--muted)">
      <span className="size-1.5 rounded-full bg-(--muted)" aria-hidden />
      Paused
    </span>
  );
}

/**
 * Copies text and remembers, for a moment, which item was copied, so a
 * button can say "Copied".
 */
export function useCopiedText() {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied(null);
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1600);
  }, []);
  return { copied, copy };
}
