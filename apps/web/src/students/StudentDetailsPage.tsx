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
          <ArrowLeft size={16} weight="bold" className="transition-transform group-hover:-translate-x-0.5 text-(--muted) group-hover:text-(--text)" />
          <span>Back to Students</span>
        </button>
      </nav>

      {isLoading ? (
        // Loading skeleton
        <div className="space-y-6">
          <div className="h-48 rounded-[14px] sm:rounded-[24px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-6 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-4 animate-pulse"
              />
            ))}
          </div>
          <div className="h-64 rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-6 animate-pulse" />
        </div>
      ) : isError || !student ? (
        // Error or Not Found state
        <div
          className="flex flex-col items-center justify-center rounded-[18px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface) p-10 sm:p-12 text-center"
          style={{ boxShadow: "var(--card-shadow)" }}
        >
          <WarningCircle size={40} className="text-rose-400 mb-3" />
          <h2 className="text-lg font-bold text-(--text)">
            Student Profile Not Found
          </h2>
          <p className="mt-1 max-w-sm text-xs md:text-sm text-(--muted)">
            Could not load learner profile for @{username}. The student might not exist or may have been removed.
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
        </div>
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
                      className="text-2xl sm:text-3xl font-[800] text-(--text) tracking-tight leading-tight"
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
                    <div
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted)"
                    >
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
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--text-secondary) hover:text-(--accent) hover:border-(--accent) transition-colors cursor-pointer"
                        title="Click to copy email"
                      >
                        <EnvelopeSimple size={14} className="shrink-0 text-(--muted)" />
                        <span className="font-mono text-[11.5px]">{student.email}</span>
                      </button>
                    )}

                    {student.phoneNo && (
                      <div
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-2.5 py-1 font-medium text-(--muted)"
                      >
                        <Phone size={14} className="shrink-0" />
                        <span className="font-mono text-[11.5px]">{student.phoneNo}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Social links */}
              <div className="flex items-center gap-2 sm:self-start shrink-0 pt-2 sm:pt-0">
                {student.socials?.githubUrl && (
                  <a
                    href={student.socials.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) hover:text-(--accent) hover:border-(--accent) transition-colors"
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
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-[color-mix(in_srgb,var(--surface)_75%,transparent)] text-(--muted) hover:text-(--accent) hover:border-(--accent) transition-colors"
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
            <div
              className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-4.5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
              style={{ boxShadow: "var(--card-shadow)" }}
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
            </div>

            {/* Card 2: Completed */}
            <div
              className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-4.5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
              style={{ boxShadow: "var(--card-shadow)" }}
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
              <p className="mt-0.5 text-[11px] text-(--muted)">Finished courses</p>
            </div>

            {/* Card 3: In Progress */}
            <div
              className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-4.5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
              style={{ boxShadow: "var(--card-shadow)" }}
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
              <p className="mt-0.5 text-[11px] text-(--muted)">Active progress</p>
            </div>

            {/* Card 4: Lessons Done */}
            <div
              className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-4.5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
              style={{ boxShadow: "var(--card-shadow)" }}
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
              <p className="mt-0.5 text-[11px] text-(--muted)">Total completed</p>
            </div>

            {/* Card 5: Avg Progress */}
            <div
              className="rounded-[12px] sm:rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-3 sm:p-4.5 col-span-2 sm:col-span-1 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
              style={{ boxShadow: "var(--card-shadow)" }}
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
              <p className="mt-0.5 text-[11px] text-(--muted)">Overall learning rate</p>
            </div>
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
                className="flex flex-col items-center justify-center rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-8 sm:p-10 text-center"
                style={{ boxShadow: "var(--card-shadow)" }}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--accent)/12 text-(--accent) mb-3">
                  <GraduationCap size={26} weight="duotone" />
                </div>

                <h3 className="text-base font-bold text-(--text)">
                  No courses enrolled yet
                </h3>
                <p className="mt-1 text-xs md:text-sm text-(--muted) max-w-sm leading-relaxed">
                  This student has registered an account but has not yet enrolled in any academy courses.
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

function CourseProgressCard({
  course,
  onNavigatePage,
}: CourseProgressCardProps) {
  const isCompleted = course.progressPercent >= 100;

  const handleOpenCourse = () => {
    onNavigatePage?.(`/courses/${course.courseSlug}`);
  };

  return (
    <article
      className="group rounded-[16px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) p-4 sm:p-5 transition-all duration-200 hover:shadow-(--card-hover-shadow)"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Thumbnail + Title + Meta */}
        <div className="flex items-start gap-3.5 sm:gap-4 min-w-0 flex-1">
          {course.courseThumbnailUrl ? (
            <img
              src={course.courseThumbnailUrl}
              alt={course.courseTitle}
              className="h-16 w-24 shrink-0 rounded-xl object-cover border border-(--border) shadow-xs"
            />
          ) : (
            <div
              className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl font-bold text-xs text-(--accent) bg-(--accent)/10 border border-(--border) shadow-xs"
            >
              <BookOpen size={24} weight="duotone" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3
                className="text-base font-bold text-(--text) hover:text-(--accent) transition-colors cursor-pointer"
                onClick={handleOpenCourse}
              >
                {course.courseTitle}
              </h3>
              {course.difficulty && (
                <span className="rounded-md bg-(--surface-strong) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-(--muted) border border-(--border)">
                  {course.difficulty}
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
                Source: <span className="capitalize">{course.enrollmentSource.replace("_", " ")}</span>
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
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-(--border)/60">
          <div className="w-full sm:w-44">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[11px] text-(--muted)">
                {course.completedLessonsCount} of {course.totalLessonsCount} lessons
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

          <button
            type="button"
            onClick={handleOpenCourse}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[color-mix(in_srgb,var(--text)_10%,transparent)] bg-(--card-surface) px-3.5 py-2 text-xs font-semibold text-(--text-secondary) hover:bg-(--hover) hover:text-(--accent) hover:border-(--accent) transition-all cursor-pointer whitespace-nowrap shadow-xs"
          >
            <span>View Course</span>
            <ArrowSquareOut size={14} weight="bold" />
          </button>
        </div>
      </div>
    </article>
  );
}

