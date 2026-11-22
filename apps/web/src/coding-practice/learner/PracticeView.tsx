import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { Button } from "../../components/Button";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import { getApiError } from "../../lib/api-error";
import { useCodingPractice } from "../../services/coding-practice";
import { CodingWorkspace } from "./CodingWorkspace";

export interface PracticeViewProps {
  assignmentId: string;
  lectureTitle: string;
  onClose: () => void;
}

/**
 * One practice exercise, full screen over the lecture: coding needs the
 * room, on a phone too. Loaded only when a learner opens practice, so the
 * editor and runner never weigh on the lecture page.
 */
export default function PracticeView({
  assignmentId,
  lectureTitle,
  onClose,
}: PracticeViewProps) {
  const practice = useCodingPractice(assignmentId);

  // The page under the view must not scroll with it.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  let body;
  if (practice.isLoading) {
    body = (
      <div
        className="flex flex-1 items-center justify-center text-(--muted)"
        role="status"
        aria-label="Opening practice"
      >
        <LoadingSpinnerIcon size={26} />
      </div>
    );
  } else if (practice.error || !practice.data) {
    const error = getApiError(practice.error);
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="max-w-md text-sm text-(--text-secondary)">
          {error.status === 401
            ? "Sign in to practise."
            : error.status === 404
              ? "This practice is no longer available."
              : error.message}
        </p>
        <Button variant="quiet" elevation="flat" onClick={onClose}>
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          Back
        </Button>
      </div>
    );
  } else {
    body = (
      <CodingWorkspace
        // A new version (after "Reload") starts a fresh workspace.
        key={practice.data.exercise.versionId}
        lesson={practice.data}
        context={`Practice · ${lectureTitle}`}
        onPassed={() => {}}
        onReload={() => void practice.refetch()}
        fill
        onClose={onClose}
      />
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Practice: ${practice.data?.exercise.title ?? lectureTitle}`}
      className="fixed inset-0 z-[1200] flex flex-col bg-(--canvas) pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      {body}
    </div>,
    document.body,
  );
}
