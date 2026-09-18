import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type RefObject,
} from "react";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { CircleNotchIcon as CircleNotch } from "@phosphor-icons/react/CircleNotch";
import { EnvelopeSimpleIcon as EnvelopeSimple } from "@phosphor-icons/react/EnvelopeSimple";
import type { StudentListItem } from "@veolms/contracts";
import type { NavigateTo } from "../routing/navigation";
import { getApplicationScrollElement } from "../shell/applicationScroll";

const STUDENT_ROW_ESTIMATE = 78;
const STUDENT_ROW_OVERSCAN = 8;
const STUDENT_LOAD_AHEAD = 12;

const studentListGridColumns =
  "md:grid-cols-[minmax(220px,1.35fr)_minmax(180px,1.2fr)_minmax(190px,1.15fr)_minmax(160px,1fr)_minmax(110px,0.75fr)_minmax(105px,0.7fr)_minmax(60px,0.35fr)]";

const joinedDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  year: "numeric",
});

export interface StudentsTableProps {
  students: readonly StudentListItem[];
  totalCount?: number;
  isLoading: boolean;
  isTransitioning?: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  onNavigatePage?: NavigateTo;
  setNotice?: (message: string) => void;
}

type StudentVirtualizer = {
  getTotalSize: () => number;
  getVirtualItems: () => readonly {
    index: number;
    start: number;
  }[];
  measureElement: (element: Element | null) => void;
};

function getStudentListScrollMargin(
  feed: HTMLElement | null,
  scrollport: HTMLElement | null,
): number {
  if (!feed || typeof window === "undefined") return 0;

  const feedRect = feed.getBoundingClientRect();
  if (scrollport) {
    return (
      feedRect.top -
      scrollport.getBoundingClientRect().top +
      scrollport.scrollTop
    );
  }

  return feedRect.top + window.scrollY;
}

function useStudentScrollMode() {
  const [useWindowScroll, setUseWindowScroll] = useState(true);

  useLayoutEffect(() => {
    const syncScrollMode = () => {
      setUseWindowScroll(getApplicationScrollElement() === null);
    };

    syncScrollMode();
    window.addEventListener("resize", syncScrollMode);
    return () => window.removeEventListener("resize", syncScrollMode);
  }, []);

  return useWindowScroll;
}

function useStudentScrollMargin(
  feedRef: RefObject<HTMLDivElement | null>,
  useWindowScroll: boolean,
  itemCount: number,
) {
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const syncScrollMargin = () => {
      const nextMargin = getStudentListScrollMargin(
        feedRef.current,
        useWindowScroll ? null : getApplicationScrollElement(),
      );
      setScrollMargin((current) =>
        Math.abs(current - nextMargin) > 1 ? nextMargin : current,
      );
    };

    syncScrollMargin();
    window.addEventListener("resize", syncScrollMargin);
    return () => window.removeEventListener("resize", syncScrollMargin);
  }, [feedRef, itemCount, useWindowScroll]);

  return scrollMargin;
}

