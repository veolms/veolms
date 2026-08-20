import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation, useMatches, useNavigate } from "react-router";
import { CoursesPage } from "../CoursesPage";
import type { Course } from "../courses/catalogue";
import type { LearningCourse } from "../StudentPages";
import {
  discardPendingCourseCommentDraft,
  getActiveCoursePlayerSession,
  getCoursePlayerOrigin,
  getCoursePlayerOriginFromPathname,
  getPendingCourseCommentDraft,
  getResumableCoursePlayerNavigationPath,
  getCoursePlayerSection,
  postPendingCourseCommentDraft,
  rememberCoursePlayerDestination,
} from "../learning/coursePlayerNavigation";
import type {
  CoursePlayerOrigin,
  PendingCourseCommentDraft,
} from "../learning/coursePlayerNavigation";
import { LearningSessionConflictDialog } from "../learning/LearningSessionConflictDialog";
import { getCourseTitle } from "../learning/courseMetadata";
import type { NavigateTo } from "../routing/navigation";
import {
  getInitialNavigationOrder,
  getNavigationDestination,
  getOrderedNavigation,
} from "../shell/navigation";
import {
  readApplicationScrollPosition,
  scrollApplicationTo,
} from "../shell/applicationScroll";
import { getInitialSidebarPreferences } from "../shell/sidebarPreferences";
import { normalizeSidebarDockItems } from "../settings/settingsPreferences";
import {
  getNumberShortcutIndex,
  isEditingShortcutTarget,
} from "../keyboardShortcuts";
import {
  getDestinationPath,
  getMatchedRouteDescriptor,
  normalizeNavigationPath,
} from "../routing/routeDescriptors";

export interface AcademyOutletContext {
  navigateTo: NavigateTo;
}

interface PendingCourseOpen {
  course: Course | LearningCourse;
  origin: CoursePlayerOrigin;
  draft: PendingCourseCommentDraft;
  currentCourseTitle: string;
}

