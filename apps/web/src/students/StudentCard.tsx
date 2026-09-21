import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CalendarBlankIcon as CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import { GraduationCapIcon as GraduationCap } from "@phosphor-icons/react/GraduationCap";
import type { StudentSummary } from "@veolms/contracts";
import type { NavigateTo } from "../routing/navigation";

export interface StudentCardProps {
  student: StudentSummary;
  onNavigatePage?: NavigateTo;
}

export function StudentCard({ student, onNavigatePage }: StudentCardProps) {
  const initials = (student.displayName || student.username || "S")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const joinedDate = new Date(student.joinedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const handleCardClick = () => {
    onNavigatePage?.(`/students/${encodeURIComponent(student.username)}`);
  };

  const isCompleted =
    student.completedCoursesCount > 0 &&
    student.completedCoursesCount === student.enrolledCoursesCount;

  return (
    <article
      id={`student-${student.id}`}
      onClick={handleCardClick}
      className="group relative flex flex-col justify-between rounded-[18px] border border-(--border) bg-(--card-surface) p-4 md:p-5 transition-all duration-200 hover:bg-(--hover) hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] cursor-pointer select-none"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div>
        {/* Top identity row: Avatar + Name + Username + Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Avatar or initials badge */}
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.displayName}
                referrerPolicy="no-referrer"
                className="h-12 w-12 shrink-0 rounded-2xl object-cover border border-(--border) shadow-xs"
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-bold text-sm tracking-tight text-(--accent) shadow-xs transition-transform group-hover:scale-105"
                style={{
                  background:
                    "color-mix(in srgb, var(--accent) 18%, var(--surface))",
                }}
                aria-hidden="true"
              >
                {initials}
              </div>
            )}

            {/* Name, Username, Email */}
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-bold text-sm sm:text-base text-(--text) group-hover:text-(--accent) transition-colors">
                {student.displayName}
              </h3>
              <p className="truncate text-xs text-(--muted) font-mono">
                @{student.username}
              </p>
              {student.email && (
                <p className="flex items-center gap-1.5 truncate text-[11px] text-(--muted) mt-0.5">
                  <EnvelopeSimple size={12} className="shrink-0" />
                  <span className="truncate">{student.email}</span>
                </p>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
              isCompleted
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : student.enrolledCoursesCount > 0
                  ? "bg-(--accent)/12 text-(--accent) border-(--accent)/25"
                  : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
            }`}
          >
            {isCompleted
              ? "Completed"
              : student.enrolledCoursesCount > 0
                ? "Active Learner"
                : "Registered"}
          </span>
        </div>

        {/* Bio preview if available */}
        {student.bio && (
          <p className="mt-3 line-clamp-2 text-xs text-(--text-secondary) leading-relaxed">
            {student.bio}
          </p>
        )}

        {/* Learning metrics pill row */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-[color-mix(in_srgb,var(--surface-strong)_50%,var(--canvas))] p-2.5 border border-(--border)/60">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/10 text-(--accent)">
              <GraduationCap size={15} weight="duotone" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-(--muted) leading-none">Courses</p>
              <p className="text-xs font-bold text-(--text) mt-0.5">
                {student.enrolledCoursesCount} enrolled
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle size={15} weight="duotone" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-(--muted) leading-none">
                Completed
              </p>
              <p className="text-xs font-bold text-(--text) mt-0.5">
                {student.completedCoursesCount} courses
              </p>
            </div>
          </div>
        </div>

        {/* Average Progress Meter */}
        <div className="mt-3.5">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-[11px] font-medium text-(--muted)">
              Average Progress
            </span>
            <span className="font-bold text-xs text-(--accent)">
              {student.averageProgressPercent}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--surface-strong)_80%,var(--canvas))] border border-(--border)/40">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, Math.min(100, student.averageProgressPercent))}%`,
                background:
                  student.averageProgressPercent >= 100
                    ? "var(--emerald-500, #10b981)"
                    : "linear-gradient(90deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 70%, #f59e0b) 100%)",
              }}
            />
          </div>
        </div>

        {/* Enrolled courses tags preview */}
        {student.enrolledCoursesPreview &&
          student.enrolledCoursesPreview.length > 0 && (
            <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
              {student.enrolledCoursesPreview.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1 rounded-md bg-(--surface) px-2 py-0.5 text-[10px] font-medium text-(--text-secondary) border border-(--border)/80"
                  title={`${c.title} (${c.progressPercent}% completed)`}
                >
                  <BookOpen size={11} className="text-(--muted)" />
                  <span className="max-w-28 truncate">{c.title}</span>
                  <span className="font-bold text-(--accent) text-[9px]">
                    {c.progressPercent}%
                  </span>
                </span>
              ))}
              {student.enrolledCoursesCount >
                student.enrolledCoursesPreview.length && (
                <span className="text-[10px] text-(--muted) font-medium">
                  +
                  {student.enrolledCoursesCount -
                    student.enrolledCoursesPreview.length}{" "}
                  more
                </span>
              )}
            </div>
          )}
      </div>

      {/* Card Footer: Joined Date & View Profile Action */}
      <div className="mt-4 pt-3 border-t border-(--border)/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-(--muted) text-[11px]">
          <CalendarBlank size={13} />
          <span>Joined {joinedDate}</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCardClick();
          }}
          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-(--accent) hover:bg-(--accent)/10 transition-colors cursor-pointer group-hover:translate-x-0.5 duration-150"
        >
          <span>View Profile</span>
          <ArrowRight size={13} weight="bold" />
        </button>
      </div>
    </article>
  );
}
