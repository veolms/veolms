import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

import { useBackDismiss } from "../navigation/useBackDismiss";
import { MyFiles } from "./MyFiles";
import { StorageSpaceSummary } from "./StorageSpaceSummary";

/**
 * "Manage storage" over whatever page it is opened from (a chat whose file
 * did not fit, Settings > Learning): the space used and the learner's own
 * files to delete. A panel from the right on wide screens, the whole screen
 * on a phone. Esc, Back or the arrow closes it. It lies under the storage
 * dialogs (z-1200), so "Delete these files?" shows over it.
 */
export function MyFilesSheet({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  useBackDismiss({ open: true, onDismiss: onClose });

  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      // A dialog or preview over it closes first (they take Esc).
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target instanceof Node ? event.target : null;
      if (target && !panelRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-1100 flex justify-end">
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-black/55 backdrop-blur-xs [animation:deleteModalFadeIn_0.18s_ease-out]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-(--surface) text-(--text) shadow-2xl outline-none animate-in slide-in-from-right duration-200 sm:max-w-[560px] sm:border-l sm:border-(--border)"
      >
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-[color-mix(in_srgb,var(--text)_9%,transparent)] px-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--text) hover:bg-(--hover)"
          >
            <ArrowLeft size={21} />
          </button>
          <h2 id={titleId} className="m-0 text-[1.1rem] font-semibold">
            Manage storage
          </h2>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-5">
            <StorageSpaceSummary />
            <MyFiles />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
