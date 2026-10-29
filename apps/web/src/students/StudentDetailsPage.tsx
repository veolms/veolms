import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { ChartLineUpIcon as ChartLineUp } from "@phosphor-icons/react/ChartLineUp";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GithubLogoIcon as GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { LinkedinLogoIcon as LinkedinLogo } from "@phosphor-icons/react/LinkedinLogo";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PhoneIcon as Phone } from "@phosphor-icons/react/Phone";
import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/TrendUp";
import { UserPlusIcon as UserPlus } from "@phosphor-icons/react/UserPlus";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import { lazy, Suspense, useState } from "react";
import type { AdminOrder, StudentCourseDetail } from "@veolms/contracts";
import { safeExternalUrl } from "../lib/external-url";
import { OrderRefundModal } from "../orders/OrderRefundModal";
import type { NavigateTo } from "../routing/navigation";
import { useFetchOrder } from "../services/orders";
import { useStudent } from "../services/students";
import { useCapabilities } from "../services/authorization";
import {
  StudentCourseAccessModal,
  type StudentCourseAccessChange,
} from "./StudentCourseAccessModal";
import { StudentCourseCard } from "./StudentCourseCard";
import { StudentDetailsSkeleton } from "./StudentDetailsSkeleton";
import { ElevatedCard } from "../components/ElevatedCard";

