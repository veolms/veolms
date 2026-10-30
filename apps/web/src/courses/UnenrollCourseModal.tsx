import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { useUnenrollFromCourse } from "../services/enrollments";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";

/**
 * Asks before a learner leaves a course, then removes the enrollment.
 * Loaded only once "Unenroll" is picked from a course card.
 *
 * A learner leaves a free course and keeps their progress. An admin (trying
 * the academy in Student view) can leave any course, and their progress in
 * it is cleared: `resetsProgress` makes the question say so.
 */
export function UnenrollCourseModal({
  course,
  resetsProgress = false,
  onClose,
  setNotice,
}: {
  course: { id: string; title: string };
  resetsProgress?: boolean;
  onClose: () => void;
  setNotice: (notice: string) => void;
}) {
  const unenroll = useUnenrollFromCourse();

  const confirm = () => {
    unenroll.mutate(course.id, {
      onSuccess: () => setNotice(`You have unenrolled from “${course.title}”.`),
      onError: (error) =>
        setNotice(
          error.message ||
            `Could not unenroll from “${course.title}”. Please try again.`,
        ),
      onSettled: onClose,
    });
  };

  return (
    <ConfirmActionModal
      id="unenroll-course-modal"
      isOpen
      isPending={unenroll.isPending}
      onClose={onClose}
      onConfirm={confirm}
      icon={SignOut}
      iconWeight="regular"
      tone="danger"
      title={
        resetsProgress
          ? "Are you sure you want to unenroll?"
          : "Unenroll from this course?"
      }
      description={
        resetsProgress
          ? `You will be unenrolled from “${course.title}”. This will reset all your progress in this course.`
          : `You will lose access to “${course.title}”. Your progress is kept, and you can enroll again for free at any time.`
      }
      // Staying is the safe choice, so it is the highlighted button and
      // comes last; "Unenroll" is the quiet one before it.
      emphasis="cancel"
      cancelLabel="Stay enrolled"
      confirmLabel="Unenroll"
      pendingLabel="Unenrolling…"
    />
  );
}
