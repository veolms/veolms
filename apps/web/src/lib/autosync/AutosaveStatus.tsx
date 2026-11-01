import type { AutosyncStatus } from "./types";

interface AutosaveStatusProps {
  status: AutosyncStatus;
  /** Why the draft has not been saved, shown with the status text. */
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

function getAutosaveMessage(status: AutosyncStatus, detail: string): string {
  switch (status) {
    case "syncing":
    case "pending":
      return "Saving…";
    case "offline":
      return "Offline — not saved yet";
    // The draft is waiting on the person (a field to finish, a number to
    // verify). That is a next step, not a failure, so the reason is the
    // whole message.
    case "blocked":
      return detail || "Not saved yet";
    case "error":
    case "conflict":
      return detail ? `Not saved. ${detail}` : "Not saved";
    default:
      return "Saved";
  }
}

export function AutosaveStatus({ status, error }: AutosaveStatusProps) {
  const failed = status === "error" || status === "conflict";
  return (
    <p
      role="status"
      aria-live="polite"
      data-autosave-state={
        failed ? "error" : isAutosaveUnsaved(status) ? "waiting" : undefined
      }
    >
      {getAutosaveMessage(status, error ?? "")}
    </p>
  );
}
