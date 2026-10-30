import { useState, type RefObject } from "react";
import type { ReactNode } from "react";
import type { CourseRole } from "../../courses/catalogue";
import { useMobileProfileDrawerSize } from "../useMobileProfileDrawerSize";
import type { NavigationItemWithMetadata } from "../navigation";
import type { SidebarDockItem } from "../../settings/settingsPreferences";
import { MOBILE_DRAWER_INITIAL_SNAP_POINT } from "../academyShellConstants";
import type { CoursesPageRenderContext } from "../academyShellTypes";
import { getSurfacePageKey } from "../academyShellGeometry";

export interface UseLessonBackgroundPageArgs {
  cataloguePathname: string;
  learningBackground: {
    courseSlug?: string;
    discussionTab?: string;
    page: string;
    pathname?: string;
    scrollLeft: number;
    scrollTop: number;
    section?: string;
    settingsTab?: string;
  } | null;
  learningOriginSection: string | null;
  page: string;
  renderMain: ((context: CoursesPageRenderContext) => ReactNode) | null;
  requestedSection: string | null;
  sidebarDockItems: SidebarDockItem[];
  mobileMenuOpen: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  canSwitchWorkspace: boolean;
  effectiveRole: CourseRole;
  mobileSheetRef: RefObject<HTMLDivElement | null>;
}

export interface UseLessonBackgroundPageResult {
  isLearningSurface: boolean;
  keepLessonPageBoxes: boolean;
  onDeepGround: boolean;
  mobileSheetSizeRef: (element: HTMLDivElement | null) => void;
  mobileMenuContentSnapPoint: number;
  activeNavigationSection: string | null;
  isNavigationItemActive: (item: NavigationItemWithMetadata) => boolean;
}

export function useLessonBackgroundPage({
  cataloguePathname,
  learningBackground,
  learningOriginSection,
  page,
  renderMain,
  requestedSection,
  sidebarDockItems,
  mobileMenuOpen,
  isAuthenticated,
  isAdmin,
  canSwitchWorkspace,
  effectiveRole,
  mobileSheetRef,
}: UseLessonBackgroundPageArgs): UseLessonBackgroundPageResult {
  const isLearningSurface = Boolean(renderMain);
  // A page that a minimized lesson hands over to keeps the two boxes it was
  // drawn in behind the player (the grid it shared with the lesson, and its
  // own box in that grid), only without what made it a still picture behind
  // the lesson. Turned into the plain `display: contents` boxes a page
  // otherwise has, the browser rebuilt the whole page, and a phone then drew
  // the home page's picture, its laptop screen and the copy over them as
  // blanks for a frame. It keeps them until another page is shown.
  const routePageKey = getSurfacePageKey(page, cataloguePathname);
  const lessonBackgroundPageKey =
    renderMain && learningBackground
      ? getSurfacePageKey(learningBackground.page, learningBackground.pathname)
      : null;
  const [pageKeptFromLesson, setPageKeptFromLesson] = useState<string | null>(
    null,
  );
  if (
    lessonBackgroundPageKey !== null &&
    pageKeptFromLesson !== lessonBackgroundPageKey
  ) {
    setPageKeptFromLesson(lessonBackgroundPageKey);
  } else if (
    !renderMain &&
    pageKeptFromLesson !== null &&
    pageKeptFromLesson !== routePageKey
  ) {
    setPageKeptFromLesson(null);
  }
  const keepLessonPageBoxes =
    !renderMain && pageKeptFromLesson === routePageKey;
  // Every page's cards are the shared `ElevatedCard`, a lighter pane on a
  // ground deeper than the frame's. A lesson's page is the exception: its
  // scroller lies over the shell's own surfaces and its panels keep theirs.
  const onDeepGround = !renderMain;
  const { ref: mobileSheetSizeRef, snapPoint: mobileMenuContentSnapPoint } =
    useMobileProfileDrawerSize({
      open: mobileMenuOpen,
      popupRef: mobileSheetRef,
      initialSnapPoint: MOBILE_DRAWER_INITIAL_SNAP_POINT,
      contentKey: `${isAuthenticated}:${canSwitchWorkspace}:${effectiveRole}:${sidebarDockItems.length}`,
    });
  const activeNavigationSection = isLearningSurface
    ? learningOriginSection
    : (requestedSection ??
      (page === "home"
        ? effectiveRole === "creator" && !isAdmin
          ? "Dashboard"
          : "Home"
        : page === "courses"
          ? "Courses"
          : null));
  const isNavigationItemActive = (item: NavigationItemWithMetadata) => {
    const label = item[0];
    return (
      activeNavigationSection === label ||
      (label === "Notifications" && activeNavigationSection === "Notification")
    );
  };
  return {
    isLearningSurface,
    keepLessonPageBoxes,
    onDeepGround,
    mobileSheetSizeRef,
    mobileMenuContentSnapPoint,
    activeNavigationSection,
    isNavigationItemActive,
  };
}
