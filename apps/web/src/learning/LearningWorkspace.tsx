import { ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { SidebarToggleIcon } from "../shell/SidebarToggleIcon";
import { FloatingScrollbar } from "../shell/FloatingScrollbar";
import { scrollApplicationTo } from "../shell/applicationScroll";
import { isEditingShortcutTarget } from "../keyboardShortcuts";
import { useShortcutPlatform } from "../useShortcutPlatform";
import { VideoPlayer as YouTubeVideoPlayer } from "../VideoPlayer";
import {
  DEFAULT_ACADEMY_THEME,
  getInitialAcademyTheme,
  persistAcademyTheme,
} from "../themes";
import { courseVideos, lessonsById, lessonVideoMap } from "./courseContent";
import { Curriculum } from "./Curriculum";
import { getCourseThumbnail, getCourseTitle } from "./courseMetadata";
import { Discussion } from "./Discussion";

const CURRICULUM_COLLAPSED_WIDTH = 0;
const CURRICULUM_MIN_WIDTH = 300;
const CURRICULUM_DEFAULT_WIDTH = 400;
const CURRICULUM_MAX_WIDTH = 560;
const CURRICULUM_SNAP_WIDTH = CURRICULUM_MIN_WIDTH / 2;

const clampCurriculumWidth = (value: number) =>
  Math.min(CURRICULUM_MAX_WIDTH, Math.max(CURRICULUM_MIN_WIDTH, value));

const getInitialCurriculumWidth = () => {
  if (typeof window === "undefined") return CURRICULUM_DEFAULT_WIDTH;

  try {
    const storedWidth = window.localStorage.getItem("veolms-curriculum-width");
    if (storedWidth === null) return CURRICULUM_DEFAULT_WIDTH;

    const savedWidth = Number(storedWidth);
    return Number.isFinite(savedWidth)
      ? clampCurriculumWidth(savedWidth)
      : CURRICULUM_DEFAULT_WIDTH;
  } catch {
    return CURRICULUM_DEFAULT_WIDTH;
  }
};

interface LearningWorkspaceProps {
  courseSlug: string | undefined;
  lessonId: number;
  backLabel: string;
  onSelectLesson: (lessonId: number) => void;
  onNavigateBack: () => void;
}

interface CurriculumResize {
  pointerId: number;
  startX: number;
  startWidth: number;
  expandedWidthAtStart: number;
  collapsedAtStart: boolean;
  collapsed: boolean;
  collapsedAnchorX: number;
  collapsedAnchorWidth: number;
  expandedAnchorX: number | null;
  previewWidth: number;
  handle: HTMLDivElement;
}

interface CurriculumPointerEvent {
  pointerId: number;
  clientX: number;
}

type LearningWorkspaceStyle = CSSProperties & {
  "--learning-curriculum-width": string;
  "--learning-curriculum-expanded-width": string;
};

export function LearningWorkspace({
  courseSlug,
  lessonId,
  backLabel,
  onSelectLesson,
  onNavigateBack,
}: LearningWorkspaceProps) {
  const lessonStorageKey = `veolms-last-lesson-${encodeURIComponent(courseSlug || "default")}`;
  const [theme, setTheme] = useState("dark");
  const shortcutPlatform = useShortcutPlatform();
  const [academyTheme, setAcademyTheme] = useState(DEFAULT_ACADEMY_THEME);
  const [selectedLesson, setSelectedLesson] = useState(lessonId);
  const [autoPlayOnLessonChange, setAutoPlayOnLessonChange] = useState(false);
  const [courseTitle, setCourseTitle] = useState(() =>
    getCourseTitle(courseSlug),
  );
  const coursePersistenceKey = encodeURIComponent(courseSlug || "default");
  const discussionPersistenceKey = `${coursePersistenceKey}-lesson-${selectedLesson}`;
  const [lessonDrawer, setLessonDrawer] = useState(false);
  const [curriculumFocusRequest, setCurriculumFocusRequest] = useState(0);
  const [curriculumWidth, setCurriculumWidth] = useState(
    getInitialCurriculumWidth,
  );
  useEffect(() => {
    try {
      setTheme(localStorage.getItem("veolms-theme") || "dark");
      setAcademyTheme(getInitialAcademyTheme());
    } catch {
      // The deterministic defaults remain usable without browser storage.
    }
  }, []);

  useEffect(() => {
    if (courseSlug) {
      setCourseTitle(getCourseTitle(courseSlug));
      return;
    }
    try {
      const storedTitle = window.localStorage.getItem(
        "veolms-current-course-title",
      );
      if (storedTitle) setCourseTitle(storedTitle);
    } catch {
      // Keep the deterministic title when storage is unavailable.
    }
  }, [courseSlug]);
  const [curriculumCollapsed, setCurriculumCollapsed] = useState(false);
  const [curriculumResizing, setCurriculumResizing] = useState(false);
  const [curriculumResizePreviewWidth, setCurriculumResizePreviewWidth] =
    useState<number | null>(null);
  const [theaterMode, setTheaterMode] = useState(false);
  const lessonTriggerRef = useRef<HTMLButtonElement>(null);
  const lessonDialogRef = useRef<HTMLDivElement>(null);
  const curriculumScrollportRef = useRef<HTMLElement>(null);
  const lessonDrawerScrollportRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const curriculumResizeRef = useRef<CurriculumResize | null>(null);
  const curriculumResizeMoveRef = useRef<
    ((event: PointerEvent) => void) | null
  >(null);
  const curriculumResizeFinishRef = useRef<
    ((event: PointerEvent, cancelled?: boolean) => void) | null
  >(null);
  const currentLesson = lessonsById.get(selectedLesson) || lessonsById.get(9)!;
  const courseThumbnail = getCourseThumbnail(courseSlug);
  const curriculumShortcutLabel =
    shortcutPlatform === "mac" ? "⌘+⌥+C" : "Ctrl+Alt+C";

  const selectLesson = (lessonNumber: number) => {
    if (lessonNumber === selectedLesson) return;
    setAutoPlayOnLessonChange(true);
    setSelectedLesson(lessonNumber);
    onSelectLesson(lessonNumber);
  };

  useEffect(() => {
    if (lessonId === selectedLesson) return;
    setAutoPlayOnLessonChange(true);
    setSelectedLesson(lessonId);
  }, [lessonId, selectedLesson]);

  const toggleTheaterMode = () => {
    setLessonDrawer(false);
    const nextMode = !theaterMode;
    setTheaterMode(nextMode);

    if (nextMode) {
      window.requestAnimationFrame(() => {
        scrollApplicationTo({
          top: 0,
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
      });
    }
  };

  const openLessonDrawer = () => {
    if (!window.matchMedia("(max-width: 1080px)").matches) {
      setCurriculumCollapsed(false);
    }
    setCurriculumFocusRequest((request) => request + 1);
    if (!window.matchMedia("(max-width: 1080px)").matches) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setLessonDrawer(true);
  };

  const closeLessonDrawer = () => {
    setLessonDrawer(false);
    window.setTimeout(
      () => (previousFocusRef.current || lessonTriggerRef.current)?.focus?.(),
      0,
    );
  };

  useEffect(() => {
    const handleCurriculumShortcut = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        !(event.ctrlKey || event.metaKey) ||
        !event.altKey ||
        event.shiftKey ||
        (event.code !== "KeyC" && event.key.toLowerCase() !== "c") ||
        isEditingShortcutTarget(event.target)
      )
        return;

      event.preventDefault();
      if (window.matchMedia("(max-width: 1080px)").matches) {
        if (lessonDrawer) {
          setLessonDrawer(false);
          window.setTimeout(
            () =>
              (previousFocusRef.current || lessonTriggerRef.current)?.focus?.(),
            0,
          );
        } else {
          previousFocusRef.current =
            document.activeElement as HTMLElement | null;
          setLessonDrawer(true);
        }
        return;
      }

      setCurriculumCollapsed((collapsed) => !collapsed);
    };

    window.addEventListener("keydown", handleCurriculumShortcut, true);
    return () =>
      window.removeEventListener("keydown", handleCurriculumShortcut, true);
  }, [lessonDrawer]);

  const commitCurriculumWidth = useCallback((value: number) => {
    const nextWidth = clampCurriculumWidth(value);
    setCurriculumWidth(nextWidth);
    try {
      localStorage.setItem(
        "veolms-curriculum-width",
        String(Math.round(nextWidth)),
      );
    } catch {
      // Resizing remains available when browser storage is unavailable.
    }
  }, []);

  const startCurriculumResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(max-width: 1080px)").matches) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    curriculumResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: curriculumCollapsed
        ? CURRICULUM_COLLAPSED_WIDTH
        : curriculumWidth,
      expandedWidthAtStart: curriculumWidth,
      collapsedAtStart: curriculumCollapsed,
      collapsed: curriculumCollapsed,
      collapsedAnchorX: event.clientX,
      collapsedAnchorWidth: curriculumCollapsed
        ? CURRICULUM_COLLAPSED_WIDTH
        : curriculumWidth,
      expandedAnchorX: null,
      previewWidth: curriculumCollapsed
        ? CURRICULUM_COLLAPSED_WIDTH
        : curriculumWidth,
      handle: event.currentTarget,
    };
    setCurriculumResizePreviewWidth(
      curriculumCollapsed ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth,
    );
    setCurriculumResizing(true);
  };

  const moveCurriculumResize = useCallback((event: CurriculumPointerEvent) => {
    const resize = curriculumResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;

    let previewWidth: number;

    if (resize.collapsed) {
      const candidateWidth = Math.min(
        CURRICULUM_MAX_WIDTH,
        Math.max(
          CURRICULUM_COLLAPSED_WIDTH,
          resize.collapsedAnchorWidth + resize.collapsedAnchorX - event.clientX,
        ),
      );

      if (candidateWidth >= CURRICULUM_SNAP_WIDTH) {
        resize.collapsed = false;
        resize.expandedAnchorX = event.clientX;
        previewWidth = CURRICULUM_MIN_WIDTH;
        setCurriculumCollapsed(false);
      } else {
        previewWidth = candidateWidth;
      }
    } else {
      const candidateWidth =
        resize.expandedAnchorX === null
          ? resize.startWidth + resize.startX - event.clientX
          : CURRICULUM_MIN_WIDTH + resize.expandedAnchorX - event.clientX;
      previewWidth = Math.min(
        CURRICULUM_MAX_WIDTH,
        Math.max(CURRICULUM_COLLAPSED_WIDTH, candidateWidth),
      );

      if (candidateWidth <= CURRICULUM_SNAP_WIDTH) {
        resize.collapsed = true;
        resize.collapsedAnchorX = event.clientX;
        resize.collapsedAnchorWidth = previewWidth;
        resize.expandedAnchorX = null;
        setCurriculumCollapsed(true);
      }
    }

    resize.previewWidth = previewWidth;
    setCurriculumResizePreviewWidth(previewWidth);

    if (!resize.collapsed && previewWidth >= CURRICULUM_MIN_WIDTH) {
      setCurriculumWidth(previewWidth);
    }
  }, []);

  const endCurriculumResize = useCallback(
    (event: CurriculumPointerEvent, cancelled = false) => {
      const resize = curriculumResizeRef.current;
      if (!resize || resize.pointerId !== event.pointerId) return;
      curriculumResizeRef.current = null;
      setCurriculumResizing(false);
      setCurriculumResizePreviewWidth(null);
      resize.handle?.releasePointerCapture?.(resize.pointerId);

      if (cancelled) {
        setCurriculumCollapsed(resize.collapsedAtStart);
        setCurriculumWidth(resize.expandedWidthAtStart);
        return;
      }
      if (resize.collapsed) {
        setCurriculumCollapsed(true);
        setCurriculumWidth(resize.expandedWidthAtStart);
        return;
      }
      setCurriculumCollapsed(false);
      commitCurriculumWidth(resize.previewWidth);
    },
    [commitCurriculumWidth],
  );

  useLayoutEffect(() => {
    curriculumResizeMoveRef.current = moveCurriculumResize;
    curriculumResizeFinishRef.current = endCurriculumResize;

    return () => {
      if (curriculumResizeMoveRef.current === moveCurriculumResize) {
        curriculumResizeMoveRef.current = null;
      }
      if (curriculumResizeFinishRef.current === endCurriculumResize) {
        curriculumResizeFinishRef.current = null;
      }
    };
  }, [moveCurriculumResize, endCurriculumResize]);

  useEffect(() => {
    if (!curriculumResizing) return undefined;
    const continueResize = (event: PointerEvent) =>
      curriculumResizeMoveRef.current?.(event);
    const finishResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event);
    const cancelResize = (event: PointerEvent) =>
      curriculumResizeFinishRef.current?.(event, true);
    window.addEventListener("pointermove", continueResize);
    window.addEventListener("pointerup", finishResize);
    window.addEventListener("pointercancel", cancelResize);
    return () => {
      window.removeEventListener("pointermove", continueResize);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", cancelResize);
    };
  }, [curriculumResizing]);

  const handleCurriculumResizeKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (curriculumCollapsed && event.key === "ArrowLeft") {
        setCurriculumCollapsed(false);
        commitCurriculumWidth(CURRICULUM_MIN_WIDTH);
        return;
      }
      if (!curriculumCollapsed) {
        const direction = event.key === "ArrowRight" ? -16 : 16;
        commitCurriculumWidth(curriculumWidth + direction);
      }
    } else if (event.key === "Home") {
      event.preventDefault();
      setCurriculumCollapsed(true);
    } else if (event.key === "End") {
      event.preventDefault();
      setCurriculumCollapsed(false);
      commitCurriculumWidth(CURRICULUM_MAX_WIDTH);
    }
  };

  const toggleCurriculumFromResizeRail = () => {
    if (window.matchMedia("(max-width: 1080px)").matches) return;
    setCurriculumCollapsed((collapsed) => !collapsed);
  };

  const toggleCurriculumFromPlayer = () => {
    setCurriculumCollapsed((collapsed) => !collapsed);
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      document.documentElement.dataset.theme =
        theme === "device" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.appearance = theme;
    };
    applyTheme();
    if (theme !== "device") return undefined;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.palette = academyTheme;
    persistAcademyTheme(academyTheme);
  }, [academyTheme]);

  useEffect(() => {
    try {
      localStorage.setItem(lessonStorageKey, String(selectedLesson));
      localStorage.setItem("veolms-last-lesson", String(selectedLesson));
    } catch {
      // Lesson selection remains usable when browser storage is unavailable.
    }
  }, [lessonStorageKey, selectedLesson]);

  useEffect(() => {
    try {
      sessionStorage.removeItem("veolms-course-autostart");
      localStorage.removeItem("veolms-player-autoplay");
    } catch {
      // Retired preferences are cleaned up on a best-effort basis.
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = lessonDrawer ? "hidden" : "";
    if (!lessonDrawer)
      return () => {
        document.body.style.overflow = "";
      };

    const dialog = lessonDialogRef.current;
    const focusableSelector =
      '.lesson-drawer-panel button:not([disabled]):not([tabindex="-1"]):not([inert] *), .lesson-drawer-panel input:not([disabled]):not([inert] *), .lesson-drawer-panel [tabindex]:not([tabindex="-1"]):not([inert] *)';
    const initialFocusFrame = window.requestAnimationFrame(() => {
      dialog
        ?.querySelector<HTMLElement>(focusableSelector)
        ?.focus({ preventScroll: true });
    });
    const onDrawerKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeLessonDrawer();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onDrawerKeyDown);
    return () => {
      window.cancelAnimationFrame(initialFocusFrame);
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onDrawerKeyDown);
    };
  }, [lessonDrawer]);

  const curriculumViewportWidth =
    curriculumResizePreviewWidth ??
    (curriculumCollapsed ? CURRICULUM_COLLAPSED_WIDTH : curriculumWidth);
  const curriculumAccessibleWidth = Math.max(
    CURRICULUM_MIN_WIDTH,
    curriculumResizePreviewWidth ?? curriculumWidth,
  );

  return (
    <div
      className={`learning-workspace ${theaterMode ? "is-theater" : ""} ${curriculumResizing ? "is-curriculum-resizing" : ""}`}
    >
      <link
        rel="preload"
        as="image"
        href={courseThumbnail}
        fetchPriority="high"
      />
      <main
        className={`learning-workspace__main ${curriculumCollapsed ? "is-curriculum-collapsed" : ""}`}
        inert={lessonDrawer ? true : undefined}
        aria-hidden={lessonDrawer || undefined}
        style={
          {
            "--learning-curriculum-width": `${curriculumViewportWidth}px`,
            "--learning-curriculum-expanded-width": `${curriculumWidth}px`,
          } as LearningWorkspaceStyle
        }
      >
        <section className="learning-workspace__lesson-column">
          <div className="learning-workspace__player-wrap">
            <button
              type="button"
              className="learning-workspace__back"
              aria-label={backLabel}
              onClick={onNavigateBack}
            >
              <ArrowLeft size={22} />
            </button>
            <button
              type="button"
              className="learning-workspace__curriculum-toggle"
              aria-label={
                curriculumCollapsed
                  ? "Expand course content"
                  : "Collapse course content"
              }
              aria-expanded={!curriculumCollapsed}
              aria-controls="learning-course-content"
              aria-keyshortcuts="Control+Alt+C Meta+Alt+C"
              aria-describedby="learning-curriculum-toggle-tooltip"
              onClick={toggleCurriculumFromPlayer}
            >
              <span
                className="learning-workspace__curriculum-toggle-icon"
                aria-hidden="true"
              >
                <SidebarToggleIcon
                  direction={curriculumCollapsed ? "left" : "right"}
                />
              </span>
              <span
                id="learning-curriculum-toggle-tooltip"
                className="learning-workspace__curriculum-toggle-tooltip"
                role="tooltip"
              >
                <span>
                  {curriculumCollapsed
                    ? "Expand course content"
                    : "Collapse course content"}
                </span>
                <span aria-hidden="true">|</span>
                <kbd>{curriculumShortcutLabel}</kbd>
              </span>
            </button>
            <YouTubeVideoPlayer
              media={lessonVideoMap[selectedLesson] || courseVideos[0]!}
              lessonTitle={currentLesson[1]}
              posterSrc={courseThumbnail}
              theaterMode={theaterMode}
              onTheaterToggle={toggleTheaterMode}
              autoPlayOnMediaChange={autoPlayOnLessonChange}
            />
          </div>

          <button
            ref={lessonTriggerRef}
            type="button"
            className="learning-workspace__lesson-heading"
            aria-label={`Open course lessons for ${currentLesson[1]}`}
            aria-expanded={lessonDrawer}
            onClick={openLessonDrawer}
          >
            <div className="min-w-0">
              <h1>{currentLesson[1]}</h1>
            </div>
          </button>
          <Discussion
            key={discussionPersistenceKey}
            persistenceKey={discussionPersistenceKey}
          />
        </section>

        <div
          className={`learning-workspace__curriculum-column ${curriculumCollapsed ? "is-collapsed" : ""}`}
        >
          <div
            className="learning-curriculum__resize-rail"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize course curriculum"
            aria-keyshortcuts="Control+Alt+C Meta+Alt+C"
            title={`Resize course content | ${curriculumShortcutLabel}`}
            aria-valuemin={CURRICULUM_MIN_WIDTH}
            aria-valuemax={CURRICULUM_MAX_WIDTH}
            aria-valuenow={
              curriculumCollapsed
                ? undefined
                : Math.round(curriculumAccessibleWidth)
            }
            aria-valuetext={
              curriculumCollapsed
                ? "Course curriculum collapsed"
                : `${Math.round(curriculumAccessibleWidth)} pixels wide${
                    curriculumResizing &&
                    curriculumViewportWidth < CURRICULUM_MIN_WIDTH
                      ? ", sliding closed"
                      : ""
                  }`
            }
            tabIndex={0}
            onKeyDown={handleCurriculumResizeKeyDown}
            onDoubleClick={toggleCurriculumFromResizeRail}
            onPointerDown={startCurriculumResize}
            onPointerMove={moveCurriculumResize}
            onPointerUp={endCurriculumResize}
            onPointerCancel={(event) => endCurriculumResize(event, true)}
          />
          <div
            id="learning-course-content"
            className="learning-curriculum__viewport"
          >
            <Curriculum
              scrollportRef={curriculumScrollportRef}
              scrollportId="learning-course-curriculum-scrollport"
              selectedLesson={selectedLesson}
              onSelectLesson={selectLesson}
              courseTitle={courseTitle}
              courseThumbnail={courseThumbnail}
              focusRequest={curriculumFocusRequest}
              persistenceKey={coursePersistenceKey}
            />
          </div>
        </div>
      </main>

      <FloatingScrollbar
        scrollportRef={curriculumScrollportRef}
        ariaControls="learning-course-curriculum-scrollport"
        ariaLabel="Course curriculum scroll position"
        className="floating-scrollbar--curriculum"
        disabled={curriculumCollapsed || theaterMode || lessonDrawer}
      />

      {lessonDrawer && (
        <div
          ref={lessonDialogRef}
          className="lesson-drawer-shell"
          role="dialog"
          aria-modal="true"
          aria-label="Course lessons"
        >
          <button
            type="button"
            aria-label="Close lesson list"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeLessonDrawer}
            className="lesson-drawer-backdrop"
          />
          <div className="lesson-drawer-panel">
            <Curriculum
              scrollportRef={lessonDrawerScrollportRef}
              scrollportId="lesson-drawer-curriculum-scrollport"
              selectedLesson={selectedLesson}
              onSelectLesson={selectLesson}
              courseTitle={courseTitle}
              courseThumbnail={courseThumbnail}
              focusRequest={curriculumFocusRequest}
              persistenceKey={coursePersistenceKey}
              onClose={closeLessonDrawer}
            />
          </div>
          <FloatingScrollbar
            scrollportRef={lessonDrawerScrollportRef}
            ariaControls="lesson-drawer-curriculum-scrollport"
            ariaLabel="Course curriculum scroll position"
            className="floating-scrollbar--curriculum"
          />
        </div>
      )}
    </div>
  );
}
