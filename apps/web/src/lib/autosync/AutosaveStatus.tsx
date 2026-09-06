import type { AutosyncStatus } from "./types";

interface AutosaveStatusProps {
  status: AutosyncStatus;
}

export function AutosaveStatus({ status }: AutosaveStatusProps) {
  const message =
    status === "syncing" || status === "pending" ? "Saving…" : "Saved";

  return (
    <p role="status" aria-live="polite">
      {message}
    </p>
  );
}
