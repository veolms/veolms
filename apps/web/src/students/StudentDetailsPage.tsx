import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ClockIcon as Clock } from "@phosphor-icons/react/Clock";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GithubLogoIcon as GithubLogo } from "@phosphor-icons/react/GithubLogo";
import { GlobeIcon as Globe } from "@phosphor-icons/react/Globe";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import { LinkedinLogoIcon as LinkedinLogo } from "@phosphor-icons/react/LinkedinLogo";
import { PhoneIcon as Phone } from "@phosphor-icons/react/Phone";
import { TrendUpIcon as TrendUp } from "@phosphor-icons/react/TrendUp";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { StudentCourseDetail } from "@veolms/contracts";
import type { NavigateTo } from "../routing/navigation";
import { useStudent } from "../services/students";
import { StudentDetailsSkeleton } from "./StudentDetailsSkeleton";

export interface StudentDetailsPageProps {
  username?: string;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export function StudentDetailsPage({
  username,
  onNavigatePage,
  setNotice,
}: StudentDetailsPageProps) {
  const { data, isLoading, isError, refetch } = useStudent(username);

  const student = data?.student;
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
    if (student?.email && typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(student.email);
      setNotice?.(`Email ${student.email} copied to clipboard.`);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col font-sans" aria-labelledby="student-details-title">
      {/* Top back navigation bar */}
      <nav className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => onNavigatePage?.("/students")}
          className="group inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface) px-3.5 py-2 text-xs font-semibold text-(--text-secondary) transition-colors hover:border-(--border) hover:bg-(--hover) hover:text-(--text) md:text-sm"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <ArrowLeft
            size={16}
            weight="bold"
            className="text-(--muted) transition-transform group-hover:-translate-x-0.5 group-hover:text-(--text)"
          />
          <span>Back to Students</span>
        </button>
      </nav>

      {isLoading ? (
        <StudentDetailsSkeleton />
      ) : isError || !student ? (
        // Error or Not Found state
        <div
          className="flex flex-col items-center justify-center rounded-[18px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-10 text-center sm:p-12"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <WarningCircle size={40} className="mb-3 text-rose-400" />
          <h2 className="text-lg font-bold text-(--text)">Student Profile Not Found</h2>
          <p className="mt-1 max-w-sm text-xs text-(--muted) md:text-sm">
            Could not load learner profile for @{username}. The student might not exist or may have
            been removed.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={() => refetch()}
              className="cursor-pointer rounded-xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--card-surface) px-4 py-2 text-xs font-semibold text-(--text) hover:bg-(--hover)"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => onNavigatePage?.("/students")}
              className="cursor-pointer rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-md hover:opacity-90"
            >
              Back to Students List
            </button>
          </div>
        </div>
      ) : (
        // Loaded student details
        <div className="space-y-6">
          {/* Profile Card with Quiz-style Background Gradient */}
          <section
            className="relative overflow-hidden rounded-[14px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[linear-gradient(120deg,color-mix(in_srgb,var(--accent)_18%,var(--surface)),var(--surface)_55%,color-mix(in_srgb,var(--canvas)_80%,var(--surface)))] p-4 sm:rounded-[24px] sm:p-8"
            style={{ boxShadow: "var(--card-shadow)" }}
          >
            <div
              className="pointer-events-none absolute -top-24 right-0 size-72 rounded-full bg-(--accent)/10 blur-3xl"
              aria-hidden="true"
            />

            <div className="relative z-10 flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
              {/* Left Identity Details */}
              <div className="flex min-w-0 flex-1 flex-col items-start gap-4 sm:flex-row sm:gap-6">
                {student.avatarUrl ? (
                  <img
                    src={student.avatarUrl}
                    alt={student.displayName}
                    referrerPolicy="no-referrer"
                    className="h-20 w-20 shrink-0 rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] object-cover shadow-sm sm:h-24 sm:w-24"
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-(--accent)/15 text-2xl font-black tracking-tight text-(--accent) shadow-sm sm:h-24 sm:w-24 sm:text-3xl"
                    aria-hidden="true"
                  >
                    {initials}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1
                      id="student-details-title"
                      className="text-2xl leading-tight font-bold tracking-tight text-(--text) sm:text-3xl"
                    >
                      {student.displayName}
                    </h1>
                    <span className="inline-flex items-center rounded-full border border-(--accent)/20 bg-(--accent)/12 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-(--accent) uppercase">
                      Learner
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                        (metrics?.enrolledCoursesCount ?? 0) > 0
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                          : "border-zinc-500/20 bg-zinc-500/10 text-(--muted)"
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
                        {(metrics?.enrolledCoursesCount ?? 0) > 0 ? "Active Learner" : "Inactive"}
                      </span>
                    </span>
                  </div>

                  <p className="mt-1 font-mono text-xs font-medium text-(--muted) sm:text-sm">
                    @{student.username}
                  </p>

                  {student.bio ? (
                    <p className="mt-3 max-w-2xl text-xs leading-relaxed text-(--text-secondary) sm:text-sm">
                      {student.bio}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-(--muted) italic">No bio provided.</p>
                  )}

                  {/* Metadata Badges: Joined, Email, Phone */}
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs sm:gap-3">
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted)">
                      <CalendarBlank size={14} className="shrink-0 text-(--accent)" />
                      <span>
                        Joined{" "}
                        {new Date(student.joinedAt).toLocaleDateString(undefined, {
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>

                    {student.email && (
                      <button
                        type="button"
                        onClick={handleCopyEmail}
                        className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--text-secondary) transition-colors hover:border-(--accent) hover:text-(--accent)"
                        title="Click to copy email"
                      >
                        <EnvelopeSimple size={14} className="shrink-0 text-(--muted)" />
                        <span className="font-mono text-[11.5px]">{student.email}</span>
                      </button>
                    )}

                    {student.phoneNo && (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted)">
                        <Phone size={14} className="shrink-0" />
                        <span className="font-mono text-[11.5px]">{student.phoneNo}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Social links */}
              <div className="flex shrink-0 items-center gap-2 pt-2 sm:self-start sm:pt-0">
                {student.socials?.githubUrl && (
                  <a
                    href={student.socials.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
                    title="GitHub Profile"
                  >
                    <GithubLogo size={18} weight="duotone" />
                  </a>
                )}
                {student.socials?.linkedinUrl && (
                  <a
                    href={student.socials.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
                    title="LinkedIn Profile"
                  >
                    <LinkedinLogo size={18} weight="duotone" />
                  </a>
                )}
                {student.socials?.websiteUrl && (
                  <a
                    href={student.socials.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) transition-colors hover:border-(--accent) hover:text-(--accent)"
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
            className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-5"
          >
            {/* Card 1: Enrolled */}
            <div
              className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-4.5"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
                  Enrolled
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                  <GraduationCap size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
                {metrics?.enrolledCoursesCount ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">Total courses</p>
            </div>

            {/* Card 2: Completed */}
            <div
              className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-4.5"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
                  Completed
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-500">
                  <CheckCircle size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
                {metrics?.completedCoursesCount ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">Finished courses</p>
            </div>

            {/* Card 3: In Progress */}
            <div
              className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-4.5"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
                  In Progress
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-500">
                  <Clock size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
                {metrics?.inProgressCoursesCount ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">Active progress</p>
            </div>

            {/* Card 4: Lessons Done */}
            <div
              className="rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:rounded-[16px] sm:p-4.5"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
                  Lessons Done
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                  <BookOpen size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
                {metrics?.totalLessonsCompleted ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">Total completed</p>
            </div>

            {/* Card 5: Avg Progress */}
            <div
              className="col-span-2 rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:col-span-1 sm:rounded-[16px] sm:p-4.5"
              style={{ boxShadow: "var(--card-shadow)" }}
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-[0.7rem] font-semibold tracking-wide text-(--muted) sm:text-xs">
                  Avg Progress
                </p>
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/12 text-(--accent)">
                  <TrendUp size={16} weight="duotone" />
                </span>
              </div>
              <p className="mt-2 text-xl font-bold tracking-tight text-(--text) sm:text-2xl">
                {metrics?.averageProgressPercent ?? 0}%
              </p>
              <p className="mt-0.5 text-[11px] text-(--muted)">Overall learning rate</p>
            </div>
          </section>

          {/* Enrolled courses list */}
          <section aria-labelledby="enrolled-courses-heading">
            <div className="mb-4 flex items-center justify-between">
              <h2
                id="enrolled-courses-heading"
                className="text-lg font-bold tracking-tight text-(--text) sm:text-xl"
              >
                Enrolled Courses ({courses.length})
              </h2>
            </div>

            {courses.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {courses.map((course) => (
                  <CourseProgressCard
                    key={course.courseId}
                    course={course}
                    onNavigatePage={onNavigatePage}
                  />
                ))}
              </div>
            ) : (
              /* Clean Empty State Card */
              <div
                className="flex flex-col items-center justify-center rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-8 text-center sm:p-10"
                style={{ boxShadow: "var(--card-shadow)" }}
              >
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-(--accent)/12 text-(--accent)">
                  <GraduationCap size={26} weight="duotone" />
                </div>

                <h3 className="text-base font-bold text-(--text)">No courses enrolled yet</h3>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-(--muted) md:text-sm">
                  This student has registered an account but has not yet enrolled in any academy
                  courses.
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface CourseProgressCardProps {
  course: StudentCourseDetail;
  onNavigatePage?: NavigateTo;
}

function CourseProgressCard({ course, onNavigatePage }: CourseProgressCardProps) {
  const isCompleted = course.progressPercent >= 100;

  const handleOpenCourse = () => {
    onNavigatePage?.(`/courses/${course.courseSlug}`);
  };

  return (
    <article
      className="group rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-4 transition-all duration-200 hover:shadow-(--card-hover-shadow) sm:p-5"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        {/* Left: Thumbnail + Title + Meta */}
        <div className="flex min-w-0 flex-1 items-start gap-3.5 sm:gap-4">
          {course.courseThumbnailUrl ? (
            <img
              src={course.courseThumbnailUrl}
              alt={course.courseTitle}
              width={96}
              height={64}
              loading="lazy"
              decoding="async"
              className="h-16 w-24 shrink-0 rounded-xl border border-(--border) object-cover shadow-xs"
            />
          ) : (
            <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl border border-(--border) bg-(--accent)/10 text-xs font-bold text-(--accent) shadow-xs">
              <BookOpen size={24} weight="duotone" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="cursor-pointer text-base font-bold text-(--text) transition-colors hover:text-(--accent)"
                onClick={handleOpenCourse}
              >
                {course.courseTitle}
              </h3>
              {course.difficulty && (
                <span className="rounded-md border border-(--border) bg-(--surface-strong) px-2 py-0.5 text-[10px] font-bold tracking-wider text-(--muted) uppercase">
                  {course.difficulty}
                </span>
              )}
            </div>

            {course.courseDescription && (
              <p className="mt-1 line-clamp-1 text-xs text-(--muted)">{course.courseDescription}</p>
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
                <span className="capitalize">{course.enrollmentSource.replace("_", " ")}</span>
              </span>
              {course.lastAccessedAt && (
                <>
                  <span>•</span>
                  <span>
                    Last active{" "}
                    {new Date(course.lastAccessedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right: Progress Meter & Action Button */}
        <div className="flex shrink-0 flex-col items-start gap-4 border-t border-(--border)/60 pt-2 sm:flex-row sm:items-center md:border-t-0 md:pt-0">
          <div className="w-full sm:w-44">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-[11px] text-(--muted)">
                {course.completedLessonsCount} of {course.totalLessonsCount} lessons
              </span>
              <span
                className={`font-mono text-xs font-bold ${
                  isCompleted ? "text-emerald-500" : "text-(--accent)"
                }`}
              >
                {course.progressPercent}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full border border-(--border)/40 bg-(--surface-strong)">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(0, Math.min(100, course.progressPercent))}%`,
                  background: isCompleted ? "var(--emerald-500, #10b981)" : "var(--accent)",
                }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenCourse}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface) px-3.5 py-2 text-xs font-semibold whitespace-nowrap text-(--text-secondary) shadow-xs transition-all hover:border-(--accent) hover:bg-(--hover) hover:text-(--accent)"
          >
            <span>View Course</span>
            <ArrowSquareOut size={14} weight="bold" />
          </button>
        </div>
      </div>
    </article>
  );
}
