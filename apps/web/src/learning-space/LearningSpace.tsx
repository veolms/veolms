import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { PushPinSimpleIcon as PushPinSimple } from "@phosphor-icons/react/PushPinSimple";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import { memo, useId, useState } from "react";
import {
  CourseActionMenu,
  MenuAction,
  MenuDivider,
} from "../courses/CourseActionMenu";
import { lessonsById } from "../learning/courseContent";
import { getCourseThumbnail, getCourseTitle } from "../learning/courseMetadata";
import type { CoursePlayerSession } from "../learning/coursePlayerNavigation";

interface LearningSpaceProps {
  sessions: readonly CoursePlayerSession[];
  activeCourseId?: string | null;
  expanded: boolean;
  collapsedSidebar?: boolean;
  mobile?: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onRequestSidebarExpand?: () => void;
  onActivate: (session: CoursePlayerSession) => void;
  onClose: (session: CoursePlayerSession) => void;
}

interface LearningSessionItemProps {
  session: CoursePlayerSession;
  active: boolean;
  onActivate: (session: CoursePlayerSession) => void;
  onClose: (session: CoursePlayerSession) => void;
}

const openSessionInNewTab = (path: string) => {
  const openedWindow = window.open(path, "_blank", "noopener,noreferrer");
  if (openedWindow) openedWindow.opener = null;
};

const LearningSessionItem = memo(function LearningSessionItem({
  session,
  active,
  onActivate,
  onClose,
}: LearningSessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const courseTitle = getCourseTitle(session.courseId);
  const lectureTitle =
    lessonsById.get(session.lessonId)?.[1] || `Lecture ${session.lessonId}`;
  const lectureLabel = `L${session.lessonId} · ${lectureTitle}`;

  return (
    <article
      className={[
        "group/session relative flex min-h-17 w-full min-w-0 items-center gap-2 rounded-[10px] px-2 py-2 text-left transition-[background-color,box-shadow] duration-150",
        active
          ? "[background:var(--sidebar-menu-active-background)] [box-shadow:var(--sidebar-menu-active-shadow)]"
          : "bg-transparent hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] focus-within:bg-[color-mix(in_srgb,var(--text)_5%,transparent)]",
      ].join(" ")}
      aria-label={`${courseTitle}, ${lectureLabel}`}
      data-learning-session={session.courseId}
    >
      <button
        type="button"
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
        aria-current={active ? "page" : undefined}
        aria-label={`Open ${courseTitle}, ${lectureLabel}`}
        title={`${courseTitle} — ${lectureLabel}`}
        onClick={() => onActivate(session)}
      >
        <span className="aspect-video w-14 shrink-0 overflow-hidden rounded-[7px] bg-(--track) shadow-[0_4px_12px_rgb(0_0_0/0.2)]">
          <img
            src={getCourseThumbnail(session.courseId)}
            alt=""
            className="h-full w-full object-cover"
            width={960}
            height={540}
            loading="lazy"
            fetchPriority="low"
            decoding="async"
          />
        </span>
        <span className="min-w-0 flex-1">
          <strong
            className="line-clamp-2 text-[0.78rem] leading-[1.02rem] font-semibold text-(--text)"
            title={courseTitle}
          >
            {courseTitle}
          </strong>
          <small
            className="mt-0.5 block truncate text-[0.68rem] leading-4 text-(--muted)"
            title={lectureLabel}
          >
            {lectureLabel}
          </small>
        </span>
      </button>

      <CourseActionMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        ariaLabel={`More actions for ${courseTitle}`}
        menuLabel={`${courseTitle} session actions`}
        className="relative z-20 shrink-0"
        triggerClassName="size-11"
      >
        <MenuAction
          Icon={BookOpen}
          label="Open session"
          onClick={() => {
            setMenuOpen(false);
            onActivate(session);
          }}
        />
        <MenuAction
          Icon={ArrowSquareOut}
          label="Open in new tab"
          onClick={() => {
            setMenuOpen(false);
            openSessionInNewTab(session.path);
          }}
        />
        <MenuDivider />
        <MenuAction
          Icon={PencilSimple}
          label="Rename session"
          disabled
          onClick={() => undefined}
        />
        <MenuAction
          Icon={PushPinSimple}
          label="Pin session"
          disabled
          onClick={() => undefined}
        />
        <MenuDivider />
        <MenuAction
          Icon={XCircle}
          label="Close session"
          destructive
          onClick={() => {
            setMenuOpen(false);
            onClose(session);
          }}
        />
      </CourseActionMenu>
    </article>
  );
});

