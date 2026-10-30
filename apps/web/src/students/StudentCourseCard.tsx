import { useState } from "react";
import { ArrowCounterClockwiseIcon as ArrowCounterClockwise } from "@phosphor-icons/react/ArrowCounterClockwise";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { ArrowUUpLeftIcon as ArrowUUpLeft } from "@phosphor-icons/react/ArrowUUpLeft";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import type { StudentCourseDetail } from "@veolms/contracts";
import {
  CourseActionMenu,
  MenuAction,
  MenuDivider,
} from "../courses/CourseActionMenu";

import { ElevatedCard } from "../components/ElevatedCard";
const ACCESS_STATUS_LABEL: Record<
  Exclude<StudentCourseDetail["accessStatus"], "active">,
  string
> = {
  revoked: "Access revoked",
  suspended: "Access suspended",
  expired: "Access expired",
};

export interface StudentCourseCardProps {
  course: StudentCourseDetail;
  /** Revoking and restoring access: student.access.manage. */
  canManageAccess: boolean;
  /** Returning a payment: billing.manage. */
  canIssueRefunds: boolean;
  onOpenCourse: (course: StudentCourseDetail) => void;
  onRefund: (course: StudentCourseDetail) => void;
  onRevokeAccess: (course: StudentCourseDetail) => void;
  onRestoreAccess: (course: StudentCourseDetail) => void;
  setNotice?: (message: string) => void;
}

export function StudentCourseCard({
  course,
  canManageAccess,
  canIssueRefunds,
  onOpenCourse,
  onRefund,
  onRevokeAccess,
  onRestoreAccess,
  setNotice,
}: StudentCourseCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isCompleted = course.progressPercent >= 100;
  const hasAccess = course.accessStatus === "active";
  const canRefund = canIssueRefunds && course.refundable;
  const canRevoke = canManageAccess && hasAccess;
  const canRestore = canManageAccess && course.accessStatus === "revoked";

  const copyCourseLink = () => {
    const link = `${window.location.origin}/courses/${course.courseSlug}`;
    void navigator.clipboard.writeText(link);
    setNotice?.("Course link copied to clipboard.");
  };

  return (
    <ElevatedCard
      as="article"
      className="group p-4 sm:p-5 transition-all duration-200 "
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Thumbnail + Title + Meta */}
        <div className="flex items-start gap-3.5 sm:gap-4 min-w-0 flex-1">
          {course.courseThumbnailUrl ? (
            <img
              src={course.courseThumbnailUrl}
              alt={course.courseTitle}
              width={96}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-16 w-24 shrink-0 rounded-xl object-cover border border-(--border) shadow-xs"
            />
          ) : (
            <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl font-bold text-xs text-(--accent) bg-(--accent)/10 border border-(--border) shadow-xs">
              <BookOpen size={24} weight="duotone" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-base font-bold text-(--text) hover:text-(--accent) transition-colors cursor-pointer"
                onClick={() => onOpenCourse(course)}
              >
                {course.courseTitle}
              </h3>
              {course.difficulty && (
                <span className="rounded-md bg-(--surface-strong) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--muted) border border-(--border)">
                  {course.difficulty}
                </span>
              )}
              {course.accessStatus !== "active" && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/30 bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {ACCESS_STATUS_LABEL[course.accessStatus]}
                </span>
              )}
            </div>

            {course.courseDescription && (
              <p className="mt-1 line-clamp-1 text-xs text-(--muted)">
                {course.courseDescription}
              </p>
            )}

            <div className="mt-2.5 flex flex-wrap items-center gap-3 text-xs text-(--muted)">
              <span>
                Enrolled on{" "}
                {new Date(course.enrolledAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
              <span>•</span>
              <span>
                Source:{" "}
                <span className="capitalize">
                  {course.enrollmentSource.replace("_", " ")}
                </span>
              </span>
              {course.lastAccessedAt && (
                <>
                  <span>•</span>
                  <span>
                    Last active{" "}
                    {new Date(course.lastAccessedAt).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                      },
                    )}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Progress Meter & Actions Menu */}
        <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-(--border)/60">
          <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[11px] text-(--muted)">
                {course.completedLessonsCount} of {course.totalLessonsCount}{" "}
                lessons
              </span>
              <span
                className={`font-bold font-mono text-xs ${
                  isCompleted ? "text-emerald-500" : "text-(--accent)"
                }`}
              >
                {course.progressPercent}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-(--surface-strong) border border-(--border)/40">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(0, Math.min(100, course.progressPercent))}%`,
                  background: isCompleted
                    ? "var(--emerald-500, #10b981)"
                    : "var(--accent)",
                }}
              />
            </div>
          </div>

          <CourseActionMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            ariaLabel={`Actions for ${course.courseTitle}`}
            dismissOnScroll
            className="relative z-30 shrink-0"
          >
            <MenuAction
              Icon={ArrowSquareOut}
              label="View course"
              onClick={() => onOpenCourse(course)}
            />
            <MenuAction
              Icon={Copy}
              label="Copy course link"
              onClick={copyCourseLink}
              stayOpenMs={0}
            />

            {(canRefund || canRevoke || canRestore) && <MenuDivider />}

            {canRestore && (
              <MenuAction
                Icon={ArrowUUpLeft}
                label="Restore access"
                onClick={() => onRestoreAccess(course)}
              />
            )}
            {canRefund && (
              <MenuAction
                Icon={ArrowCounterClockwise}
                label="Issue refund"
                destructive
                onClick={() => onRefund(course)}
              />
            )}
            {canRevoke && (
              <MenuAction
                Icon={Prohibit}
                label="Revoke access"
                destructive
                onClick={() => onRevokeAccess(course)}
              />
            )}
          </CourseActionMenu>
        </div>
      </div>
    </ElevatedCard>
  );
}