function getInitials(student: StudentListItem): string {
  return (student.displayName || student.username || "S")
    .split(" ")
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatJoinedDate(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return "—";

  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  return Number.isNaN(date.getTime()) ? "—" : joinedDateFormatter.format(date);
}

function getProgressColor(progress: number): string {
  if (progress >= 100) return "#10b981";
  if (progress >= 50) return "var(--accent)";
  if (progress > 0) return "#f59e0b";
  return "transparent";
}

interface StudentAvatarProps {
  student: StudentListItem;
}

const StudentAvatar = memo(function StudentAvatar({
  student,
}: StudentAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = getInitials(student);

  useEffect(() => {
    setImageFailed(false);
  }, [student.avatarUrl]);

  if (student.avatarUrl && !imageFailed) {
    return (
      <img
        src={student.avatarUrl}
        alt=""
        width={40}
        height={40}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImageFailed(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover border border-(--border) shadow-xs"
      />
    );
  }

  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-(--border) text-xs font-bold text-(--accent) shadow-xs"
      style={{
        background: "color-mix(in srgb, var(--accent) 15%, var(--surface))",
      }}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
});

interface StudentVirtualRowProps {
  student: StudentListItem;
  dataIndex: number;
  measureElement: (element: Element | null) => void;
  transform: string;
  onCopyEmail: (email: string, event: MouseEvent<HTMLElement>) => void;
  onNavigateStudent: (username: string) => void;
}

const StudentVirtualRow = memo(function StudentVirtualRow({
  student,
  dataIndex,
  measureElement,
  transform,
  onCopyEmail,
  onNavigateStudent,
}: StudentVirtualRowProps) {
  const isActive = student.enrolledCoursesCount > 0;
  const progress = Math.min(100, Math.max(0, student.averageProgressPercent));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onNavigateStudent(student.username);
    }
  };

  return (
    <div
      ref={measureElement}
      data-index={dataIndex}
      role="row"
      tabIndex={0}
      aria-label={`View profile of ${student.displayName}`}
      onClick={() => onNavigateStudent(student.username)}
      onKeyDown={handleKeyDown}
      className={`group absolute left-0 top-0 w-full flex cursor-pointer flex-col gap-3 border-b border-[color-mix(in_srgb,var(--text)_6%,transparent)] p-4 transition-colors hover:bg-(--hover) focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent) ${studentListGridColumns} md:grid md:min-w-[1080px] md:items-center md:gap-0 md:p-0`}
      style={{ transform }}
    >
      <div role="cell" className="min-w-0 md:px-5 md:py-3.5">
        <div className="flex items-center gap-3">
          <StudentAvatar student={student} />
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold leading-snug text-(--text) transition-colors group-hover:text-(--accent)">
              {student.displayName}
            </span>
            <span className="mt-0.5 block truncate font-mono text-xs leading-tight text-(--muted)">
              @{student.username}
            </span>
          </div>
        </div>
      </div>

      <div role="cell" className="hidden min-w-0 md:block md:px-4 md:py-3.5">
        {student.email ? (
          <button
            type="button"
            onClick={(event) => onCopyEmail(student.email!, event)}
            title="Click to copy email"
            className="group/email inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-lg border border-transparent px-2 py-1 text-xs text-(--text-secondary) transition-all hover:border-(--border) hover:bg-(--surface-strong) hover:text-(--accent)"
          >
            <EnvelopeSimple
              size={14}
              className="shrink-0 text-(--muted) transition-colors group-hover/email:text-(--accent)"
            />
            <span className="truncate font-mono text-[12px]">
              {student.email}
            </span>
          </button>
        ) : (
          <span className="pl-2 text-xs text-(--muted)">—</span>
        )}
      </div>

      <div
        role="cell"
        className="flex items-center justify-between gap-2 md:px-4 md:py-3.5"
      >
        <span className="text-xs text-(--muted) md:hidden">Courses</span>
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-(--border) bg-(--card-surface) px-2.5 py-1 text-xs font-semibold text-(--text)">
            <BookOpen size={13} className="shrink-0 text-(--accent)" />
            <span>
              {student.enrolledCoursesCount}{" "}
              {student.enrolledCoursesCount === 1 ? "course" : "courses"}
            </span>
          </span>
          {student.completedCoursesCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
              <CheckCircle size={11} weight="bold" />
              <span>{student.completedCoursesCount} done</span>
            </span>
          )}
        </div>
      </div>

      <div role="cell" className="flex items-center gap-2.5 md:px-4 md:py-3.5">
        <span className="text-xs text-(--muted) md:hidden">Progress</span>
        <div className="flex min-w-0 flex-1 items-center gap-2.5 md:min-w-[120px] md:max-w-[140px]">
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--text)_7%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_90%,transparent)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background: getProgressColor(progress),
              }}
            />
          </div>
          <span className="w-8 shrink-0 text-right font-mono text-xs font-semibold text-(--text)">
            {student.averageProgressPercent}%
          </span>
        </div>
      </div>

      <div role="cell" className="hidden md:block md:px-4 md:py-3.5">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.75 text-[11px] font-semibold ${
            isActive
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
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

      <div
        role="cell"
        className="hidden text-xs font-medium text-(--muted) md:block md:whitespace-nowrap md:px-4 md:py-3.5"
      >
        {formatJoinedDate(student.joinedAt)}
      </div>

      <div
        role="cell"
        className="absolute right-4 top-4 md:static md:px-5 md:py-3.5 md:text-right"
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNavigateStudent(student.username);
          }}
          aria-label={`View profile of ${student.displayName}`}
          className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-(--border) bg-(--card-surface) text-(--muted) shadow-xs transition-all hover:border-(--accent) hover:bg-(--surface-strong) hover:text-(--accent) active:scale-95"
        >
          <ArrowSquareOut size={16} weight="bold" />
        </button>
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 pr-10 text-xs text-(--muted) md:hidden">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (student.email) onCopyEmail(student.email, event);
          }}
          disabled={!student.email}
          className="min-w-0 max-w-[70%] truncate text-left font-mono text-[11.5px] disabled:cursor-default"
        >
          {student.email || "No email"}
        </button>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            isActive
              ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
              : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
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
    </div>
  );
});

interface VirtualizedStudentSurfaceProps {
  students: readonly StudentListItem[];
  totalCount?: number;
  isLoading: boolean;
  isTransitioning: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  virtualizer: StudentVirtualizer;
  scrollMargin: number;
  feedRef: RefObject<HTMLDivElement | null>;
  onCopyEmail: (email: string, event: MouseEvent<HTMLElement>) => void;
  onNavigateStudent: (username: string) => void;
}

