import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { useUnenrollFromCourse } from "../services/enrollments";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";
import type { Course } from "./catalogue";

/**
 * Asks before a learner leaves a free course, then removes the enrollment.
 * Loaded only once a learner picks "Unenroll" from a course card.
 */
export function UnenrollCourseModal({
  course,
  onClose,
  setNotice,
}: {
  course: Course;
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
      title="Unenroll from this course?"
      description={`You will lose access to “${course.title}”. Your progress is kept, and you can enroll again for free at any time.`}
      cancelLabel="Stay enrolled"
      confirmLabel="Unenroll"
      pendingLabel="Unenrolling…"
    />
  );
}
