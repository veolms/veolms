import { useEffect, useRef } from "react";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import type { StudentSummary } from "@veolms/contracts";
import type { NavigateTo } from "../routing/navigation";

export interface StudentsTableProps {
  students: readonly StudentSummary[];
  totalCount?: number;
  isLoading: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

export function StudentsTable({
  students,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onNavigatePage,
  setNotice,
}: StudentsTableProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      !sentinelRef.current ||
      !hasNextPage ||
      isFetchingNextPage ||
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined"
    )
      return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "300px" },
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleCopyEmail = (
    email: string | null | undefined,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    if (!email) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(email);
      setNotice?.(`Email ${email} copied to clipboard.`);
    }
  };

  const handleRowClick = (username: string) => {
    onNavigatePage?.(`/students/${encodeURIComponent(username)}`);
  };

  const formatDate = (dateVal: string | Date | null | undefined) => {
    if (!dateVal) return "—";
    try {
      const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
      return d.toLocaleDateString(undefined, {
        month: "short",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="w-full">
      {/* Desktop & Tablet Table View */}
      <div
        className="hidden md:block rounded-[18px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) overflow-hidden"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold tracking-wider text-(--muted) uppercase select-none">
                <th className="py-3.5 px-5">Learner</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Enrolled Courses</th>
                <th className="py-3.5 px-4">Avg Progress</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Joined</th>
                <th className="py-3.5 px-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color-mix(in_srgb,var(--text)_6%,transparent)] text-xs md:text-sm">
              {students.map((student) => {
                const initials = (student.displayName || student.username || "S")
                  .split(" ")
                  .map((w) => w[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join("")
                  .toUpperCase();
                const isActive = student.enrolledCoursesCount > 0;

                return (
                  <tr
                    key={student.id}
                    onClick={() => handleRowClick(student.username)}
                    className="group transition-colors hover:bg-(--hover) cursor-pointer"
                  >
                    {/* Learner Column: Avatar + Name + Username */}
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-3">
                        {student.avatarUrl ? (
                          <img
                            src={student.avatarUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-full object-cover border border-(--border) shadow-xs"
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs text-(--accent) border border-(--border) shadow-xs"
                            style={{
                              background:
                                "color-mix(in srgb, var(--accent) 15%, var(--surface))",
                            }}
                            aria-hidden="true"
                          >
                            {initials}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block font-bold text-sm text-(--text) truncate group-hover:text-(--accent) transition-colors leading-snug">
                            {student.displayName}
                          </span>
                          <span className="block text-xs text-(--muted) font-mono truncate leading-tight mt-0.5">
                            @{student.username}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Email Column */}
                    <td className="py-3.5 px-4">
                      {student.email ? (
                        <button
                          type="button"
                          onClick={(e) => handleCopyEmail(student.email, e)}
                          title="Click to copy email"
                          className="group/email inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-xs text-(--text-secondary) hover:border-(--border) hover:bg-(--surface-strong) hover:text-(--accent) transition-all cursor-pointer max-w-[200px]"
                        >
                          <EnvelopeSimple
                            size={14}
                            className="shrink-0 text-(--muted) group-hover/email:text-(--accent) transition-colors"
                          />
                          <span className="truncate font-mono text-[12px]">
                            {student.email}
                          </span>
                        </button>
                      ) : (
                        <span className="text-xs text-(--muted) pl-2">—</span>
                      )}
                    </td>

                    {/* Enrolled Courses */}
                    <td className="py-3.5 px-4">
                      <div className="inline-flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--card-surface) px-2.5 py-1 text-xs font-semibold text-(--text)">
                          <BookOpen size={13} className="text-(--accent) shrink-0" />
                          <span>
                            {student.enrolledCoursesCount}{" "}
                            {student.enrolledCoursesCount === 1 ? "course" : "courses"}
                          </span>
                        </span>
                        {student.completedCoursesCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                            <CheckCircle size={11} weight="bold" />
                            <span>{student.completedCoursesCount} done</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Average Progress Bar */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5 min-w-[120px] max-w-[140px]">
                        <div className="flex-1 h-2 rounded-full bg-[color-mix(in_srgb,var(--surface-strong)_90%,transparent)] border border-[color-mix(in_srgb,var(--text)_7%,transparent)] overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(100, Math.max(0, student.averageProgressPercent))}%`,
                              background:
                                student.averageProgressPercent >= 100
                                  ? "#10b981"
                                  : student.averageProgressPercent >= 50
                                    ? "var(--accent)"
                                    : student.averageProgressPercent > 0
                                      ? "#f59e0b"
                                      : "transparent",
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-(--text) shrink-0 w-8 text-right font-mono">
                          {student.averageProgressPercent}%
                        </span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.75 text-[11px] font-semibold border ${
                          isActive
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-400"
                          }`}
                        />
                        <span>{isActive ? "Active" : "Inactive"}</span>
                      </span>
                    </td>

                    {/* Joined Date */}
                    <td className="py-3.5 px-4 text-xs text-(--muted) font-medium whitespace-nowrap">
                      {formatDate(student.joinedAt)}
                    </td>

                    {/* Action Icon with Tooltip */}
                    <td className="py-3.5 px-5 text-right">
                      <div className="relative inline-flex items-center justify-end group/tooltip">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(student.username);
                          }}
                          aria-label={`View profile of ${student.displayName}`}
                          className="inline-flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-(--border) bg-(--card-surface) text-(--muted) transition-all hover:border-(--accent) hover:bg-(--surface-strong) hover:text-(--accent) active:scale-95 cursor-pointer shadow-xs"
                        >
                          <ArrowSquareOut size={16} weight="bold" />
                        </button>
                        <div
                          role="tooltip"
                          className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2.5 z-30 opacity-0 group-hover/tooltip:opacity-100 scale-95 group-hover/tooltip:scale-100 transition-all duration-150 rounded-lg border border-(--border) bg-(--card-surface) px-2.5 py-1 text-[11px] font-semibold text-(--text) shadow-xl whitespace-nowrap"
                        >
                          View profile
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Stacked Rows View (< md screens) */}
      <div
        className="md:hidden divide-y divide-[color-mix(in_srgb,var(--text)_8%,transparent)] rounded-[18px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface)) overflow-hidden"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        {students.map((student) => {
          const initials = (student.displayName || student.username || "S")
            .split(" ")
            .map((w) => w[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const isActive = student.enrolledCoursesCount > 0;

          return (
            <div
              key={student.id}
              onClick={() => handleRowClick(student.username)}
              className="p-4 transition-colors hover:bg-(--hover) cursor-pointer flex flex-col gap-3 group"
            >
              {/* Top Row: Avatar + Name + Status */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {student.avatarUrl ? (
                    <img
                      src={student.avatarUrl}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover border border-(--border)"
                    />
                  ) : (
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs text-(--accent) border border-(--border)"
                      style={{
                        background:
                          "color-mix(in srgb, var(--accent) 15%, var(--surface))",
                      }}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="block font-bold text-sm text-(--text) truncate group-hover:text-(--accent) transition-colors">
                      {student.displayName}
                    </span>
                    <span className="block text-xs text-(--muted) font-mono truncate">
                      @{student.username}
                    </span>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold border shrink-0 ${
                    isActive
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isActive ? "bg-emerald-400" : "bg-zinc-400"
                    }`}
                  />
                  <span>{isActive ? "Active" : "Inactive"}</span>
                </span>
              </div>

              {/* Middle Row: Email & Course Count */}
              <div className="flex items-center justify-between text-xs text-(--muted) gap-2">
                <span className="truncate max-w-[200px] font-mono text-[11.5px]">
                  {student.email || "No email"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-(--surface-strong) px-2 py-0.5 text-[11px] font-semibold text-(--text) shrink-0">
                  <BookOpen size={12} className="text-(--accent)" />
                  <span>
                    {student.enrolledCoursesCount}{" "}
                    {student.enrolledCoursesCount === 1 ? "course" : "courses"}
                  </span>
                </span>
              </div>

              {/* Bottom Row: Progress Bar & Icon Button with Tooltip */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2 flex-1 max-w-[180px]">
                  <div className="flex-1 h-1.5 rounded-full bg-[color-mix(in_srgb,var(--surface-strong)_90%,transparent)] border border-[color-mix(in_srgb,var(--text)_7%,transparent)] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(0, student.averageProgressPercent))}%`,
                        background:
                          student.averageProgressPercent >= 100
                            ? "#10b981"
                            : student.averageProgressPercent >= 50
                              ? "var(--accent)"
                              : student.averageProgressPercent > 0
                                ? "#f59e0b"
                                : "transparent",
                      }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-(--text) font-mono">
                    {student.averageProgressPercent}%
                  </span>
                </div>

                <div className="relative inline-flex items-center group/tooltip">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(student.username);
                    }}
                    aria-label={`View profile of ${student.displayName}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-(--border) bg-(--card-surface) text-(--muted) hover:text-(--accent) hover:border-(--accent) transition-all"
                  >
                    <ArrowSquareOut size={15} weight="bold" />
                  </button>
                  <div
                    role="tooltip"
                    className="pointer-events-none absolute right-full top-1/2 -translate-y-1/2 mr-2 z-30 opacity-0 group-hover/tooltip:opacity-100 scale-95 group-hover/tooltip:scale-100 transition-all duration-150 rounded-lg border border-(--border) bg-(--card-surface) px-2 py-0.5 text-[10px] font-medium text-(--text) shadow-md whitespace-nowrap"
                  >
                    View profile
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite Scroll Sentinel */}
      {hasNextPage && (
        <div ref={sentinelRef} className="h-6 w-full" aria-hidden="true" />
      )}

      {/* Small Spinner Loader */}
      {isFetchingNextPage && (
        <div
          role="status"
          aria-label="Loading more students"
          className="py-6 flex items-center justify-center gap-2 text-xs text-(--muted)"
        >
          <CircleNotch size={18} className="animate-spin text-(--accent)" />
          <span>Loading more students...</span>
        </div>
      )}
    </div>
  );
}
