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
      className="group relative flex cursor-pointer flex-col justify-between rounded-[18px] border border-(--border) bg-(--card-surface) p-4 transition-all duration-200 select-none hover:border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] hover:bg-(--hover) md:p-5"
      style={{ boxShadow: "var(--card-shadow)" }}
    >
      <div>
        {/* Top identity row: Avatar + Name + Username + Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3.5">
            {/* Avatar or initials badge */}
            {student.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student.displayName}
                width={48}
                height={48}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-12 w-12 shrink-0 rounded-2xl border border-(--border) object-cover shadow-xs"
              />
            ) : (
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold tracking-tight text-(--accent) shadow-xs transition-transform group-hover:scale-105"
                style={{
                  background: "color-mix(in srgb, var(--accent) 18%, var(--surface))",
                }}
                aria-hidden="true"
              >
                {initials}
              </div>
            )}

            {/* Name, Username, Email */}
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-bold text-(--text) transition-colors group-hover:text-(--accent) sm:text-base">
                {student.displayName}
              </h3>
              <p className="truncate font-mono text-xs text-(--muted)">@{student.username}</p>
              {student.email && (
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-(--muted)">
                  <EnvelopeSimple size={12} className="shrink-0" />
                  <span className="truncate">{student.email}</span>
                </p>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
              isCompleted
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                : student.enrolledCoursesCount > 0
                  ? "border-(--accent)/25 bg-(--accent)/12 text-(--accent)"
                  : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
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
          <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-(--text-secondary)">
            {student.bio}
          </p>
        )}

        {/* Learning metrics pill row */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-(--border)/60 bg-[color-mix(in_srgb,var(--surface-strong)_50%,var(--canvas))] p-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--accent)/10 text-(--accent)">
              <GraduationCap size={15} weight="duotone" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] leading-none text-(--muted)">Courses</p>
              <p className="mt-0.5 text-xs font-bold text-(--text)">
                {student.enrolledCoursesCount} enrolled
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle size={15} weight="duotone" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] leading-none text-(--muted)">Completed</p>
              <p className="mt-0.5 text-xs font-bold text-(--text)">
                {student.completedCoursesCount} courses
              </p>
            </div>
          </div>
        </div>

        {/* Average Progress Meter */}
        <div className="mt-3.5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-[11px] font-medium text-(--muted)">Average Progress</span>
            <span className="text-xs font-bold text-(--accent)">
              {student.averageProgressPercent}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-(--border)/40 bg-[color-mix(in_srgb,var(--surface-strong)_80%,var(--canvas))]">
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
        {student.enrolledCoursesPreview && student.enrolledCoursesPreview.length > 0 && (
          <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
            {student.enrolledCoursesPreview.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-md border border-(--border)/80 bg-(--surface) px-2 py-0.5 text-[10px] font-medium text-(--text-secondary)"
                title={`${c.title} (${c.progressPercent}% completed)`}
              >
                <BookOpen size={11} className="text-(--muted)" />
                <span className="max-w-28 truncate">{c.title}</span>
                <span className="text-[9px] font-bold text-(--accent)">{c.progressPercent}%</span>
              </span>
            ))}
            {student.enrolledCoursesCount > student.enrolledCoursesPreview.length && (
              <span className="text-[10px] font-medium text-(--muted)">
                +{student.enrolledCoursesCount - student.enrolledCoursesPreview.length} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* Card Footer: Joined Date & View Profile Action */}
      <div className="mt-4 flex items-center justify-between border-t border-(--border)/60 pt-3 text-xs">
        <div className="flex items-center gap-1.5 text-[11px] text-(--muted)">
          <CalendarBlank size={13} />
          <span>Joined {joinedDate}</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleCardClick();
          }}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold text-(--accent) transition-colors duration-150 group-hover:translate-x-0.5 hover:bg-(--accent)/10"
        >
          <span>View Profile</span>
          <ArrowRight size={13} weight="bold" />
        </button>
      </div>
    </article>
  );
}