export interface StudentDetailsPageProps {
  username?: string;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

// Only staff who may edit contact details open it, and it carries the
// contact form's validation.
const StudentContactModal = lazy(() =>
  import("./StudentContactModal").then((module) => ({
    default: module.StudentContactModal,
  })),
);

// Only staff who may manage course access open it.
const GrantCoursePanel = lazy(() =>
  import("./GrantCoursePanel").then((module) => ({
    default: module.GrantCoursePanel,
  })),
);

// The Team page's add-member panel, opened with this student chosen.
const AddMemberPanel = lazy(() =>
  import("../team/members/AddMemberPanel").then((module) => ({
    default: module.AddMemberPanel,
  })),
);

export function StudentDetailsPage({
  username,
  onNavigatePage,
  setNotice,
}: StudentDetailsPageProps) {
  const { data, isLoading, isError, refetch } = useStudent(username);
  // A learner's day-by-day progress is theirs to share; staff who see every
  // student (student.read for every course, as an admin has) can open it
  // either way. Anyone else here would only be told it is private.
  const { can, canOnCourse } = useCapabilities();
  const canOpenProgress = canOnCourse("student.read", null);
  const canEditContact = can("student.contact.update");
  const canManageAccess = can("student.access.manage");
  const canIssueRefunds = can("billing.manage");
  const canAssignRoles = can("role.assign");
  const [makingTeamMember, setMakingTeamMember] = useState(false);

  // The refund dialog is the one the Orders screen uses, so it needs the
  // whole order; it is read when "Issue refund" is picked on a course.
  const fetchOrder = useFetchOrder();
  const [refundOrder, setRefundOrder] = useState<AdminOrder | null>(null);
  const [accessChange, setAccessChange] =
    useState<StudentCourseAccessChange | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [grantingCourses, setGrantingCourses] = useState(false);

  const openCourse = (course: StudentCourseDetail) =>
    onNavigatePage?.(`/courses/${course.courseSlug}`);

  const startRefund = (course: StudentCourseDetail) => {
    if (!course.orderId) return;
    fetchOrder(course.orderId, "admin").then(
      (order) => {
        if (!("admin" in order)) return;
        if (order.status === "refunded") {
          setNotice?.(`Order ${order.orderNumber} is already refunded.`);
          return;
        }
        setRefundOrder(order);
      },
      () =>
        setNotice?.(
          "The order for this course could not be opened. Please try again.",
        ),
    );
  };

  const student = data?.student;
  const githubUrl = safeExternalUrl(student?.socials?.githubUrl);
  const linkedinUrl = safeExternalUrl(student?.socials?.linkedinUrl);
  const websiteUrl = safeExternalUrl(student?.socials?.websiteUrl);
  const metrics = data?.metrics;
  const courses = data?.courses ?? [];

  const initials = (student?.displayName || student?.username || "S")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleCopyEmail = () => {
    if (
      student?.email &&
      typeof navigator !== "undefined" &&
      navigator.clipboard
    ) {
      void navigator.clipboard.writeText(student.email);
      setNotice?.(`Email ${student.email} copied to clipboard.`);
    }
  };

  return (
    <div
      className="w-full min-w-0 flex flex-col font-sans"
      aria-labelledby="student-details-title"
    >
      {/* Top back navigation bar */}
      <nav className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigatePage?.("/students")}
          className="group inline-flex items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface) px-3.5 py-2 text-xs md:text-sm font-semibold text-(--text-secondary) hover:border-(--border) hover:bg-(--hover) hover:text-(--text) transition-colors cursor-pointer"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <ArrowLeft
            size={16}
            weight="bold"
            className="transition-transform group-hover:-translate-x-0.5 text-(--muted) group-hover:text-(--text)"
          />
          <span>Back to Students</span>
        </button>
      </nav>

      {isLoading ? (
        <StudentDetailsSkeleton />
      ) : isError || !student ? (
        // Error or Not Found state
        <ElevatedCard
          as="div"
          className="flex flex-col items-center justify-center p-10 sm:p-12 text-center"
        >
          <WarningCircle size={40} className="text-rose-400 mb-3" />
          <h2 className="text-lg font-bold text-(--text)">
            Student Profile Not Found
          </h2>
          <p className="mt-1 max-w-sm text-xs md:text-sm text-(--muted)">
            Could not load learner profile for @{username}. The student might
            not exist or may have been removed.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface) px-4 py-2 text-xs font-semibold text-(--text) hover:bg-(--hover) cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => onNavigatePage?.("/students")}
              className="rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-md hover:opacity-90 cursor-pointer"
            >
              Back to Students List
            </button>
          </div>
        </ElevatedCard>
      ) : (
        // Loaded student details
        <div className="space-y-6">
          {/* Profile Card with Quiz-style Background Gradient */}
          <section
            className="relative overflow-hidden rounded-[14px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_18%,var(--surface)),var(--surface)_55%,color-mix(in_srgb,var(--canvas)_80%,var(--surface)))] p-4 sm:p-8"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div
              className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-(--accent)/10 blur-3xl"
              aria-hidden="true"
            />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
              {/* Left Identity Details */}
              <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 min-w-0 flex-1">
                {student.avatarUrl ? (
                  <img
                    src={student.avatarUrl}
                    alt={student.displayName}
                    referrerPolicy="no-referrer"
                    className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-2xl object-cover border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-sm"
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-2xl font-black text-2xl sm:text-3xl tracking-tight text-(--accent) bg-(--accent)/15 border border-[color-mix(in_srgb,var(--text)_12%,transparent)] shadow-sm"
                    aria-hidden="true"
                  >
                    {initials}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1
                      id="student-details-title"
                      className="text-2xl sm:text-3xl font-bold text-(--text) tracking-tight leading-tight"
                    >
                      {student.displayName}
                    </h1>
                    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold text-(--accent) bg-(--accent)/12 border border-(--accent)/20 uppercase tracking-wider">
                      Learner
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                        (metrics?.enrolledCoursesCount ?? 0) > 0
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : "bg-zinc-500/10 text-(--muted) border-zinc-500/20"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          (metrics?.enrolledCoursesCount ?? 0) > 0
                            ? "bg-emerald-500"
                            : "bg-zinc-400"
                        }`}
                      />
                      <span>
                        {(metrics?.enrolledCoursesCount ?? 0) > 0
                          ? "Active Learner"
                          : "Inactive"}
                      </span>
                    </span>
                  </div>

                  <p className="text-xs sm:text-sm text-(--muted) font-mono mt-1 font-medium">
                    @{student.username}
                  </p>

                  {student.bio ? (
                    <p className="mt-3 text-xs sm:text-sm text-(--text-secondary) leading-relaxed max-w-2xl">
                      {student.bio}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-(--muted) italic">
                      No bio provided.
                    </p>
                  )}

                  {/* Metadata Badges: Joined, Email, Phone */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted)">
                      <CalendarBlank
                        size={14}
                        className="shrink-0 text-(--accent)"
                      />
                      <span>
                        Joined{" "}
                        {new Date(student.joinedAt).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </span>
                    </div>

                    {student.email && (
                      <button
                        type="button"
                        onClick={handleCopyEmail}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--text-secondary) hover:text-(--accent) hover:border-(--accent) transition-colors cursor-pointer"
                        title="Click to copy email"
                      >
                        <EnvelopeSimple
                          size={14}
                          className="shrink-0 text-(--muted)"
                        />
                        <span className="font-mono text-[11.5px]">
                          {student.email}
                        </span>
                      </button>
                    )}

                    {student.phoneNo && (
                      <a
                        href={`tel:${student.phoneNo.replace(/[^\d+]/g, "")}`}
                        title="Call this number"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
                      >
                        <Phone size={14} className="shrink-0" />
                        <span className="font-mono text-[11.5px]">
                          {student.phoneNo}
                        </span>
                      </a>
                    )}

                    {canEditContact ? (
                      <button
                        type="button"
                        onClick={() => setEditingContact(true)}
                        aria-haspopup="dialog"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
                      >
                        <PencilSimple size={14} className="shrink-0" />
                        <span>Edit contact</span>
                      </button>
                    ) : null}

                    {canAssignRoles && student.email ? (
                      <button
                        type="button"
                        onClick={() => setMakingTeamMember(true)}
                        aria-haspopup="dialog"
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
                      >
                        <UserPlus size={14} className="shrink-0" />
                        <span>Make team member</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Right: Progress, and social links */}
              <div className="flex items-center gap-2 sm:self-start shrink-0 pt-2 sm:pt-0">
                {canOpenProgress ? (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigatePage?.(
                        `/progress/${encodeURIComponent(student.username)}`,
                      )
                    }
                    className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] px-3 text-xs font-semibold text-(--text) transition-colors hover:border-(--accent) hover:text-(--accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
                  >
                    <ChartLineUp size={16} weight="bold" aria-hidden="true" />
                    View progress
                  </button>
                ) : null}
                {githubUrl && (
                  <a
                    href={githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) hover:text-(--accent) hover:border-(--accent) transition-colors"
                    title="GitHub Profile"
                  >
                    <GithubLogo size={18} weight="duotone" />
                  </a>
                )}
                {linkedinUrl && (
                  <a
                    href={linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) hover:text-(--accent) hover:border-(--accent) transition-colors"
                    title="LinkedIn Profile"
                  >
                    <LinkedinLogo size={18} weight="duotone" />
                  </a>
                )}
                {websiteUrl && (
                  <a
                    href={websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) hover:text-(--accent) hover:border-(--accent) transition-colors"
                    title="Personal Website"
                  >
                    <Globe size={18} weight="duotone" />
                  </a>
                )}
              </div>
            </div>
          </section>

          {/* Student Overview Metrics */}
          <section
            aria-label="Student Learning Overview"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5"
          >
            {/* Card 1: Enrolled */}
            <ElevatedCard
              as="div"
              className="p-3 sm:p-4.5 transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
                  Enrolled
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                  <GraduationCap size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
                {metrics?.enrolledCoursesCount ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">Total courses</p>
            </ElevatedCard>

            {/* Card 2: Completed */}
            <ElevatedCard
              as="div"
              className="p-3 sm:p-4.5 transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
                  Completed
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500">
                  <CheckCircle size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
                {metrics?.completedCoursesCount ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">
                Finished courses
              </p>
            </ElevatedCard>

            {/* Card 3: In Progress */}
            <ElevatedCard
              as="div"
              className="p-3 sm:p-4.5 transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
                  In Progress
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500">
                  <Clock size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
                {metrics?.inProgressCoursesCount ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">
                Active progress
              </p>
            </ElevatedCard>

            {/* Card 4: Lessons Done */}
            <ElevatedCard
              as="div"
              className="p-3 sm:p-4.5 transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
                  Lessons Done
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                  <BookOpen size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
                {metrics?.totalLessonsCompleted ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">
                Total completed
              </p>
            </ElevatedCard>

            {/* Card 5: Avg Progress */}
            <ElevatedCard
              as="div"
              className="p-3 sm:p-4.5 col-span-2 sm:col-span-1 transition-all duration-200"
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="text-[0.7rem] sm:text-xs font-semibold text-(--muted) tracking-wide truncate">
                  Avg Progress
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                  <TrendUp size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-(--text)">
                {metrics?.averageProgressPercent ?? 0}%
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">
                Overall learning rate
              </p>
            </ElevatedCard>
          </section>

          {/* Enrolled courses list */}
          <section aria-labelledby="enrolled-courses-heading">
            <div className="flex items-center justify-between mb-4">
              <h2
                id="enrolled-courses-heading"
                className="text-lg sm:text-xl font-bold text-(--text) tracking-tight"
              >
                Enrolled Courses ({courses.length})
              </h2>
              {canManageAccess && courses.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setGrantingCourses(true)}
                  aria-haspopup="dialog"
                  className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-(--accent)/12 px-3.5 text-sm font-semibold text-(--accent) transition-colors hover:bg-(--accent)/20"
                >
                  <Plus size={16} weight="bold" className="shrink-0" />
                  <span>Grant course</span>
                </button>
              ) : null}
            </div>

            {courses.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {courses.map((course) => (
                  <StudentCourseCard
                    key={course.courseId}
                    course={course}
                    canManageAccess={canManageAccess}
                    canIssueRefunds={canIssueRefunds}
                    onOpenCourse={openCourse}
                    onRefund={startRefund}
                    onRevokeAccess={(target) =>
                      setAccessChange({ action: "revoke", course: target })
                    }
                    onRestoreAccess={(target) =>
                      setAccessChange({ action: "restore", course: target })
                    }
                    setNotice={setNotice}
                  />
                ))}
              </div>
            ) : (
              /* Clean Empty State Card */
              <ElevatedCard
                as="div"
                className="flex flex-col items-center justify-center p-8 sm:p-10 text-center"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--accent)/12 text-(--accent) mb-3">
                  <GraduationCap size={26} weight="duotone" />
                </div>

                <h3 className="text-base font-bold text-(--text)">
                  No courses enrolled yet
                </h3>
                <p className="mt-1 text-xs md:text-sm text-(--muted) max-w-sm leading-relaxed">
                  This student has an account but is not enrolled in any academy
                  course yet.
                </p>
                {canManageAccess ? (
                  <button
                    type="button"
                    onClick={() => setGrantingCourses(true)}
                    aria-haspopup="dialog"
                    className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-xl bg-(--accent) px-4 text-sm font-semibold text-white transition-[filter] hover:brightness-110"
                  >
                    <Plus size={16} weight="bold" className="shrink-0" />
                    <span>Grant course</span>
                  </button>
                ) : null}
              </ElevatedCard>
            )}
          </section>
        </div>
      )}

      {/* Keyed per opening so one order's amount, reason and "preserve
          access" tick never carry over to the next. */}
      <OrderRefundModal
        key={refundOrder?.id ?? "closed"}
        order={refundOrder}
        onClose={() => setRefundOrder(null)}
        setNotice={setNotice}
      />

      {accessChange && student ? (
        <StudentCourseAccessModal
          change={accessChange}
          studentId={student.id}
          studentName={student.displayName || `@${student.username}`}
          onClose={() => setAccessChange(null)}
          setNotice={setNotice}
        />
      ) : null}

      {editingContact && student ? (
        <Suspense fallback={null}>
          <StudentContactModal
            username={student.username}
            studentName={student.displayName || `@${student.username}`}
            email={student.email ?? null}
            phoneNo={student.phoneNo ?? null}
            onClose={() => setEditingContact(false)}
            setNotice={setNotice}
          />
        </Suspense>
      ) : null}

      {grantingCourses && student ? (
        <Suspense fallback={null}>
          <GrantCoursePanel
            userId={student.id}
            studentName={student.displayName || `@${student.username}`}
            // Lost access comes back with Restore on its card; only an
            // expired course is offered again.
            heldCourseIds={courses
              .filter((course) => course.accessStatus !== "expired")
              .map((course) => course.courseId)}
            onClose={() => setGrantingCourses(false)}
            onGranted={(count) => {
              setGrantingCourses(false);
              setNotice?.(
                `${student.displayName || `@${student.username}`} can open ${count === 1 ? "the course" : `${count} courses`} now.`,
              );
            }}
          />
        </Suspense>
      ) : null}

      {makingTeamMember && student?.email ? (
        <Suspense fallback={null}>
          <AddMemberPanel
            initialUser={{
              userId: student.id,
              name: student.displayName,
              username: student.username,
              email: student.email,
              avatarUrl: student.avatarUrl ?? null,
              isMember: false,
              roles: [],
            }}
            onClose={() => setMakingTeamMember(false)}
            setNotice={(notice) =>
              setNotice?.(typeof notice === "string" ? notice : notice.message)
            }
          />
        </Suspense>
      ) : null}
    </div>
  );
}
