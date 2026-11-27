import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "../../components/Button";
import { Checkbox } from "../../components/Checkbox";
import { useBackDismiss } from "../../navigation/useBackDismiss";

/**
 * Asked before a course is published: whether its learners are told.
 * Nobody is unless the admin ticks the box (owner, 22 Nov 2026: every
 * publish, a republish too, used to notify every enrolled learner).
 */
export function PublishNotifyDialog({
  open,
  republish,
  onCancel,
  onPublish,
}: {
  open: boolean;
  /** The course is live already: this publishes its changes. */
  republish: boolean;
  onCancel: () => void;
  onPublish: (notifyLearners: boolean) => void;
}) {
  const [notify, setNotify] = useState(false);
  useBackDismiss({ open, onDismiss: onCancel });

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, open]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/65 p-4 backdrop-blur-xs [animation:deleteModalFadeIn_0.18s_ease-out]"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-notify-title"
    >
      <div
        className="relative w-full max-w-[440px] rounded-[16px] border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--surface) p-6 shadow-[0_20px_48px_rgba(0,0,0,0.45)] [animation:deleteModalPopIn_0.22s_cubic-bezier(0.16,1,0.3,1)] max-[480px]:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3
              id="publish-notify-title"
              className="m-0 text-[1.1rem] font-bold tracking-tight text-(--text)"
            >
              {republish ? "Publish changes" : "Publish course"}
            </h3>
            <p className="m-0 mt-1 text-[0.82rem] text-(--muted)">
              {republish
                ? "Learners see the changes as soon as you publish."
                : "The course goes live for learners."}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)"
          >
            <X size={18} />
          </button>
        </div>
        <div className="-mx-2.5 mb-5">
          <Checkbox
            id="publish-notify-learners"
            checked={notify}
            onCheckedChange={setNotify}
            label="Send notification to enrolled learners"
          />
          <p className="m-0 mt-0.5 px-2.5 text-[0.78rem] text-(--muted)">
            Off: nobody is notified. You can send one later from Extras.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onPublish(notify)}>
            {notify ? "Publish and notify" : "Publish"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
