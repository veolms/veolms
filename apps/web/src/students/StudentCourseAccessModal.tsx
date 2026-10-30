import { ArrowUUpLeftIcon as ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import type { StudentCourseDetail } from "@veolms/contracts";
import { useChangeCourseAccess } from "../services/access";
import { ConfirmActionModal } from "../shell/ConfirmActionModal";

export interface StudentCourseAccessChange {
  action: "revoke" | "restore";
  course: StudentCourseDetail;
}

/**
 * Asks before an admin takes a learner's access to a course away, or gives
 * revoked access back, then does it. Mounted only while one is being asked.
 */
export function StudentCourseAccessModal({
  change,
  studentId,
  studentName,
  onClose,
  setNotice,
}: {
  change: StudentCourseAccessChange;
  studentId: string;
  studentName: string;
  onClose: () => void;
  setNotice?: (message: string) => void;
}) {
  const { action, course } = change;
  const isRevoke = action === "revoke";
  const changeAccess = useChangeCourseAccess(action);

  const confirm = () => {
    changeAccess.mutate(
      { userId: studentId, courseId: course.courseId },
      {
        onSuccess: () =>
          setNotice?.(
            isRevoke
              ? `${studentName} no longer has access to “${course.courseTitle}”.`
              : `${studentName} has access to “${course.courseTitle}” again.`,
          ),
        onError: (error) =>
          setNotice?.(
            error.message ||
              (isRevoke
                ? "Could not revoke access. Please try again."
                : "Could not restore access. Please try again."),
          ),
        onSettled: onClose,
      },
    );
  };

  if (!isRevoke) {
    return (
      <ConfirmActionModal
        id="restore-course-access-modal"
        isOpen
        isPending={changeAccess.isPending}
        onClose={onClose}
        onConfirm={confirm}
        icon={ArrowUUpLeft}
        iconWeight="regular"
        title="Restore access to this course?"
        description={`${studentName} will be able to open “${course.courseTitle}” again, with the progress they had. No payment is taken.`}
        cancelLabel="Cancel"
        confirmLabel="Restore access"
        pendingLabel="Restoring…"
      />
    );
  }

  return (
    <ConfirmActionModal
      id="revoke-course-access-modal"
      isOpen
      isPending={changeAccess.isPending}
      onClose={onClose}
      onConfirm={confirm}
      icon={Prohibit}
      iconWeight="regular"
      tone="danger"
      title="Revoke access to this course?"
      description={
        course.refundable
          ? `${studentName} will lose access to “${course.courseTitle}” straight away. Their progress is kept and no money is returned; to return the payment, use Issue refund instead.`
          : `${studentName} will lose access to “${course.courseTitle}” straight away. Their progress is kept, and you can restore access later.`
      }
      cancelLabel="Keep access"
      confirmLabel="Revoke access"
      pendingLabel="Revoking…"
    />
  );
}
