import { Suspense, type Dispatch, type SetStateAction, type JSX } from "react";
import type { GuestHomePageResponse } from "@veolms/contracts";
import type { ToastMessage } from "../ToastNotification";
import type { LearningCourse } from "../StudentPages";
import type { Course, CourseOpenOptions } from "../courses/catalogue";
import { CreatorDashboardSkeleton } from "../home/creator/CreatorDashboardSkeleton";
import { LearnerHomeShell } from "../home/learner/LearnerHomeSkeleton";
import { GUEST_HOME_CHUNK_URL_PLACEHOLDER } from "../routing/routeChunkPreloads";
import { ChunkStylesheets } from "../routing/ChunkStylesheets";
import { guestHeroImage } from "../home/guest/guestHeroImage";
import type { NavigateTo } from "../routing/navigation";
import {
  GUEST_HOME_CSS_URLS,
  GUEST_HOME_JS_URLS,
} from "./academyRouteChunkUrls";
import { AuthenticatedHomeBoundary, GuestHome } from "./academyLazyPages";
import { AcademyPageFallback } from "./academyPageFallbacks";
import {
  guestHomePreviewClasses,
  learnerHomePendingClasses,
  dashboardHomePendingClasses,
} from "./academyShellClasses";

export interface LearnerHomeContentProps {
  showGuestHomePreview: boolean;
  isAuthReady: boolean;
  onNavigatePage: NavigateTo;
  guestHomeCourseCardActions: {
    wishlisted: ReadonlySet<string>;
    onWishlist: (course: Pick<Course, "id" | "slug">) => void;
    onOpenCourse: (
      course: Course | LearningCourse,
      options?: CourseOpenOptions,
    ) => void;
    courseMenu: string | null;
    setCourseMenu: Dispatch<SetStateAction<string | null>>;
    setNotice: Dispatch<SetStateAction<ToastMessage | null>>;
  };
  initialGuestHomePage: GuestHomePageResponse | undefined;
  initialGuestHomeCopy: GuestHomePageResponse | undefined;
  showGuestHomeWhilePending: boolean;
  learnerWasNotEnrolled: boolean;
  newLearnerHome: JSX.Element;
  justSignedInHome: JSX.Element | undefined;
  shellProfileKnownName: string | undefined;
  onOpenCourse: (
    course: Course | LearningCourse,
    options?: CourseOpenOptions,
  ) => void;
}

export function LearnerHomeContent({
  showGuestHomePreview,
  isAuthReady,
  onNavigatePage,
  guestHomeCourseCardActions,
  initialGuestHomePage,
  initialGuestHomeCopy,
  showGuestHomeWhilePending,
  learnerWasNotEnrolled,
  newLearnerHome,
  justSignedInHome,
  shellProfileKnownName,
  onOpenCourse,
}: LearnerHomeContentProps) {
  // prettier-ignore
  return (
    <Suspense fallback={<AcademyPageFallback />}>
      {/* Having the lazy guest-home chunk preloaded by the document
              keeps React from discarding the prerendered markup (and
              flashing the fallback) when a state update lands before the
              chunk would otherwise have downloaded. Its feature stylesheets
              are linked too: the prerendered guest-home markup must not
              paint before the CSS that styles it. */}
      <link rel="modulepreload" href={GUEST_HOME_CHUNK_URL_PLACEHOLDER} />
      {GUEST_HOME_JS_URLS.map((href) => (
        <link key={href} rel="modulepreload" href={href} />
      ))}
      <ChunkStylesheets hrefs={GUEST_HOME_CSS_URLS} />
      {/* The hero picture, where a visitor's home draws it: on a page of
              50rem and wider, which beside the sidebar's 88px rail is a
              window from about 888px (see GuestHomeHero; narrower, the
              visitor is shown no picture). A signed-in learner's hero is
              drawn after the session has answered, by when a preload is
              no earlier than the picture itself. */}
      <link
        rel="preload"
        as="image"
        media="(min-width: 888px)"
        href={guestHeroImage.wide.src}
        imageSrcSet={guestHeroImage.wide.srcSet}
        imageSizes={guestHeroImage.wide.sizes}
        fetchPriority="high"
      />
      {showGuestHomePreview ? (
        // Paint the seeded guest home while the session check runs so
        // the prerendered document carries real content (and the LCP
        // image) instead of a blank fallback. This is also the
        // prerendered markup, so a browser that was signed in last
        // time hides it from the first paint (data-session-hint, set
        // by the head bootstrap) and shows the learner's home with
        // its placeholders instead.
        // A guest keeps this exact element once the check answers:
        // rendering it from a different place in the tree would make
        // React rebuild the whole page that is already on screen.
        <>
          <div
            className={
              // Once the session check is in, this is a visitor's
              // page and is shown whatever the browser remembered. A
              // check that failed (the API not answering) leaves the
              // remembered session in place, and the page was blank.
              isAuthReady
                ? "guest-home-preview contents"
                : guestHomePreviewClasses
            }
          >
            <GuestHome
              onNavigatePage={onNavigatePage}
              courseCardActions={guestHomeCourseCardActions}
              initialPage={initialGuestHomePage}
              initialCopy={initialGuestHomeCopy}
            />
          </div>
          {isAuthReady ? null : (
            <>
              <div className={learnerHomePendingClasses}>
                {/* A reload puts the learner's home back here as it was
                    last drawn, before the first paint, and the placeholders
                    after it are not shown (see learnerHomeSnapshot.ts).
                    React leaves what is put here alone while hydrating. */}
                <div
                  data-learner-home-snapshot=""
                  className="contents"
                  suppressHydrationWarning
                  dangerouslySetInnerHTML={{ __html: "" }}
                />
                <div data-learner-home-shell="" className="contents">
                  <LearnerHomeShell pictureWhenShown />
                </div>
              </div>
              <div className={dashboardHomePendingClasses}>
                <CreatorDashboardSkeleton />
              </div>
            </>
          )}
        </>
      ) : !isAuthReady && showGuestHomeWhilePending ? (
        // Nothing says whose home this is yet, and there is no guest
        // home to show meanwhile.
        <AcademyPageFallback />
      ) : (
        // Signed in, or signed in last time and waiting for the session
        // check: the learner's home either way, from the same place in
        // the tree, so it is put up once and filled in as the answers
        // come. Its picture and everything that is the same for every
        // learner are there from the start.
        <Suspense
          fallback={
            // While the home's own code loads. A learner who had no
            // courses last time gets their home here already.
            learnerWasNotEnrolled
              ? newLearnerHome
              : (justSignedInHome ?? (
                  <LearnerHomeShell
                    learnerName={shellProfileKnownName ?? ""}
                  />
                ))
          }
        >
          <AuthenticatedHomeBoundary
            onOpenCourse={onOpenCourse}
            onNavigatePage={onNavigatePage}
            // The name this tab remembers stands in until the session
            // answers, so the greeting is its full width from the start
            // (the quote under it wraps to that width).
            learnerName={shellProfileKnownName?.trim() ?? ""}
            courseCardActions={guestHomeCourseCardActions}
            sessionPending={!isAuthReady}
            notEnrolledContent={newLearnerHome}
            pendingContent={justSignedInHome}
          />
        </Suspense>
      )}
    </Suspense>
  );
}
