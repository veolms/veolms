import { useEffect, useState } from "react";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { AutosyncStatus } from "../lib/autosync";

/**
 * The autosave pill, as in the course editor's footer: "Saving changes...",
 * then "All changes saved" for a moment. A draft that cannot be saved yet
 * says what it is missing until that is filled in.
 */
export function WorkshopSaveStatus({
  status,
  error,
}: {
  status: AutosyncStatus;
  error: string;
}) {
  const [showSaved, setShowSaved] = useState(false);
  useEffect(() => {
    if (status !== "saved") return undefined;
    setShowSaved(true);
    const timer = window.setTimeout(() => setShowSaved(false), 2_500);
    return () => window.clearTimeout(timer);
  }, [status]);

  let content: React.ReactNode = null;
  if (status === "pending" || status === "syncing") {
    content = (
      <>
        <CircleNotch size={14} className="animate-spin text-(--accent)" />
        <span className="text-(--text-secondary)">Saving changes...</span>
      </>
    );
  } else if (status === "blocked") {
    content = (
      <>
        <WarningCircle
          size={14}
          weight="fill"
          className="shrink-0 text-amber-500"
        />
        <span className="text-(--text-secondary)">
          {error || "Not saved yet"}
        </span>
      </>
    );
  } else if (
    status === "error" ||
    status === "conflict" ||
    status === "offline"
  ) {
    content = (
      <>
        <WarningCircle
          size={14}
          weight="fill"
          className="shrink-0 text-rose-500"
        />
        <span className="text-rose-500">
          {status === "offline"
            ? "Offline. Saved on this device"
            : "Save failed"}
        </span>
      </>
    );
  } else if (status === "saved" && showSaved) {
    content = (
      <>
        <CheckCircle
          size={14}
          weight="fill"
          className="shrink-0 text-emerald-500"
        />
        <span className="text-emerald-500">All changes saved</span>
      </>
    );
  }
  if (!content) return null;

  return (
    <div
      aria-live="polite"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--border)_70%,transparent)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-3 py-1 text-[0.78rem] font-medium shadow-xs select-none"
    >
      {content}
    </div>
  );
}
