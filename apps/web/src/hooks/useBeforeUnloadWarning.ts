import { useEffect } from "react";

/**
 * Asks the browser to confirm reloading or closing the tab while `active`.
 * Browsers show their own generic message; custom text is not supported.
 */
export function useBeforeUnloadWarning(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Cancelling the event is the standard way to request the prompt.
      event.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);
}
