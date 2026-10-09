import type { AutosyncStatus } from "./types";

interface AutosaveStatusProps {
  status: AutosyncStatus;
  /** Why the last save did not go through, shown after the status text. */
  error?: string;
}

const UNSAVED_STATUSES: ReadonlySet<AutosyncStatus> = new Set([
  "error",
  "blocked",
  "offline",
  "conflict",
]);

/** True when the draft on screen is not what the server holds. */
export function isAutosaveUnsaved(status: AutosyncStatus): boolean {
  return UNSAVED_STATUSES.has(status);
}

function getAutosaveMessage(status: AutosyncStatus): string {
  switch (status) {
    case "syncing":
    case "pending":
      return "Saving…";
    case "offline":
      return "Offline — not saved yet";
    case "blocked":
    case "error":
    case "conflict":
      return "Not saved";
    default:
      return "Saved";
  }
}

export function AutosaveStatus({ status, error }: AutosaveStatusProps) {
  const message = getAutosaveMessage(status);
  const detail = isAutosaveUnsaved(status) && error ? error : "";

  return (
    <p
      role="status"
      aria-live="polite"
      data-autosave-state={isAutosaveUnsaved(status) ? "unsaved" : undefined}
    >
      {detail ? `${message}. ${detail}` : message}
    </p>
  );
}
