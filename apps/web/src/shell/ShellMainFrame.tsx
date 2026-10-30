import type { RefObject } from "react";
import type { ReactNode, Ref } from "react";
import { deepGroundClasses } from "../components/ElevatedCard";
import { LongScrollElasticScroller } from "../components/elastic-scroller";
import { usePageScrollportRef } from "../components/elastic-scroller/pageScrollport";
import type { CourseRole } from "../courses/catalogue";
import { AcademyRouteSkeleton } from "../routing/AcademyRouteSkeleton";
import { FrameEdge } from "./FrameEdge";
import { LearningBackgroundSurface } from "../learning/LearningBackgroundSurface";
import type { CoursesPageRenderContext } from "./academyShellTypes";

export interface ShellMainFrameProps {
  mainScrollportRef: RefObject<HTMLElement | null>;
  onDeepGround: boolean;
  renderMain: ((context: CoursesPageRenderContext) => ReactNode) | null;
  page: string;
  mobileSidebarNavigationActive: boolean;
  cataloguePathname: string;
  learningMotionStageRef: Ref<HTMLDivElement> | undefined;
  keepLessonPageBoxes: boolean;
  routeContentBlocked: boolean;
  effectiveRole: CourseRole;
  /** For the analytics page's loading frame: which sections, which one open. */
  isAdmin?: boolean;
  analyticsTab?: string;
  quizId: string | undefined;
  learningBackground: {
    courseSlug?: string;
    discussionTab?: string;
    page: string;
    pathname?: string;
    scrollLeft: number;
    scrollTop: number;
    section?: string;
    settingsTab?: string;
    platformTab?: string;
    analyticsTab?: string;
  } | null;
  renderPageContent: ({
    surfaceCourseSlug,
    surfaceDiscussionTab,
    surfacePage,
    surfaceSection,
    surfaceSettingsTab,
    surfacePlatformTab,
    surfaceUsername,
  }?: {
    surfaceCourseSlug?: string;
    surfaceDiscussionTab?: string;
    surfacePage?: string;
    surfaceSection?: string | null;
    surfaceSettingsTab?: string;
    surfacePlatformTab?: string;
    surfaceAnalyticsTab?: string;
    surfaceUsername?: string;
  }) => ReactNode;
  routeContentHeld: boolean;
  compactNavigation: boolean;
  mobileBottomNavHidden: boolean;
}

