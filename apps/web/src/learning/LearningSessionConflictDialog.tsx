import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useRef } from "react";
import { useBackDismiss } from "../navigation/useBackDismiss";

interface LearningSessionConflictDialogProps {
  currentCourseTitle: string;
  nextCourseTitle: string;
  draftText: string;
  onCancel: () => void;
  onDiscard: () => void;
  onPost: () => void;
}

export function LearningSessionConflictDialog({
  currentCourseTitle,
  nextCourseTitle,
  draftText,
  onCancel,
  onDiscard,
  onPost,
}: LearningSessionConflictDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useBackDismiss({ open: true, onDismiss: onCancel });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return undefined;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="learning-session-dialog"
      aria-modal="true"
      aria-labelledby="learning-session-dialog-title"
      aria-describedby="learning-session-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <button
        type="button"
        data-fixed-radius
        className="learning-session-dialog__close"
        aria-label="Keep the current learning session"
        onClick={onCancel}
      >
        <X size={18} />
      </button>
      <div className="learning-session-dialog__icon" aria-hidden="true">
        <WarningCircle size={27} weight="fill" />
      </div>
      <div className="learning-session-dialog__copy">
        <h2 id="learning-session-dialog-title">Post your comment first?</h2>
        <p id="learning-session-dialog-description">
          Opening <strong>{nextCourseTitle}</strong> will replace your active
          session in <strong>{currentCourseTitle}</strong>. This comment has not
          been posted yet.
        </p>
      </div>
      <blockquote className="learning-session-dialog__draft">
        {draftText}
      </blockquote>
      <div className="learning-session-dialog__actions">
        <button type="button" onClick={onCancel}>
          Keep learning
        </button>
        <button type="button" onClick={onDiscard}>
          Discard &amp; switch
        </button>
        <button
          type="button"
          data-control-radius-action
          onClick={onPost}
          autoFocus
        >
          Post &amp; switch
        </button>
      </div>
    </dialog>
  );
}