function VirtualizedStudentSurface({
  students,
  totalCount,
  isLoading,
  isTransitioning,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  virtualizer,
  scrollMargin,
  feedRef,
  onCopyEmail,
  onNavigateStudent,
}: VirtualizedStudentSurfaceProps) {
  const virtualItems = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1;

  useEffect(() => {
    if (
      isTransitioning ||
      !hasNextPage ||
      isFetchingNextPage ||
      lastVirtualIndex < students.length - STUDENT_LOAD_AHEAD
    )
      return;

    void fetchNextPage();
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isTransitioning,
    lastVirtualIndex,
    students.length,
  ]);

  return (
    <div
      ref={feedRef}
      role="rowgroup"
      aria-busy={isLoading || isTransitioning || isFetchingNextPage}
      className="relative min-w-0 w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map((virtualItem) => {
        const student = students[virtualItem.index];
        if (!student) return null;

        return (
          <StudentVirtualRow
            key={student.id}
            student={student}
            dataIndex={virtualItem.index}
            measureElement={virtualizer.measureElement}
            transform={`translateY(${virtualItem.start - scrollMargin}px)`}
            onCopyEmail={onCopyEmail}
            onNavigateStudent={onNavigateStudent}
          />
        );
      })}
    </div>
  );
}

type VirtualizedStudentListProps = Omit<
  VirtualizedStudentSurfaceProps,
  "virtualizer" | "scrollMargin" | "feedRef"
>;

function WindowVirtualizedStudentList(props: VirtualizedStudentListProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useStudentScrollMargin(
    feedRef,
    true,
    props.students.length,
  );
  const virtualizer = useWindowVirtualizer({
    count: props.students.length,
    estimateSize: () => STUDENT_ROW_ESTIMATE,
    getItemKey: (index) => props.students[index]?.id ?? index,
    initialRect: { width: 1024, height: 768 },
    overscan: STUDENT_ROW_OVERSCAN,
    scrollMargin,
  });

  return (
    <VirtualizedStudentSurface
      {...props}
      feedRef={feedRef}
      scrollMargin={scrollMargin}
      virtualizer={virtualizer}
    />
  );
}

function ScrollportVirtualizedStudentList(props: VirtualizedStudentListProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useStudentScrollMargin(
    feedRef,
    false,
    props.students.length,
  );
  const virtualizer = useVirtualizer({
    count: props.students.length,
    getScrollElement: getApplicationScrollElement,
    estimateSize: () => STUDENT_ROW_ESTIMATE,
    getItemKey: (index) => props.students[index]?.id ?? index,
    initialRect: { width: 1024, height: 768 },
    overscan: STUDENT_ROW_OVERSCAN,
    scrollMargin,
  });

  return (
    <VirtualizedStudentSurface
      {...props}
      feedRef={feedRef}
      scrollMargin={scrollMargin}
      virtualizer={virtualizer}
    />
  );
}

export function StudentsTable({
  students,
  totalCount,
  isLoading,
  isTransitioning = false,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  onNavigatePage,
  setNotice,
}: StudentsTableProps) {
  const useWindowScroll = useStudentScrollMode();

  const handleCopyEmail = useCallback(
    (email: string, event: MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      if (typeof navigator === "undefined" || !navigator.clipboard) return;

      void navigator.clipboard.writeText(email);
      setNotice?.(`Email ${email} copied to clipboard.`);
    },
    [setNotice],
  );

  const handleNavigateStudent = useCallback(
    (username: string) => {
      onNavigatePage?.(`/students/${encodeURIComponent(username)}`);
    },
    [onNavigatePage],
  );

  const listProps: VirtualizedStudentListProps = {
    students,
    totalCount,
    isLoading,
    isTransitioning,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    onCopyEmail: handleCopyEmail,
    onNavigateStudent: handleNavigateStudent,
  };

  return (
    <div className="w-full">
      <div
        className="overflow-hidden rounded-[18px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-(--card-surface-raised,var(--surface))"
        style={{ boxShadow: "var(--card-shadow)" }}
      >
        <div className="overflow-x-auto">
          <div
            role="table"
            aria-label="Students list"
            aria-rowcount={totalCount}
            className="min-w-0 w-full"
          >
            <div
              role="row"
              className={`hidden min-w-[1080px] border-b border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--surface-strong)_45%,transparent)] text-[11px] font-bold uppercase tracking-wider text-(--muted) select-none md:grid ${studentListGridColumns}`}
            >
              <div role="columnheader" className="px-5 py-3.5">
                Learner
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Email
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Enrolled Courses
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Avg Progress
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Status
              </div>
              <div role="columnheader" className="px-4 py-3.5">
                Joined
              </div>
              <div role="columnheader" className="px-5 py-3.5 text-right">
                Action
              </div>
            </div>

            {useWindowScroll ? (
              <WindowVirtualizedStudentList {...listProps} />
            ) : (
              <ScrollportVirtualizedStudentList {...listProps} />
            )}
          </div>
        </div>
      </div>

      {isFetchingNextPage && (
        <div
          role="status"
          aria-label="Loading more students"
          className="flex items-center justify-center gap-2 py-6 text-xs text-(--muted)"
        >
          <CircleNotch size={18} className="animate-spin text-(--accent)" />
          <span>Loading more students...</span>
        </div>
      )}
    </div>
  );
}