export function ShellMainFrame({
  mainScrollportRef,
  onDeepGround,
  renderMain,
  page,
  mobileSidebarNavigationActive,
  cataloguePathname,
  learningMotionStageRef,
  keepLessonPageBoxes,
  routeContentBlocked,
  effectiveRole,
  isAdmin = false,
  analyticsTab,
  quizId,
  learningBackground,
  renderPageContent,
  routeContentHeld,
  compactNavigation,
  mobileBottomNavHidden,
}: ShellMainFrameProps) {
  // On a phone the document scrolls, not the main box (see
  // `usePageScrollportRef`); the control is set up again when that changes.
  const pageScrollportRef = usePageScrollportRef(mainScrollportRef);
  // prettier-ignore
  return (
    <div className="courses-main-frame">
      <main
        id="courses-main-scrollport"
        ref={mainScrollportRef}
        // Tells a page's cards which ground they lie on (see
        // `ElevatedCard`).
        data-deep-ground={onDeepGround ? "" : undefined}
        className={[
          "courses-main",
          // While the page is being scrolled nothing in it answers the
          // pointer, so nothing changes its hover look as it passes under
          // a resting pointer (see useScrollingMark).
          "data-scrolling:**:pointer-events-none!",
          // The frame's own colour, painted by the scroller as well. On a
          // screen scaled under 150% the browser only slides a scroller's
          // content when the scroller has a solid ground of its own to
          // draw text on; over a see-through one it redrew the page at
          // every step of a scroll. The frame behind is this same colour,
          // so nothing looks different. Not on a lesson's page, whose
          // scroller lies over the shell's own surfaces.
          renderMain
            ? ""
            : onDeepGround
              ? // These pages lie on a deeper ground than the others, so
                // that their cards stand out from it the way the pinned
                // course stands out from the home page's picture.
                // The ground is kept in `--card-ground`, which the boxes
                // read to set themselves one fixed step lighter (see
                // `ElevatedCard`), and is solid, as the note above
                // requires. By night it is the frame's colour taken part
                // of the way to the shell's. By day the frame is already
                // close to white, with no room above it for a lighter
                // box, so the ground is the frame's colour made a fixed
                // step darker instead; the plain mix is what a browser
                // without relative colours falls back to.
                deepGroundClasses
              : "in-data-[content-layout=framed]:bg-(--main-surface)!",
          renderMain
            ? "courses-main--learning overflow-x-clip!"
            : page !== "courses"
              ? "student-surface-main"
              : "",
          !renderMain && page === "courses" ? "max-[640px]:px-0!" : "",
          !renderMain &&
          (page === "settings" || page === "platform" || page === "analytics")
            ? "courses-main--settings"
            : "",
          mobileSidebarNavigationActive
            ? renderMain
              ? "max-[640px]:pb-0!"
              : "max-[640px]:pb-4!"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Long pages only (lists of students, orders, discussions, a
              lesson's comments): a page that scrolls a little gets none.
              A lesson's page counts as long sooner, since its video stays
              in view and leaves less room to read in. */}
        <LongScrollElasticScroller
          key={compactNavigation ? "page" : "main"}
          scrollportRef={pageScrollportRef}
          ariaControls="courses-main-scrollport"
          scrollAreaLabel="Page"
          contentRevision={`${page}:${cataloguePathname}`}
          // Above the lesson video, which stays in view over this page:
          // the control stretches up over it while it is dragged.
          className="z-45!"
          // The lesson page says where it goes (it depends on how much of
          // the video is showing); see LearningWorkspace. Every other page
          // puts it about where the lesson page has it with the video at
          // full height: between the description and the comments, some
          // 200px up from the bottom, and lower on a short window.
          bottomClearance={
            renderMain
              ? "var(--learning-elastic-scroller-clearance, 268px)"
              : "clamp(96px, 28dvh, 200px)"
          }
          minScrollScreens={renderMain ? 1 : 2}
        />
        <div
          ref={learningMotionStageRef}
          className={
            renderMain || keepLessonPageBoxes
              ? "grid min-h-full [&>*]:col-start-1 [&>*]:row-start-1"
              : "contents"
          }
          data-learning-motion-stage={renderMain ? "" : undefined}
        >
          {renderMain ? (
            routeContentBlocked ? (
              <AcademyRouteSkeleton
                page={page}
                role={effectiveRole}
                quizId={quizId}
                isAdmin={isAdmin}
                analyticsTab={analyticsTab}
              />
            ) : learningBackground ? (
              <LearningBackgroundSurface
                behindLesson
                className={
                  learningBackground.page === "courses"
                    ? "max-[640px]:px-0!"
                    : learningBackground.page === "settings" ||
                        learningBackground.page === "platform" ||
                        learningBackground.page === "analytics"
                      ? "student-surface-main courses-main--settings"
                      : "student-surface-main"
                }
                scrollLeft={learningBackground.scrollLeft}
                scrollTop={learningBackground.scrollTop}
              >
                {renderPageContent({
                  surfaceCourseSlug: learningBackground.courseSlug,
                  surfaceDiscussionTab: learningBackground.discussionTab,
                  surfacePage: learningBackground.page,
                  surfaceSection: learningBackground.section,
                  surfaceSettingsTab: learningBackground.settingsTab,
                  surfacePlatformTab: learningBackground.platformTab,
                  surfaceAnalyticsTab: learningBackground.analyticsTab,
                })}
              </LearningBackgroundSurface>
            ) : null
          ) : routeContentHeld ? (
            <AcademyRouteSkeleton
              page={page}
              role={effectiveRole}
              quizId={quizId}
              isAdmin={isAdmin}
              analyticsTab={analyticsTab}
            />
          ) : (
            // The same element as the page behind the lesson above, so a
            // minimize that lands on this page keeps it as it is.
            <LearningBackgroundSurface
              behindLesson={false}
              keepBox={keepLessonPageBoxes}
            >
              {renderPageContent()}
            </LearningBackgroundSurface>
          )}
          {renderMain && !routeContentBlocked ? (
            <div className="relative min-h-full">
              {renderMain({
                mobileBottomNavigation:
                  compactNavigation && !mobileSidebarNavigationActive,
                mobileBottomNavigationHidden: mobileBottomNavHidden,
              })}
            </div>
          ) : null}
        </div>
      </main>
      <FrameEdge surface="lesson" />
    </div>
  );
}