const isSettingsPath = (path: string) => {
  const pathname = normalizeNavigationPath(path.split(/[?#]/, 1)[0] || "/");
  return pathname === "/settings" || pathname.startsWith("/settings/");
};

export default function AcademyLayout() {
  const matches = useMatches();
  const location = useLocation();
  const navigate = useNavigate();
  const preservedScrollPositionRef = useRef<{
    left: number;
    top: number;
  } | null>(null);
  const locationPathRef = useRef(`${location.pathname}${location.search}`);
  const settingsReturnLocationRef = useRef({
    path: "/",
    left: 0,
    top: 0,
  });
  const numberNavigationTimerRef = useRef<number | null>(null);
  const [pendingCourseOpen, setPendingCourseOpen] =
    useState<PendingCourseOpen | null>(null);
  const currentLocationPath = `${location.pathname}${location.search}`;
  const route = getMatchedRouteDescriptor(matches, location.pathname);
  const coursePlayerOrigin = getCoursePlayerOrigin(location.search);

  useLayoutEffect(() => {
    locationPathRef.current = currentLocationPath;
    if (!isSettingsPath(currentLocationPath)) {
      settingsReturnLocationRef.current.path = currentLocationPath;
    }
  }, [currentLocationPath]);

  useEffect(() => {
    const pathname = normalizeNavigationPath(location.pathname);
    const destination =
      pathname === "/my-learning"
        ? "/my-courses"
        : pathname === "/courses"
          ? "/explore-courses"
          : null;
    if (destination)
      void navigate(`${destination}${location.search}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useLayoutEffect(() => {
    const position = preservedScrollPositionRef.current;
    if (!position) return undefined;
    preservedScrollPositionRef.current = null;

    scrollApplicationTo({ ...position, behavior: "auto" });
    const frame = window.requestAnimationFrame(() => {
      scrollApplicationTo({ ...position, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname]);

  const navigateTo: NavigateTo = useCallback(
    (destination, options) => {
      const destinationPath = getDestinationPath(destination);
      const path = getResumableCoursePlayerNavigationPath(destinationPath);
      if (isSettingsPath(path) && !isSettingsPath(locationPathRef.current)) {
        const currentScrollPosition = readApplicationScrollPosition();
        settingsReturnLocationRef.current = {
          path: locationPathRef.current,
          ...currentScrollPosition,
        };
      }
      if (
        normalizeNavigationPath(path) !==
        normalizeNavigationPath(locationPathRef.current)
      ) {
        if (options?.preserveScroll) {
          preservedScrollPositionRef.current = readApplicationScrollPosition();
        }
        // Update synchronously so a second shortcut pressed before React's
        // route render still compares against the destination just requested.
        locationPathRef.current = path;
        void navigate(path, {
          preventScrollReset: options?.preserveScroll,
        });
      }
      if (!options?.preserveScroll) {
        scrollApplicationTo({ top: 0, behavior: "auto" });
      }
    },
    [navigate],
  );
  const navigateToRef = useRef(navigateTo);
  useLayoutEffect(() => {
    navigateToRef.current = navigateTo;
  }, [navigateTo]);
  const exitSettings = useCallback(() => {
    const destination = settingsReturnLocationRef.current;
    preservedScrollPositionRef.current = {
      left: destination.left,
      top: destination.top,
    };
    locationPathRef.current = destination.path;
    void navigate(destination.path, { preventScrollReset: true });
  }, [navigate]);

  useEffect(() => {
    const navigateByNumber = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        isEditingShortcutTarget(event.target)
      )
        return;
      const index = getNumberShortcutIndex(event);
      if (index === null) return;

      const role = localStorage.getItem("veolms-role") || "student";
      const orderedNavigation = getOrderedNavigation(
        role,
        getInitialNavigationOrder(role),
      ).filter(
        ([label]) =>
          label !== "Settings" ||
          !normalizeSidebarDockItems(
            getInitialSidebarPreferences().dockItems,
          ).includes("settings"),
      );
      const destination = orderedNavigation[index];
      if (!destination) return;

      event.preventDefault();
      if (numberNavigationTimerRef.current !== null) {
        window.clearTimeout(numberNavigationTimerRef.current);
      }
      numberNavigationTimerRef.current = window.setTimeout(() => {
        navigateToRef.current(getNavigationDestination(destination[0]));
        numberNavigationTimerRef.current = null;
      }, 60);
    };

    window.addEventListener("keydown", navigateByNumber, true);
    return () => {
      window.removeEventListener("keydown", navigateByNumber, true);
      if (numberNavigationTimerRef.current !== null) {
        window.clearTimeout(numberNavigationTimerRef.current);
      }
    };
  }, []);

  const commitCourseOpen = useCallback(
    (course: Course | LearningCourse, origin: CoursePlayerOrigin) => {
      localStorage.setItem("veolms-current-course-title", course.title);
      localStorage.setItem("veolms-current-course-id", course.id);
      const path = rememberCoursePlayerDestination(course.id, origin);
      navigateTo(path);
    },
    [navigateTo],
  );

  const openCourse = useCallback(
    (course: Course | LearningCourse) => {
      const origin = getCoursePlayerOriginFromPathname(location.pathname);
      const activeSession = getActiveCoursePlayerSession();
      if (activeSession && activeSession.courseId !== course.id) {
        const draft = getPendingCourseCommentDraft(activeSession);
        if (draft) {
          setPendingCourseOpen({
            course,
            origin,
            draft,
            currentCourseTitle: getCourseTitle(activeSession.courseId),
          });
          return;
        }
      }
      commitCourseOpen(course, origin);
    },
    [commitCourseOpen, location.pathname],
  );

  return (
    <>
      <CoursesPage
        page={route.page}
        section={
          route.kind === "learning"
            ? getCoursePlayerSection(coursePlayerOrigin)
            : route.section
        }
        settingsTab={route.settingsTab}
        discussionTab={route.discussionTab}
        onNavigatePage={navigateTo}
        onExitSettings={exitSettings}
        onOpenCourse={openCourse}
        renderMain={
          route.kind === "learning"
            ? () => (
                <Outlet
                  context={{ navigateTo } satisfies AcademyOutletContext}
                />
              )
            : null
        }
      />
      {pendingCourseOpen && (
        <LearningSessionConflictDialog
          currentCourseTitle={pendingCourseOpen.currentCourseTitle}
          nextCourseTitle={pendingCourseOpen.course.title}
          draftText={pendingCourseOpen.draft.text}
          onCancel={() => setPendingCourseOpen(null)}
          onDiscard={() => {
            discardPendingCourseCommentDraft(pendingCourseOpen.draft);
            commitCourseOpen(
              pendingCourseOpen.course,
              pendingCourseOpen.origin,
            );
            setPendingCourseOpen(null);
          }}
          onPost={() => {
            postPendingCourseCommentDraft(pendingCourseOpen.draft);
            commitCourseOpen(
              pendingCourseOpen.course,
              pendingCourseOpen.origin,
            );
            setPendingCourseOpen(null);
          }}
        />
      )}
    </>
  );
}