export const LearningSpace = memo(function LearningSpace({
  sessions,
  activeCourseId,
  expanded,
  collapsedSidebar = false,
  mobile = false,
  onExpandedChange,
  onRequestSidebarExpand,
  onActivate,
  onClose,
}: LearningSpaceProps) {
  const panelId = useId();
  const sessionCountLabel = `${sessions.length} open ${sessions.length === 1 ? "session" : "sessions"}`;

  return (
    <section
      className={[
        "mt-3 flex flex-col",
        collapsedSidebar
          ? "min-h-0 flex-1 items-center px-1"
          : mobile
            ? "min-h-fit flex-none px-0 pb-2"
            : "min-h-0 flex-1 px-0.5",
      ].join(" ")}
      aria-label="Learning Space"
    >
      <button
        type="button"
        className={[
          "group/header flex min-h-11 shrink-0 items-center rounded-[10px] text-(--text-secondary) outline-none transition-[color,background-color] duration-150 hover:bg-[color-mix(in_srgb,var(--text)_5%,transparent)] hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)",
          collapsedSidebar
            ? "relative w-12 justify-center px-0"
            : "w-full gap-2 px-2.5 text-left",
        ].join(" ")}
        aria-expanded={collapsedSidebar ? undefined : expanded}
        aria-controls={collapsedSidebar ? undefined : panelId}
        aria-label={
          collapsedSidebar
            ? `Expand sidebar to view Learning Space, ${sessionCountLabel}`
            : `${expanded ? "Collapse" : "Expand"} Learning Space, ${sessionCountLabel}`
        }
        title={
          collapsedSidebar ? `Learning Space · ${sessionCountLabel}` : undefined
        }
        onClick={() => {
          if (collapsedSidebar) {
            onRequestSidebarExpand?.();
            onExpandedChange(true);
            return;
          }
          onExpandedChange(!expanded);
        }}
      >
        <BookOpen
          className="shrink-0 text-(--accent)"
          size={22}
          weight="duotone"
          aria-hidden="true"
        />
        {collapsedSidebar ? (
          <span className="absolute top-0.5 right-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-(--accent) px-1 text-[0.6rem] leading-4 font-bold text-(--on-accent)">
            {sessions.length}
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-[0.82rem] font-semibold tracking-[-0.01em]">
              Learning Space
            </span>
            <span
              className="flex min-w-6 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] px-1.5 text-[0.68rem] leading-5 font-bold text-(--accent)"
              aria-label={sessionCountLabel}
            >
              {sessions.length}
            </span>
            <CaretDown
              className={[
                "shrink-0 text-(--muted) transition-transform duration-150 motion-reduce:transition-none",
                expanded ? "rotate-180" : "rotate-0",
              ].join(" ")}
              size={15}
              weight="bold"
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {!collapsedSidebar && expanded && (
        <div
          id={panelId}
          className={[
            "mt-1 min-h-0 w-full pr-0.5",
            mobile
              ? "overflow-visible"
              : "flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
          ].join(" ")}
        >
          {sessions.length > 0 ? (
            <div className="grid min-w-0 content-start gap-1" role="list">
              {sessions.map((session) => (
                <div key={session.courseId} className="min-w-0" role="listitem">
                  <LearningSessionItem
                    session={session}
                    active={activeCourseId === session.courseId}
                    onActivate={onActivate}
                    onClose={onClose}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="px-2.5 py-2 text-[0.72rem] leading-5 text-(--muted)">
              Open a course to start a learning session.
            </p>
          )}
        </div>
      )}
    </section>
  );
});
